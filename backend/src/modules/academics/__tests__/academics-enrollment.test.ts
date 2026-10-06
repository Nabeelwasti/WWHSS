import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
    class: { findUnique: vi.fn() },
    studentEnrollmentHistory: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    studentProfile: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(prisma)),
  },
}));

import { prisma } from "../../../db/client.js";
import { enrollStudent, AcademicsValidationError } from "../academics.service.js";

const mockUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockSectionFind = prisma.section.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockStudentCreate = prisma.studentProfile.create as unknown as ReturnType<typeof vi.fn>;
const mockClassFind = prisma.class.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("Academics Student Enrollment Validation", () => {
  beforeEach(() => {
    mockUserFind.mockReset();
    mockSectionFind.mockReset();
    mockStudentCreate.mockReset();
    mockClassFind.mockReset();
    (prisma.studentEnrollmentHistory.create as unknown as ReturnType<typeof vi.fn>).mockReset();
    mockClassFind.mockResolvedValue({ id: "grade-10", academicYearId: "year-1" });
    (prisma.studentEnrollmentHistory.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "history-1" });
    mockUserFind.mockResolvedValue({ id: "user-1" });
    mockStudentCreate.mockImplementation(async ({ data }: { data: unknown }) => data);
  });

  it("REJECTS enrollment if specified sectionId does not exist in DB", async () => {
    mockSectionFind.mockResolvedValue(null);

    await expect(
      enrollStudent({
        userId: "user-1",
        admissionNo: "ADM-100",
        classId: "grade-10",
        sectionId: "nonexistent-section",
      })
    ).rejects.toThrow(AcademicsValidationError);
  });

  it("REJECTS enrollment if section does not belong to specified classId", async () => {
    // Section A belongs to Grade 9, but enrollment specifies Grade 10
    mockSectionFind.mockResolvedValue({ id: "sec-9a", classId: "grade-9" });

    await expect(
      enrollStudent({
        userId: "user-1",
        admissionNo: "ADM-101",
        classId: "grade-10",
        sectionId: "sec-9a",
      })
    ).rejects.toThrow(AcademicsValidationError);
  });

  it("ENROLLS student successfully when classId and sectionId match", async () => {
    mockSectionFind.mockResolvedValue({ id: "sec-10a", classId: "grade-10" });

    const student = await enrollStudent({
      userId: "user-1",
      admissionNo: "ADM-102",
      classId: "grade-10",
      sectionId: "sec-10a",
    });

    expect(student).toHaveProperty("admissionNo", "ADM-102");
    expect(mockStudentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          classId: "grade-10",
          sectionId: "sec-10a",
        }),
      })
    );
  });
});
