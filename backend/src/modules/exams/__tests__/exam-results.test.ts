import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    exam: { findUnique: vi.fn() },
    subject: { findUnique: vi.fn() },
    studentProfile: { findMany: vi.fn() },
    userRole: { findMany: vi.fn() },
    examResult: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { recordExamResults, ExamValidationError } from "../exams.service.js";

const mockExamFind = prisma.exam.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockSubjectFind = prisma.subject.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockStudentFind = prisma.studentProfile.findMany as unknown as ReturnType<typeof vi.fn>;
const mockUserRoleFind = prisma.userRole.findMany as unknown as ReturnType<typeof vi.fn>;
const mockResultUpsert = prisma.examResult.upsert as unknown as ReturnType<typeof vi.fn>;
const mockAuditCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;

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
