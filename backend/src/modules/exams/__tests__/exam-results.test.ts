import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockExamFind,
  mockSubjectFind,
  mockStudentFind,
  mockUserRoleFind,
  mockResultUpsert,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockExamFind: vi.fn(),
  mockSubjectFind: vi.fn(),
  mockStudentFind: vi.fn(),
  mockUserRoleFind: vi.fn(),
  mockResultUpsert: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock("../../../db/client.js", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        examSubject: { upsert: vi.fn().mockResolvedValue({ id: "es-1" }) },
        examResult: { upsert: mockResultUpsert },
        auditLog: { create: mockAuditCreate },
      })
    ),
    exam: { findUnique: mockExamFind },
    subject: { findUnique: mockSubjectFind },
    studentProfile: { findMany: mockStudentFind },
    userRole: { findMany: mockUserRoleFind },
    examResult: { upsert: mockResultUpsert },
    auditLog: { create: mockAuditCreate },
  },
}));

import { recordExamResults, ExamValidationError } from "../exams.service.js";

describe("Exam Results Hardening and Validation", () => {

  beforeEach(() => {
    mockExamFind.mockReset();
    mockSubjectFind.mockReset();
    mockStudentFind.mockReset();
    mockUserRoleFind.mockReset();
    mockResultUpsert.mockReset();
    mockAuditCreate.mockReset();

    mockResultUpsert.mockImplementation(async ({ create }: { create: unknown }) => create);
    mockAuditCreate.mockResolvedValue({});

    // Default to an unscoped admin/principal role for basic validation tests
    mockUserRoleFind.mockResolvedValue([
      {
        classId: null,
        sectionId: null,
        subjectId: null,
        role: { rolePermissions: [{ permission: { key: "grades:enter" } }] },
      },
    ]);
  });

  it("REJECTS exam result recording if missing authenticated user identity", async () => {
    await expect(
      recordExamResults(
        {
          examId: "exam-1",
          subjectId: "subj-1",
          results: [{ studentProfileId: "s-1", marksObtained: 80, maxMarks: 100 }],
        },
        ""
      )
    ).rejects.toThrow(ExamValidationError);
  });

  it("REJECTS exam result recording if the exam does not exist", async () => {
    mockExamFind.mockResolvedValue(null);

    await expect(
      recordExamResults(
        {
          examId: "nonexistent-exam",
          subjectId: "subj-1",
          results: [{ studentProfileId: "s-1", marksObtained: 80, maxMarks: 100 }],
        },
        "admin-user"
      )
    ).rejects.toThrow(ExamValidationError);
  });

  it("REJECTS marksObtained greater than maxMarks", async () => {
    mockExamFind.mockResolvedValue({ id: "exam-1" });
    mockSubjectFind.mockResolvedValue({ id: "subj-1" });
    mockStudentFind.mockResolvedValue([{ id: "s-1", classId: "c-1", sectionId: "sec-1" }]);

    await expect(
      recordExamResults(
        {
          examId: "exam-1",
          subjectId: "subj-1",
          results: [{ studentProfileId: "s-1", marksObtained: 150, maxMarks: 100 }],
        },
        "admin-user"
      )
    ).rejects.toThrow(ExamValidationError);
  });

  it("REJECTS negative marksObtained", async () => {
    mockExamFind.mockResolvedValue({ id: "exam-1" });
    mockSubjectFind.mockResolvedValue({ id: "subj-1" });
    mockStudentFind.mockResolvedValue([{ id: "s-1", classId: "c-1", sectionId: "sec-1" }]);

    await expect(
      recordExamResults(
        {
          examId: "exam-1",
          subjectId: "subj-1",
          results: [{ studentProfileId: "s-1", marksObtained: -5, maxMarks: 100 }],
        },
        "admin-user"
      )
    ).rejects.toThrow(ExamValidationError);
  });

  it("REJECTS student profiles that do not exist in the database", async () => {
    mockExamFind.mockResolvedValue({ id: "exam-1" });
    mockSubjectFind.mockResolvedValue({ id: "subj-1" });
    mockStudentFind.mockResolvedValue([]);

    await expect(
      recordExamResults(
        {
          examId: "exam-1",
          subjectId: "subj-1",
          results: [{ studentProfileId: "missing-student", marksObtained: 50, maxMarks: 100 }],
        },
        "admin-user"
      )
    ).rejects.toThrow(ExamValidationError);
  });

  it("REJECTS a scoped teacher trying to enter marks for a student outside their assigned class/subject", async () => {
    mockExamFind.mockResolvedValue({ id: "exam-1" });
    mockSubjectFind.mockResolvedValue({ id: "physics-id" });
    mockStudentFind.mockResolvedValue([{ id: "student-grade-10", classId: "grade-10", sectionId: "sec-a" }]);

    // Teacher scoped to Grade 9 Physics
    mockUserRoleFind.mockResolvedValue([
      {
        classId: "grade-9",
        sectionId: null,
        subjectId: "physics-id",
        role: { rolePermissions: [{ permission: { key: "grades:enter" } }] },
      },
    ]);

    await expect(
      recordExamResults(
        {
          examId: "exam-1",
          subjectId: "physics-id",
          results: [{ studentProfileId: "student-grade-10", marksObtained: 85, maxMarks: 100 }],
        },
        "scoped-teacher"
      )
    ).rejects.toThrow(ExamValidationError);
  });

  it("UPSERTS valid exam results successfully for authorized scoped teacher", async () => {
    mockExamFind.mockResolvedValue({ id: "exam-1" });
    mockSubjectFind.mockResolvedValue({ id: "physics-id" });
    mockStudentFind.mockResolvedValue([{ id: "student-grade-10", classId: "grade-10", sectionId: "sec-a" }]);

    // Teacher scoped to Grade 10 Physics
    mockUserRoleFind.mockResolvedValue([
      {
        classId: "grade-10",
        sectionId: null,
        subjectId: "physics-id",
        role: { rolePermissions: [{ permission: { key: "grades:enter" } }] },
      },
    ]);

    const results = await recordExamResults(
      {
        examId: "exam-1",
        subjectId: "physics-id",
        results: [{ studentProfileId: "student-grade-10", marksObtained: 92, maxMarks: 100, grade: "A+" }],
      },
      "scoped-teacher"
    );

    expect(results).toHaveLength(1);
    expect(mockResultUpsert).toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "scoped-teacher",
          action: "exams:record_results",
        }),
      })
    );
  });
});
