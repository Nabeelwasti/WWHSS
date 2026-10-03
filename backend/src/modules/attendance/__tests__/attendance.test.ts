import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    studentProfile: { findMany: vi.fn() },
    attendanceRecord: { upsert: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { computeEngagementSummary, markAttendance, AttendanceValidationError } from "../attendance.service.js";

const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T00:00:00Z`);

describe("computeEngagementSummary", () => {
  it("returns a null rate (not a made-up number) when nothing is recorded", () => {
    const s = computeEngagementSummary([]);
    expect(s.attendanceRate).toBeNull();
    expect(s.currentStreak).toBe(0);
  });

  it("counts a current streak from the most recent day backwards", () => {
    const s = computeEngagementSummary([
      { date: d(1), status: "absent" },
      { date: d(2), status: "present" },
      { date: d(3), status: "present" },
      { date: d(4), status: "late" },
    ]);
    expect(s.currentStreak).toBe(3);
  });

  it("an absence breaks the current streak", () => {
    const s = computeEngagementSummary([
      { date: d(1), status: "present" },
      { date: d(2), status: "present" },
      { date: d(3), status: "absent" },
    ]);
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(2);
  });

  it("an excused day neither breaks a streak nor counts against the rate", () => {
    const s = computeEngagementSummary([
      { date: d(1), status: "present" },
      { date: d(2), status: "excused" },
      { date: d(3), status: "present" },
    ]);
    expect(s.currentStreak).toBe(2);
    expect(s.recordedDays).toBe(2);
    expect(s.attendanceRate).toBe(100);
  });

  it("computes a real rate from a mix of days", () => {
    const s = computeEngagementSummary([
      { date: d(1), status: "present" },
      { date: d(2), status: "absent" },
      { date: d(3), status: "present" },
      { date: d(4), status: "absent" },
    ]);
    expect(s.attendanceRate).toBe(50);
  });

  it("does not depend on the order records arrive in", () => {
    const s = computeEngagementSummary([
      { date: d(3), status: "present" },
      { date: d(1), status: "absent" },
      { date: d(2), status: "present" },
    ]);
    expect(s.currentStreak).toBe(2);
  });
});

describe("markAttendance integrity check", () => {
  beforeEach(() => {
    vi.mocked(prisma.studentProfile.findMany).mockReset();
    vi.mocked(prisma.attendanceRecord.upsert).mockReset();
  });

  it("REAL GAP FIXED: rejects a student who is not enrolled in the authorized class/section", async () => {
    // Only "student-a" is really in this class; "student-from-grade-9" is not.
    vi.mocked(prisma.studentProfile.findMany).mockResolvedValue([{ id: "student-a" }] as never);

    await expect(
      markAttendance({
        classId: "grade-10",
        sectionId: "section-a",
        date: "2026-09-24",
        markedByUserId: "teacher-1",
        records: [
          { studentProfileId: "student-a", status: "present" },
          { studentProfileId: "student-from-grade-9", status: "present" },
        ],
      })
    ).rejects.toThrow(AttendanceValidationError);

    expect(prisma.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("writes nothing at all if any single student fails the check (no partial writes)", async () => {
    vi.mocked(prisma.studentProfile.findMany).mockResolvedValue([] as never);

    await expect(
      markAttendance({
        classId: "grade-10",
        sectionId: "section-a",
        date: "2026-09-24",
        markedByUserId: "teacher-1",
        records: [{ studentProfileId: "stranger", status: "absent" }],
      })
    ).rejects.toThrow();
    expect(prisma.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid date instead of writing garbage", async () => {
    await expect(
      markAttendance({
        classId: "c",
        sectionId: "s",
        date: "not-a-date",
        markedByUserId: "t",
        records: [{ studentProfileId: "x", status: "present" }],
      })
    ).rejects.toThrow(AttendanceValidationError);
  });
});
