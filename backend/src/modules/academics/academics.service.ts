import { prisma } from "../../db/client.js";

// Genuine queries against the real schema. Returns exactly what's in the
// database — an empty array when nothing has been entered yet, never
// placeholder or invented rows.

export async function listClassesWithSections() {
  return prisma.class.findMany({
    include: { sections: true, academicYear: true },
    orderBy: { name: "asc" },
  });
}

export async function listSubjects() {
  return prisma.subject.findMany({ orderBy: { name: "asc" } });
}

// The real student roster for a section — used by the attendance-marking
// screen so a teacher marks actual enrolled students, never a placeholder
// headcount.
export async function listStudentsInSection(sectionId: string) {
  return prisma.studentProfile.findMany({
    where: { sectionId },
    include: { user: { select: { fullName: true } } },
    orderBy: { rollNumber: "asc" },
  });
}

export async function getMyScopedClasses(userId: string) {
  // Real, derived from the user's actual UserRole rows — not a guess.
  // Returns the classes/sections this specific user is scoped to, e.g. for
  // a teacher's "My Classes" widget. School-wide roles (no scope columns)
  // return null to signal "all classes", handled by the caller.
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { class: { include: { sections: true } } },
  });

  const hasUnscopedRole = userRoles.some(
    (ur) => !ur.classId && !ur.sectionId && !ur.subjectId && !ur.departmentId
  );
  if (hasUnscopedRole) return null;

  const classesById = new Map<string, (typeof userRoles)[number]["class"]>();
  for (const ur of userRoles) {
    if (ur.class) classesById.set(ur.class.id, ur.class);
  }
  return Array.from(classesById.values());
}

// ---------- WRITES (admin/principal only, enforced at the route layer) ----------

export async function createAcademicYear(input: { label: string; startDate: string; endDate: string }) {
  return prisma.academicYear.create({
    data: { label: input.label, startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
  });
}

export async function createClass(input: { name: string; academicYearId: string }) {
  return prisma.class.create({ data: input });
}

export async function createSection(input: { name: string; classId: string }) {
  return prisma.section.create({ data: input });
}

export async function createSubject(input: { name: string; code?: string }) {
  return prisma.subject.create({ data: input });
}

export class AcademicsValidationError extends Error {}

// Enrolling a student means: the person already has a User account (created
// via the admin/user-management routes), and now gets a StudentProfile
// linking them to a class/section with a real admission number — this is
// what actually makes them show up in attendance, exams, etc.
export async function enrollStudent(input: {
  userId: string;
  admissionNo: string;
  classId?: string;
  sectionId?: string;
  rollNumber?: string;
  dateOfBirth?: string;
  admissionDate?: string;
}) {
  if (input.sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: input.sectionId },
      select: { id: true, classId: true },
    });
    if (!section) {
      throw new AcademicsValidationError(`Section ${input.sectionId} not found`);
    }
    if (input.classId && section.classId !== input.classId) {
      throw new AcademicsValidationError(
        `Section ${input.sectionId} does not belong to specified class ${input.classId}`
      );
    }
  }

  return prisma.studentProfile.create({
    data: {
      userId: input.userId,
      admissionNo: input.admissionNo,
      classId: input.classId,
      sectionId: input.sectionId,
      rollNumber: input.rollNumber,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      admissionDate: input.admissionDate ? new Date(input.admissionDate) : undefined,
    },
  });
}

export async function linkGuardian(input: { parentUserId: string; studentProfileId: string; relation: string }) {
  return prisma.parentStudentLink.create({
    data: { parentId: input.parentUserId, studentId: input.studentProfileId, relation: input.relation },
  });
}

