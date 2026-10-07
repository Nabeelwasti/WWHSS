import { prisma } from "../../db/client.js";

export type PermissionScope = {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  departmentId?: string;
  studentId?: string;
};

function scopeMatches(
  roleScope: { classId: string | null; sectionId: string | null; subjectId: string | null; departmentId: string | null },
  targetScope: Pick<PermissionScope, "classId" | "sectionId" | "subjectId" | "departmentId">
): boolean {
  const dimensions: (keyof typeof roleScope)[] = ["classId", "sectionId", "subjectId", "departmentId"];
  return dimensions.every((key) => {
    const granted = roleScope[key];
    if (!granted) return true;
    const target = targetScope[key];
    return Boolean(target) && granted === target;
  });
}

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

      if (scopeMatches(ur, scope)) return true;
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
        "student:view:sensitive",
        "student:manage:sensitive",
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

        if (scopeMatches(ur, {
          classId: studentProfile.classId ?? undefined,
          sectionId: studentProfile.sectionId ?? undefined,
          subjectId: undefined,
          departmentId: undefined,
        })) return true;
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
  "ai_assessment:submit:own",
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
