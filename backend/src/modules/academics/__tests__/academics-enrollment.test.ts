import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    section: { findUnique: vi.fn() },
    studentProfile: { create: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { enrollStudent, AcademicsValidationError } from "../academics.service.js";

const mockSectionFind = prisma.section.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockStudentCreate = prisma.studentProfile.create as unknown as ReturnType<typeof vi.fn>;

describe("Academics Student Enrollment Validation", () => {
  beforeEach(() => {
    mockSectionFind.mockReset();
    mockStudentCreate.mockReset();
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
