import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parentChildrenFindMany: vi.fn(),
  parentLinkFindFirst: vi.fn(),
  studentProfileFindUnique: vi.fn(),
  examFindUnique: vi.fn(),
  examResultFindMany: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    parentStudentLink: {
      findMany: mocks.parentChildrenFindMany,
      findFirst: mocks.parentLinkFindFirst,
    },
    studentProfile: { findUnique: mocks.studentProfileFindUnique },
    exam: { findUnique: mocks.examFindUnique },
    examResult: { findMany: mocks.examResultFindMany },
  },
}));

import { listParentChildren } from "../modules/parent/parent.service.js";
import { getStudentReportCard } from "../modules/exams/exams.service.js";

describe("student-facing response confidentiality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("projects only parent-portal student display fields", async () => {
    mocks.parentChildrenFindMany.mockResolvedValue([]);

    await listParentChildren("parent-1");

    expect(mocks.parentChildrenFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            rollNumber: true,
            status: true,
            user: { select: { fullName: true, email: true, phone: true } },
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
            fundingCategory: { select: { id: true, name: true } },
          },
        },
      },
    }));
  });

  it("does not query unrestricted student columns for self-service report cards", async () => {
    mocks.studentProfileFindUnique.mockResolvedValue({
      id: "student-1",
      admissionNo: "ADM-001",
      rollNumber: "R-001",
      status: "ACTIVE",
      user: { fullName: "Student Example", email: "student@example.test", phone: null },
      class: { id: "class-1", name: "Class 9" },
      section: { id: "section-1", name: "A" },
    });
    mocks.examFindUnique.mockResolvedValue({
      id: "exam-1",
      status: "PUBLISHED",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      academicYear: { label: "2026" },
    });
    mocks.examResultFindMany.mockResolvedValue([]);

    await getStudentReportCard("student-1", "exam-1");

    expect(mocks.studentProfileFindUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      select: {
        id: true,
        admissionNo: true,
        rollNumber: true,
        status: true,
        user: { select: { fullName: true, email: true, phone: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    });
  });
});
