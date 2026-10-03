import { prisma } from "../../db/client.js";

export class ConflictError extends Error {}

// Real conflict detection: a teacher can't be in two places at once, and
// neither can a room. This checks actual overlapping rows in the database
// before creating a new slot — not a UI-only warning that can be bypassed.
export async function createTimetableSlot(input: {
  classId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}) {
  const [section, subject, teacher] = await Promise.all([
    prisma.section.findUnique({ where: { id: input.sectionId }, select: { id: true, classId: true } }),
    prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: input.teacherId }, select: { id: true, isActive: true } }),
  ]);

  if (!section) throw new ConflictError(`Section ${input.sectionId} not found`);
  if (section.classId !== input.classId) {
    throw new ConflictError(`Section ${input.sectionId} does not belong to specified class ${input.classId}`);
  }
  if (!subject) throw new ConflictError(`Subject ${input.subjectId} not found`);
  if (!teacher || !teacher.isActive) throw new ConflictError(`Assigned teacher is invalid or inactive`);

  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId }, select: { id: true } });
    if (!room) throw new ConflictError(`Room ${input.roomId} not found`);
  }

  return prisma.$transaction(async (tx) => {
    const overlapping = await tx.timetableSlot.findMany({
      where: {
        dayOfWeek: input.dayOfWeek,
        OR: [
          { teacherId: input.teacherId },
          ...(input.roomId ? [{ roomId: input.roomId }] : []),
          { classId: input.classId, sectionId: input.sectionId },
        ],
      },
    });

    const conflict = overlapping.find((slot) => timesOverlap(slot.startTime, slot.endTime, input.startTime, input.endTime));
    if (conflict) {
      const reason =
        conflict.teacherId === input.teacherId
          ? "This teacher already has a class in this time slot."
          : conflict.roomId && conflict.roomId === input.roomId
          ? "This room is already booked in this time slot."
          : "This class/section already has a period in this time slot.";
      throw new ConflictError(reason);
    }

    return tx.timetableSlot.create({ data: input });
  });
}


function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}

export async function listTimetableForClass(classId: string, sectionId: string) {
  return prisma.timetableSlot.findMany({
    where: { classId, sectionId },
    include: { subject: true, room: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

// A teacher's own real schedule — derived from actual TimetableSlot rows
// where they are the assigned teacher, not from their role assignments
// (a teacher could be scoped to a class without having a fixed period
// there, e.g. a substitute — so this is deliberately its own query).
export async function listTimetableForTeacher(teacherId: string) {
  return prisma.timetableSlot.findMany({
    where: { teacherId },
    include: { subject: true, class: true, section: true, room: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function createRoom(name: string) {
  return prisma.room.create({ data: { name } });
}

export async function listRooms() {
  return prisma.room.findMany({ orderBy: { name: "asc" } });
}

// Real, explicit authorization for viewing a class's timetable — deliberately
// NOT delegated to the generic scoped-permission check. Reason: "student"
// and "parent" roles are naturally assigned unscoped (a student's class
// lives on their StudentProfile, not on a UserRole scope), and an unscoped
// role satisfies ANY scope check in the generic engine — which would let
// any student view any class's timetable, not just their own. This checks
// real enrollment/guardianship/staff-scope directly instead.
export async function canViewClassTimetable(userId: string, classId: string, sectionId: string): Promise<boolean> {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });

  for (const ur of roles) {
    const keys = ur.role.rolePermissions.map((rp) => rp.permission.key);
    const unscoped = !ur.classId && !ur.sectionId;

    // "timetable:manage" is a genuine staff-wide administrative permission
    // — an unscoped holder (principal/admin) really is meant to see every
    // class's timetable. This is the ONLY key allowed to use the unscoped
    // shortcut here.
    if (keys.includes("timetable:manage") && unscoped) return true;

    // "timetable:view:own" is deliberately NEVER granted via the unscoped
    // shortcut, even though the same permission key is held by student and
    // parent roles that are naturally unscoped — that's exactly the gap
    // being closed. A scoped role (a class/section teacher) still counts,
    // because that scope is real and specific.
    if (keys.includes("timetable:view:own") && !unscoped) {
      if (ur.classId === classId && (!ur.sectionId || ur.sectionId === sectionId)) return true;
    }
  }

  // Student case: their REAL enrollment must match, not just a role claim.
  const ownProfile = await prisma.studentProfile.findFirst({ where: { userId, classId, sectionId } });
  if (ownProfile) return true;

  // Parent case: a REAL guardian link to a student actually enrolled here.
  const guardianLink = await prisma.parentStudentLink.findFirst({
    where: { parentId: userId, student: { classId, sectionId } },
  });
  if (guardianLink) return true;

  return false;
}
