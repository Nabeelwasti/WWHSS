import { prisma } from "../../db/client.js";

/**
 * The permission engine. Every module in the system routes access decisions
 * through this file — there must be exactly one place that answers
 * "is this user allowed to do X to Y", so it can be audited and trusted.
 *
 * Design: a user holds one or more (role, scope) pairs via UserRole rows.
 * A permission check asks: does the user hold, in some scope that covers
 * the requested resource, a role granted the requested permission key?
 */

export type PermissionScope = {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  departmentId?: string;
  studentId?: string;
};

export async function userHasPermission(
  userId: string,
  permissionKey: string,
  scope: PermissionScope = {}
): Promise<boolean> {
  const isSelfOnlyPermission = SELF_ACCESS_PERMISSIONS.has(permissionKey) || GUARDIAN_ACCESS_PERMISSIONS.has(permissionKey);

  if (!isSelfOnlyPermission) {
    const requestedScopeIsEmpty = !scope.classId && !scope.sectionId && !scope.subjectId && !scope.departmentId;
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    for (const ur of userRoles) {
      const grantedKeys = ur.role.rolePermissions.map((rp) => rp.permission.key);
      if (!grantedKeys.includes(permissionKey)) continue;

      const roleIsUnscoped = !ur.classId && !ur.sectionId && !ur.subjectId && !ur.departmentId;
      if (roleIsUnscoped) return true;
      if (requestedScopeIsEmpty) continue;

      const classOk = !ur.classId || !scope.classId || ur.classId === scope.classId;
      const sectionOk = !ur.sectionId || !scope.sectionId || ur.sectionId === scope.sectionId;
      const subjectOk = !ur.subjectId || !scope.subjectId || ur.subjectId === scope.subjectId;
      const deptOk = !ur.departmentId || !scope.departmentId || ur.departmentId === scope.departmentId;
      if (classOk && sectionOk && subjectOk && deptOk) return true;
    }
  }

  if (scope.studentId) {
    const isSelf = await isStudentSelf(userId, scope.studentId);
    if (isSelf && SELF_ACCESS_PERMISSIONS.has(permissionKey)) return true;

    const isGuardian = await isGuardianOfStudent(userId, scope.studentId);
    if (isGuardian && GUARDIAN_ACCESS_PERMISSIONS.has(permissionKey)) return true;

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { id: scope.studentId },
      select: { classId: true, sectionId: true },
    });
    if (studentProfile) {
      const staffKeys = [
        "exams:manage",
        "grades:enter",
        "grades:view",
        "students:manage",
        "attendance:mark",
        "documents:view",
        "documents:create",
        "documents:print",
      ];
      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      });
      for (const ur of userRoles) {
        const grantedKeys = ur.role.rolePermissions.map((rp) => rp.permission.key);
        const hasStaffKey = staffKeys.some((k) => grantedKeys.includes(k));
        if (!hasStaffKey) continue;

        const roleIsUnscoped = !ur.classId && !ur.sectionId && !ur.subjectId && !ur.departmentId;
        if (roleIsUnscoped) return true;

        const classOk = !ur.classId || !studentProfile.classId || ur.classId === studentProfile.classId;
        const sectionOk = !ur.sectionId || !studentProfile.sectionId || ur.sectionId === studentProfile.sectionId;
        if (classOk && sectionOk) return true;
      }
    }
  }

  return false;
}

const SELF_ACCESS_PERMISSIONS = new Set([
  "attendance:view:own",
  "grades:view:own",
  "assignments:view:own",
  "timetable:view:own",
  "finance:view:own",
  "exams:view:own",
  "documents:view:own",
]);

const GUARDIAN_ACCESS_PERMISSIONS = new Set([
  "attendance:view:own",
  "grades:view:own",
  "assignments:view:own",
  "timetable:view:own",
  "announcements:view:own",
  "finance:view:own",
  "exams:view:own",
  "documents:view:own",
]);

async function isStudentSelf(userId: string, studentProfileId: string): Promise<boolean> {
  const profile = await prisma.studentProfile.findUnique({ where: { id: studentProfileId } });
  return profile?.userId === userId;
}

async function isGuardianOfStudent(userId: string, studentProfileId: string): Promise<boolean> {
  const link = await prisma.parentStudentLink.findFirst({
    where: { parentId: userId, studentId: studentProfileId },
  });
  return Boolean(link);
}

export class ForbiddenError extends Error {
  constructor(permissionKey: string) {
    super(`Missing permission: ${permissionKey}`);
    this.name = "ForbiddenError";
  }
}

export async function requirePermission(
  userId: string,
  permissionKey: string,
  scope: PermissionScope = {}
): Promise<void> {
  const allowed = await userHasPermission(userId, permissionKey, scope);
  if (!allowed) throw new ForbiddenError(permissionKey);
}
