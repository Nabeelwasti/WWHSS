import { describe, it, expect, vi, beforeEach } from "vitest";

// Real test of the conflict-detection logic against a mocked Prisma client
// — checks actual overlap math, not just that the function runs.
vi.mock("../../../db/client.js", () => ({
  prisma: {
    timetableSlot: { findMany: vi.fn(), create: vi.fn() },
    userRole: { findMany: vi.fn() },
    studentProfile: { findFirst: vi.fn() },
    parentStudentLink: { findFirst: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { createTimetableSlot, canViewClassTimetable, ConflictError } from "../timetable.service.js";

const mockedFindMany = prisma.timetableSlot.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = prisma.timetableSlot.create as unknown as ReturnType<typeof vi.fn>;

const baseInput = {
  classId: "grade-10",
  sectionId: "section-a",
  subjectId: "physics",
  teacherId: "teacher-1",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "09:45",
};

describe("createTimetableSlot", () => {
  beforeEach(() => {
    mockedFindMany.mockReset();
    mockedCreate.mockReset();
  });

  it("creates the slot when there is no real overlap", async () => {
    mockedFindMany.mockResolvedValue([]); // no existing slots at all
    mockedCreate.mockResolvedValue({ id: "slot-1", ...baseInput });

    const result = await createTimetableSlot(baseInput);
    expect(result).toMatchObject({ id: "slot-1" });
    expect(mockedCreate).toHaveBeenCalled();
  });

  it("rejects a genuinely overlapping time for the same teacher", async () => {
    mockedFindMany.mockResolvedValue([
      { teacherId: "teacher-1", roomId: null, startTime: "09:15", endTime: "10:00" },
    ]);

    await expect(createTimetableSlot(baseInput)).rejects.toThrow(ConflictError);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("does NOT reject two slots that are merely adjacent (no real overlap)", async () => {
    // Ends exactly when the new one starts — a real school schedule needs
    // this to work, so back-to-back periods must not be flagged.
    mockedFindMany.mockResolvedValue([
      { teacherId: "teacher-1", roomId: null, startTime: "08:15", endTime: "09:00" },
    ]);
    mockedCreate.mockResolvedValue({ id: "slot-2", ...baseInput });

    const result = await createTimetableSlot(baseInput);
    expect(result).toMatchObject({ id: "slot-2" });
  });

  it("rejects a room double-booking even with a different teacher", async () => {
    mockedFindMany.mockResolvedValue([
      { teacherId: "someone-else", roomId: "room-1", startTime: "09:00", endTime: "09:45" },
    ]);

    await expect(createTimetableSlot({ ...baseInput, roomId: "room-1" })).rejects.toThrow(ConflictError);
  });
});

describe("canViewClassTimetable", () => {
  const mockedUserRoleFindMany = prisma.userRole.findMany as unknown as ReturnType<typeof vi.fn>;
  const mockedStudentFindFirst = prisma.studentProfile.findFirst as unknown as ReturnType<typeof vi.fn>;
  const mockedGuardianFindFirst = prisma.parentStudentLink.findFirst as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedUserRoleFindMany.mockReset();
    mockedStudentFindFirst.mockReset();
    mockedGuardianFindFirst.mockReset();
  });

  it("THE REAL BUG THIS FIXES: a student's unscoped role must NOT grant access to a class they aren't enrolled in", async () => {
    // The student role naturally has no classId/sectionId on its UserRole
    // row (a student's class lives on StudentProfile) and grants
    // timetable:view:own — exactly the shape that, before this fix, fell
    // through the generic "unscoped role = school-wide" shortcut.
    mockedUserRoleFindMany.mockResolvedValue([
      { classId: null, sectionId: null, role: { rolePermissions: [{ permission: { key: "timetable:view:own" } }] } },
    ]);
    mockedStudentFindFirst.mockResolvedValue(null); // not actually enrolled in the requested class
    mockedGuardianFindFirst.mockResolvedValue(null);

    const allowed = await canViewClassTimetable("student-user-1", "some-other-class", "some-other-section");
    expect(allowed).toBe(false);
  });

  it("grants a student real access to their OWN actual enrolled class", async () => {
    mockedUserRoleFindMany.mockResolvedValue([
      { classId: null, sectionId: null, role: { rolePermissions: [{ permission: { key: "timetable:view:own" } }] } },
    ]);
    mockedStudentFindFirst.mockResolvedValue({ id: "profile-1", classId: "grade-10", sectionId: "section-a" });

    const allowed = await canViewClassTimetable("student-user-1", "grade-10", "section-a");
    expect(allowed).toBe(true);
  });

  it("grants a genuinely unscoped admin permission (timetable:manage) school-wide access", async () => {
    mockedUserRoleFindMany.mockResolvedValue([
      { classId: null, sectionId: null, role: { rolePermissions: [{ permission: { key: "timetable:manage" } }] } },
    ]);

    const allowed = await canViewClassTimetable("admin-1", "any-class", "any-section");
    expect(allowed).toBe(true);
  });

  it("grants a class-scoped teacher access to their real assigned class", async () => {
    mockedUserRoleFindMany.mockResolvedValue([
      { classId: "grade-10", sectionId: null, role: { rolePermissions: [{ permission: { key: "timetable:view:own" } }] } },
    ]);

    const allowed = await canViewClassTimetable("teacher-1", "grade-10", "section-a");
    expect(allowed).toBe(true);
  });

  it("denies a class-scoped teacher for a DIFFERENT class than assigned", async () => {
    mockedUserRoleFindMany.mockResolvedValue([
      { classId: "grade-9", sectionId: null, role: { rolePermissions: [{ permission: { key: "timetable:view:own" } }] } },
    ]);
    mockedStudentFindFirst.mockResolvedValue(null);
    mockedGuardianFindFirst.mockResolvedValue(null);

    const allowed = await canViewClassTimetable("teacher-1", "grade-10", "section-a");
    expect(allowed).toBe(false);
  });

  it("grants a real linked guardian access to their child's actual class", async () => {
    mockedUserRoleFindMany.mockResolvedValue([]);
    mockedStudentFindFirst.mockResolvedValue(null);
    mockedGuardianFindFirst.mockResolvedValue({ id: "link-1" });

    const allowed = await canViewClassTimetable("parent-1", "grade-10", "section-a");
    expect(allowed).toBe(true);
  });
});
