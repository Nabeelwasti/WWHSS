import argon2 from "argon2";
import crypto from "node:crypto";
import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";

export class UserValidationError extends Error {}

const ROLE_LEVELS: Record<string, number> = {
  super_admin: 100,
  principal: 80,
  teacher: 40,
  class_teacher: 40,
  accountant: 40,
  librarian: 40,
  student: 10,
  parent: 10,
};

async function highestRoleLevel(userId: string): Promise<number> {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { key: true } } },
  });
  return assignments.reduce((max, assignment) => Math.max(max, ROLE_LEVELS[assignment.role.key] ?? 0), 0);
}

export async function assertCanManageUser(actorId: string, targetUserId: string): Promise<void> {
  if (actorId === targetUserId) return;
  const [actorLevel, targetLevel] = await Promise.all([
    highestRoleLevel(actorId),
    highestRoleLevel(targetUserId),
  ]);
  const actorIsSuperAdmin = actorLevel >= ROLE_LEVELS.super_admin;
  if (!actorIsSuperAdmin && targetLevel >= actorLevel) {
    throw new UserValidationError("You cannot manage a user with an equal or higher privileged role.");
  }
}

export async function assertCanAssignRole(actorId: string, targetUserId: string, roleKey: string): Promise<void> {
  const requestedLevel = ROLE_LEVELS[roleKey];
  if (requestedLevel === undefined) {
    throw new UserValidationError(`Role '${roleKey}' is not part of the approved privilege hierarchy.`);
  }

  const [actorLevel, targetLevel] = await Promise.all([
    highestRoleLevel(actorId),
    highestRoleLevel(targetUserId),
  ]);

  const actorIsSuperAdmin = actorLevel >= ROLE_LEVELS.super_admin;
  if (!actorIsSuperAdmin && requestedLevel >= actorLevel) {
    throw new UserValidationError("You cannot grant a role with privilege equal to or higher than your own.");
  }
  if (!actorIsSuperAdmin && targetLevel >= actorLevel) {
    throw new UserValidationError("You cannot modify a user with an equal or higher privileged role.");
  }
}

export async function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      photoUrl: true,
      isActive: true,
      createdAt: true,
      userRoles: {
        select: {
          id: true,
          role: { select: { key: true, name: true } },
          classId: true,
          sectionId: true,
          subjectId: true,
          departmentId: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });
}

export async function createUser(input: { email: string; fullName: string; phone?: string; password?: string }) {
  const rawPassword = input.password ?? crypto.randomBytes(9).toString("base64url");
  const passwordHash = await argon2.hash(rawPassword);

  const user = await prisma.user.create({
    data: { email: input.email, fullName: input.fullName, phone: input.phone, passwordHash },
  });

  return { user, temporaryPassword: input.password ? undefined : rawPassword };
}

export async function assignRole(input: {
  userId: string;
  roleKey: string;
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  departmentId?: string;
  actorId?: string;
}) {
  if (input.actorId) await assertCanAssignRole(input.actorId, input.userId, input.roleKey);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new UserValidationError(`User not found: ${input.userId}`);

  const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw new UserValidationError(`Unknown role: ${input.roleKey}`);

  if (input.classId) {
    const cls = await prisma.class.findUnique({ where: { id: input.classId }, select: { id: true } });
    if (!cls) throw new UserValidationError(`Class not found: ${input.classId}`);
  }

  if (input.sectionId) {
    const sec = await prisma.section.findUnique({ where: { id: input.sectionId }, select: { id: true, classId: true } });
    if (!sec) throw new UserValidationError(`Section not found: ${input.sectionId}`);
    if (input.classId && sec.classId !== input.classId) {
      throw new UserValidationError(`Section ${input.sectionId} does not belong to specified class ${input.classId}`);
    }
  }

  if (input.subjectId) {
    const subj = await prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } });
    if (!subj) throw new UserValidationError(`Subject not found: ${input.subjectId}`);
  }

  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
    if (!dept) throw new UserValidationError(`Department not found: ${input.departmentId}`);
  }

  return prisma.userRole.create({
    data: {
      userId: input.userId,
      roleId: role.id,
      classId: input.classId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      departmentId: input.departmentId,
    },
    include: { role: true },
  });
}

export async function removeRoleAssignment(userRoleId: string, actorId?: string) {
  const assignment = await prisma.userRole.findUnique({
    where: { id: userRoleId },
    select: { userId: true },
  });
  if (!assignment) throw new UserValidationError(`Role assignment not found: ${userRoleId}`);
  if (actorId) await assertCanManageUser(actorId, assignment.userId);
  return prisma.userRole.delete({ where: { id: userRoleId } });
}

export async function deactivateUser(userId: string, actorId?: string) {
  if (actorId) await assertCanManageUser(actorId, userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, tokenVersion: { increment: 1 } },
  });

  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
  return user;
}

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}

export async function resetPassword(userId: string, actorId?: string) {
  if (actorId) await assertCanManageUser(actorId, userId);
  const temporaryPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await argon2.hash(temporaryPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });

  return { temporaryPassword };
}

// ---------- STUDENT MASTER PROFILE & FAST INDEXED SEARCH ----------

export interface SearchStudentsOptions {
  query?: string;
  classId?: string;
  sectionId?: string;
  status?: string;
  fundingCategoryId?: string;
  academicYearId?: string;
  dateOfBirth?: string;
  gender?: string;
  page?: number;
  limit?: number;
  sortBy?: "fullName" | "admissionNo" | "rollNumber" | "status";
  sortOrder?: "asc" | "desc";
  includeSensitive?: boolean;
}

export async function searchStudentProfiles(options: SearchStudentsOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.StudentProfileWhereInput = {};

  if (options.classId) where.classId = options.classId;
  if (options.sectionId) where.sectionId = options.sectionId;
  if (options.academicYearId) where.class = { academicYearId: options.academicYearId };
  if (options.status) where.status = options.status;
  if (options.fundingCategoryId) where.fundingCategoryId = options.fundingCategoryId;
  if (options.gender) where.gender = options.gender;
  if (options.dateOfBirth) {
    const parsedDate = new Date(`${options.dateOfBirth}T00:00:00.000Z`);
    if (!Number.isNaN(parsedDate.getTime())) {
      const nextDate = new Date(parsedDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      where.dateOfBirth = { gte: parsedDate, lt: nextDate };
    }
  }

  if (options.query && options.query.trim().length > 0) {
    const q = options.query.trim();
    where.OR = [
      { user: { fullName: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { admissionNo: { contains: q, mode: "insensitive" } },
      { rollNumber: { contains: q, mode: "insensitive" } },
      { registrationNo: { contains: q, mode: "insensitive" } },
      { fatherName: { contains: q, mode: "insensitive" } },
      { motherName: { contains: q, mode: "insensitive" } },
      { guardianName: { contains: q, mode: "insensitive" } },
      { guardianPhone: { contains: q, mode: "insensitive" } },
      { user: { phone: { contains: q, mode: "insensitive" } } },
      { boardRegistrationNo: { contains: q, mode: "insensitive" } },
      ...(options.includeSensitive ? [{ fundingCategory: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } }] : []),
    ];
  }

  const orderBy: Prisma.StudentProfileOrderByWithRelationInput =
    options.sortBy === "fullName"
      ? { user: { fullName: options.sortOrder || "asc" } }
      : options.sortBy === "admissionNo"
      ? { admissionNo: options.sortOrder || "asc" }
      : options.sortBy === "rollNumber"
      ? { rollNumber: options.sortOrder || "asc" }
      : options.sortBy === "status"
      ? { status: options.sortOrder || "asc" }
      : { user: { fullName: "asc" } };

  const [students, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, photoUrl: true } },
        class: true,
        section: true,
        ...(options.includeSensitive ? { fundingCategory: true } : {}),
        guardians: { include: { parent: { select: { id: true, fullName: true, email: true, phone: true } } } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.studentProfile.count({ where }),
  ]);

  return {
    students,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getStudentProfileById(studentProfileId: string, includeSensitive = false) {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: {
      user: { select: { id: true, email: true, fullName: true, phone: true, photoUrl: true } },
      class: true,
      section: true,
      fundingCategory: true,
      guardians: { include: { parent: { select: { id: true, fullName: true, email: true, phone: true } } } },
      fundingRecords: { include: { fundingCategory: true }, orderBy: { createdAt: "desc" } },
      documentRecords: { orderBy: { createdAt: "desc" } },
      feeInvoices: { include: { feeStructure: true, payments: true }, orderBy: { dueDate: "desc" } },
    },
  });
  if (!profile) throw new UserValidationError(`Student profile ${studentProfileId} not found`);
  if (includeSensitive) return profile;
  const { bloodGroup: _bloodGroup, medicalNotes: _medicalNotes, fundingCategory: _fundingCategory, fundingRecords: _fundingRecords, ...safeProfile } = profile;
  return { ...safeProfile, sensitiveFieldsRedacted: true };
}

export async function updateStudentProfile(
  studentProfileId: string,
  input: {
    registrationNo?: string;
    gender?: string;
    fatherName?: string;
    motherName?: string;
    guardianName?: string;
    guardianRelation?: string;
    guardianPhone?: string;
    emergencyContact?: string;
    address?: string;
    city?: string;
    bloodGroup?: string;
    medicalNotes?: string;
    previousSchool?: string;
    boardRegistrationNo?: string;
    status?: string;
    withdrawalReason?: string;
    transferDate?: string;
    classId?: string;
    sectionId?: string;
    fundingCategoryId?: string;
    rollNumber?: string;
  },
  actorId?: string
) {
  const existing = await prisma.studentProfile.findUnique({ where: { id: studentProfileId } });
  if (!existing) throw new UserValidationError(`Student profile ${studentProfileId} not found`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.studentProfile.update({
      where: { id: studentProfileId },
      data: {
        registrationNo: input.registrationNo,
        gender: input.gender,
        fatherName: input.fatherName,
        motherName: input.motherName,
        guardianName: input.guardianName,
        guardianRelation: input.guardianRelation,
        guardianPhone: input.guardianPhone,
        emergencyContact: input.emergencyContact,
        address: input.address,
        city: input.city,
        bloodGroup: input.bloodGroup,
        medicalNotes: input.medicalNotes,
        previousSchool: input.previousSchool,
        boardRegistrationNo: input.boardRegistrationNo,
        status: input.status,
        withdrawalReason: input.withdrawalReason,
        transferDate: input.transferDate ? new Date(input.transferDate) : undefined,
        classId: input.classId,
        sectionId: input.sectionId,
        fundingCategoryId: input.fundingCategoryId,
        rollNumber: input.rollNumber,
      },
      include: { user: true, class: true, section: true, fundingCategory: true },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "student:update_profile",
          resource: `student:${studentProfileId}`,
          metadata: input,
        },
      });
    }

    return updated;
  });
}

// ---------- STAFF / TEACHER PROFILES ----------

export async function listStaffProfiles() {
  return prisma.staffProfile.findMany({
    include: {
      user: { select: { id: true, email: true, fullName: true, phone: true, photoUrl: true, isActive: true } },
      department: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStaffProfileById(staffProfileId: string) {
  const staff = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    include: {
      user: { select: { id: true, email: true, fullName: true, phone: true, photoUrl: true, isActive: true } },
      department: true,
      documentRecords: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!staff) throw new UserValidationError(`Staff profile ${staffProfileId} not found`);
  return staff;
}

export async function createStaffProfile(
  input: {
    userId: string;
    employeeId: string;
    designation: string;
    qualification?: string;
    departmentId?: string;
    joiningDate?: string;
    status?: string;
    emergencyContact?: string;
  },
  actorId?: string
) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new UserValidationError(`User ${input.userId} not found`);

  const existing = await prisma.staffProfile.findUnique({ where: { employeeId: input.employeeId } });
  if (existing) throw new UserValidationError(`Employee ID ${input.employeeId} is already in use`);

  return prisma.$transaction(async (tx) => {
    const staff = await tx.staffProfile.create({
      data: {
        userId: input.userId,
        employeeId: input.employeeId,
        designation: input.designation,
        qualification: input.qualification,
        departmentId: input.departmentId,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
        status: input.status || "ACTIVE",
        emergencyContact: input.emergencyContact,
      },
      include: { user: true, department: true },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "staff:create_profile",
          resource: `staff:${staff.id}`,
          metadata: { employeeId: input.employeeId, designation: input.designation },
        },
      });
    }

    return staff;
  });
}

export async function updateStaffProfile(
  staffProfileId: string,
  input: {
    designation?: string;
    qualification?: string;
    departmentId?: string;
    joiningDate?: string;
    status?: string;
    emergencyContact?: string;
  },
  actorId?: string
) {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffProfileId } });
  if (!staff) throw new UserValidationError(`Staff profile ${staffProfileId} not found`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.staffProfile.update({
      where: { id: staffProfileId },
      data: {
        designation: input.designation,
        qualification: input.qualification,
        departmentId: input.departmentId,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
        status: input.status,
        emergencyContact: input.emergencyContact,
      },
      include: { user: true, department: true },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "staff:update_profile",
          resource: `staff:${staffProfileId}`,
          metadata: input,
        },
      });
    }

    return updated;
  });
}
