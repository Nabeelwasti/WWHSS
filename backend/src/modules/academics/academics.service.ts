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

// ---------- WRITES (admin/principal only, enforced at the route layer) ----------

export async function createAcademicYear(input: { label: string; startDate: string; endDate: string }, actorId?: string) {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AcademicsValidationError("Invalid start or end date format");
  }
  if (start >= end) {
    throw new AcademicsValidationError("Academic year startDate must be before endDate");
  }
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.create({
      data: { label: input.label, startDate: start, endDate: end },
    });
    if (actorId) {
      await tx.auditLog.create({
        data: { userId: actorId, action: "academics:create_academic_year", resource: `academic_year:${year.id}`, metadata: { label: input.label } },
      });
    }
    return year;
  });
}

export async function createClass(input: { name: string; academicYearId: string }, actorId?: string) {
  const year = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year) throw new AcademicsValidationError(`Academic year ${input.academicYearId} not found`);

  return prisma.$transaction(async (tx) => {
    const cls = await tx.class.create({ data: input });
    if (actorId) {
      await tx.auditLog.create({
        data: { userId: actorId, action: "academics:create_class", resource: `class:${cls.id}`, metadata: { name: input.name } },
      });
    }
    return cls;
  });
}

export async function createSection(input: { name: string; classId: string }, actorId?: string) {
  const cls = await prisma.class.findUnique({ where: { id: input.classId } });
  if (!cls) throw new AcademicsValidationError(`Class ${input.classId} not found`);

  return prisma.$transaction(async (tx) => {
    const sec = await tx.section.create({ data: input });
    if (actorId) {
      await tx.auditLog.create({
        data: { userId: actorId, action: "academics:create_section", resource: `section:${sec.id}`, metadata: { name: input.name } },
      });
    }
    return sec;
  });
}

export async function createSubject(input: { name: string; code?: string }, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const subj = await tx.subject.create({ data: input });
    if (actorId) {
      await tx.auditLog.create({
        data: { userId: actorId, action: "academics:create_subject", resource: `subject:${subj.id}`, metadata: { name: input.name, code: input.code } },
      });
    }
    return subj;
  });
}

export class AcademicsValidationError extends Error {}

export async function enrollStudent(
  input: {
    userId: string;
    admissionNo: string;
    classId?: string;
    sectionId?: string;
    rollNumber?: string;
    dateOfBirth?: string;
    admissionDate?: string;
  },
  actorId?: string
) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new AcademicsValidationError(`User ${input.userId} not found`);

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
  } else if (input.classId) {
    const cls = await prisma.class.findUnique({ where: { id: input.classId } });
    if (!cls) throw new AcademicsValidationError(`Class ${input.classId} not found`);
  }

  const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : undefined;
  const adm = input.admissionDate ? new Date(input.admissionDate) : undefined;
  if (dob && Number.isNaN(dob.getTime())) throw new AcademicsValidationError("Invalid dateOfBirth format");
  if (adm && Number.isNaN(adm.getTime())) throw new AcademicsValidationError("Invalid admissionDate format");

  return prisma.$transaction(async (tx) => {
    const profile = await tx.studentProfile.create({
      data: {
        userId: input.userId,
        admissionNo: input.admissionNo,
        classId: input.classId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber,
        dateOfBirth: dob,
        admissionDate: adm,
      },
    });

    if (input.classId) {
      const cls = await tx.class.findUnique({ where: { id: input.classId }, select: { academicYearId: true } });
      if (cls) {
        await tx.studentEnrollmentHistory.create({
          data: {
            studentProfileId: profile.id,
            academicYearId: cls.academicYearId,
            classId: input.classId,
            sectionId: input.sectionId,
            startDate: adm ?? new Date(),
            status: "ACTIVE",
            changedByUserId: actorId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: actorId ?? input.userId,
        action: "academics:enroll_student",
        resource: `student:${profile.id}`,
        metadata: { admissionNo: input.admissionNo, classId: input.classId, sectionId: input.sectionId },
      },
    });

    return profile;
  });
}

export async function getStudentEnrollmentHistory(studentProfileId: string) {
  return prisma.studentEnrollmentHistory.findMany({ where: { studentProfileId }, include: { academicYear: true, class: true, section: true, changedBy: { select: { fullName: true } } }, orderBy: { startDate: "desc" } });
}

export async function changeStudentPlacement(input: { studentProfileId: string; classId: string; sectionId?: string; academicYearId: string; startDate: string; reason?: string; status?: string }, actorId?: string) {
  const startDate = new Date(input.startDate); if (Number.isNaN(startDate.getTime())) throw new AcademicsValidationError("Invalid placement start date");
  return prisma.$transaction(async (tx) => {
    const student = await tx.studentProfile.findUnique({ where: { id: input.studentProfileId } });
    const cls = await tx.class.findUnique({ where: { id: input.classId } });
    const year = await tx.academicYear.findUnique({ where: { id: input.academicYearId } });
    if (!student || !cls || !year) throw new AcademicsValidationError("Student, class or academic year not found");
    if (cls.academicYearId !== input.academicYearId) throw new AcademicsValidationError("Class does not belong to academic year");
    if (input.sectionId) { const section = await tx.section.findUnique({ where: { id: input.sectionId } }); if (!section || section.classId !== input.classId) throw new AcademicsValidationError("Section does not belong to class"); }
    const current = await tx.studentEnrollmentHistory.findFirst({ where: { studentProfileId: input.studentProfileId, endDate: null }, orderBy: { startDate: "desc" } });
    if (current && current.startDate < startDate) await tx.studentEnrollmentHistory.update({ where: { id: current.id }, data: { endDate: new Date(startDate.getTime() - 1) , status: "ENDED" } });
    const history = await tx.studentEnrollmentHistory.create({ data: { studentProfileId: input.studentProfileId, academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, startDate, status: input.status || "ACTIVE", reason: input.reason, changedByUserId: actorId } });
    await tx.studentProfile.update({ where: { id: input.studentProfileId }, data: { classId: input.classId, sectionId: input.sectionId } });
    if (actorId) await tx.auditLog.create({ data: { userId: actorId, action: "student:placement_change", resource: `student:${input.studentProfileId}`, metadata: { classId: input.classId, sectionId: input.sectionId, academicYearId: input.academicYearId, reason: input.reason } } });
    return history;
  });
}

export async function linkGuardian(
  input: { parentUserId: string; studentProfileId: string; relation: string },
  actorId?: string
) {
  const [parent, student] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.parentUserId }, select: { id: true } }),
    prisma.studentProfile.findUnique({ where: { id: input.studentProfileId }, select: { id: true, userId: true } }),
  ]);

  if (!parent) {
    throw new AcademicsValidationError(`Parent user ${input.parentUserId} not found`);
  }
  if (!student) {
    throw new AcademicsValidationError(`Student profile ${input.studentProfileId} not found`);
  }
  if (student.userId === input.parentUserId) {
    throw new AcademicsValidationError("A student cannot be linked as their own guardian");
  }

  return prisma.$transaction(async (tx) => {
    const link = await tx.parentStudentLink.create({
      data: { parentId: input.parentUserId, studentId: input.studentProfileId, relation: input.relation },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId ?? input.parentUserId,
        action: "academics:link_guardian",
        resource: `student:${input.studentProfileId}:guardian:${input.parentUserId}`,
        metadata: { relation: input.relation },
      },
    });

    return link;
  });
}


