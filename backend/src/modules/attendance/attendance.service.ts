import { prisma } from "../../db/client.js";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export class AttendanceValidationError extends Error {}

export async function markAttendance(input: {
  classId: string;
  sectionId: string;
  date: string;
  markedByUserId: string;
  records: { studentProfileId: string; status: AttendanceStatus }[];
}) {
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new AttendanceValidationError("Invalid date");

  // Real integrity check: the route's permission check proves the teacher
  // is authorized for THIS class/section — but that says nothing about
  // whether the student IDs in the payload actually belong to it. Without
  // this, a teacher authorized for Grade 10 could write attendance rows
  // for a Grade 9 student by simply sending that student's ID alongside
  // Grade 10's class/section.
  const ids = input.records.map((r) => r.studentProfileId);
  const enrolled = await prisma.studentProfile.findMany({
    where: { id: { in: ids }, classId: input.classId, sectionId: input.sectionId },
    select: { id: true },
  });
  const enrolledIds = new Set(enrolled.map((s) => s.id));
  const strangers = ids.filter((id) => !enrolledIds.has(id));
  if (strangers.length > 0) {
    throw new AttendanceValidationError(
      `${strangers.length} student(s) in this request are not enrolled in the selected class/section.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const results = await Promise.all(
      input.records.map((r) =>
        tx.attendanceRecord.upsert({
          where: { studentProfileId_date: { studentProfileId: r.studentProfileId, date } },
          update: { status: r.status, markedByUserId: input.markedByUserId },
          create: {
            studentProfileId: r.studentProfileId,
            classId: input.classId,
            sectionId: input.sectionId,
            date,
            status: r.status,
            markedByUserId: input.markedByUserId,
          },
        })
      )
    );

    await tx.auditLog.create({
      data: {
        userId: input.markedByUserId,
        action: "attendance:mark",
        resource: `class:${input.classId}:section:${input.sectionId}:date:${input.date}`,
        metadata: { count: results.length },
      },
    });

    return results;
  });

}

export async function getStudentAttendance(studentProfileId: string) {
  // Real read — returns whatever is actually in the table, which is an
  // empty array for a student with no marked days yet. Never fabricated.
  return prisma.attendanceRecord.findMany({
    where: { studentProfileId },
    orderBy: { date: "desc" },
  });
}

export async function getClassAttendanceForDate(classId: string, sectionId: string, date: string) {
  return prisma.attendanceRecord.findMany({
    where: { classId, sectionId, date: new Date(date) },
  });
}

// ---------- Engagement summary (positive-framing, computed from real data) ----------

export type EngagementSummary = {
  currentStreak: number; // consecutive most-recent attended days
  bestStreak: number;
  attendedDays: number;
  recordedDays: number; // excludes excused days — they don't count for or against
  attendanceRate: number | null; // null when there's nothing recorded yet, never a made-up 0 or 100
};

// Pure function (no database) so the logic is directly testable.
// "Attended" = present or late. "Excused" is neutral: it neither extends
// nor breaks a streak and is left out of the rate, since penalising a
// child for an approved absence would be both unfair and demotivating.
export function computeEngagementSummary(
  records: { date: Date; status: string }[]
): EngagementSummary {
  const counted = records
    .filter((r) => r.status !== "excused")
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first

  const attended = (s: string) => s === "present" || s === "late";

  let currentStreak = 0;
  for (const r of counted) {
    if (attended(r.status)) currentStreak += 1;
    else break;
  }

  let bestStreak = 0;
  let run = 0;
  for (const r of [...counted].reverse()) {
    if (attended(r.status)) {
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  const attendedDays = counted.filter((r) => attended(r.status)).length;
  const recordedDays = counted.length;

  return {
    currentStreak,
    bestStreak,
    attendedDays,
    recordedDays,
    attendanceRate: recordedDays === 0 ? null : Math.round((attendedDays / recordedDays) * 100),
  };
}

export async function getStudentEngagementSummary(studentProfileId: string): Promise<EngagementSummary> {
  const records = await prisma.attendanceRecord.findMany({
    where: { studentProfileId },
    select: { date: true, status: true },
  });
  return computeEngagementSummary(records);
}
