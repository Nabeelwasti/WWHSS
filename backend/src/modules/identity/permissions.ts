import { prisma } from "../../db/client.js";

/**
 * The permission engine. Every module in the system routes access decisions
 * through this file — there must be exactly one place that answers
 * "is this user allowed to do X to Y", so it can be audited and trusted.
 *
 * Design: a user holds one or more (role, scope) pairs via UserRole rows.
 * A permission check asks: does the user hold, in some scope that covers
 * the requested resource, a role granted the requested permission key?
 *
 * "Scope covers the resource" is deliberately explicit rather than
 * inferred — e.g. holding "Subject Teacher" scoped to (classId=X,
 * subjectId=Y) authorizes attendance/grades actions only for students
 * enrolled in class X, only for subject Y. A teacher with no scoped role
 * for a class has zero access to it, regardless of job title.
 */

export type PermissionScope = {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  departmentId?: string;
  studentId?: string; // resolved to a relationship check (parent/guardian, or self)
};

export async function userHasPermission(
  userId: string,
  permissionKey: string,
  scope: PermissionScope = {}
): Promise<boolean> {
  // "Self-only" permissions (the ":own" keys) must NEVER be satisfiable via
  // a role assignment — scoped or unscoped. They exist specifically to mean
  // "this person's own record", resolved only by the relationship check in
  // step 2 below. Without this exclusion, a naturally-unscoped role (every
  // "student" or "parent" role, since a student's class lives on their
  // StudentProfile, not a role scope) would hit the unscoped-role shortcut
  // and return true for ANY requested studentId — letting any student view
  // or act as any other student. This was a real bug found and fixed here,
  // not a hypothetical: it affected attendance, exams, finance, and LMS
  // submission/quiz-attempt endpoints, which relied on this function to
  // enforce "only your own record."
  const isSelfOnlyPermission = SELF_ACCESS_PERMISSIONS.has(permissionKey) || GUARDIAN_ACCESS_PERMISSIONS.has(permissionKey);

  if (!isSelfOnlyPermission) {
    // A route that checks a permission with NO scope at all (e.g. a bare
    // authorize("users:manage")) is asking "does this user have blanket,
    // school-wide authority" — not "does this user have authority over
    // some particular class/section/subject I'm not bothering to check."
    // Without this distinction, a SCOPED role (a teacher scoped to one
    // class, holding "course:manage") would pass a bare, context-free
    // check for that same permission key, because every per-dimension
    // comparison below trivially defaults to "true" when the caller's
    // requested scope doesn't mention that dimension. This was a real,
    // currently-exploitable gap: the LMS "/resources" route checked
    // course:manage with no scope, so any teacher — scoped to any single
    // class/subject — could add a resource to ANY course school-wide.
    // That route is now fixed to pass its real resolved scope; this check
    // is the general defense so the same mistake can't recur silently on
    // a future route.
    const requestedScopeIsEmpty = !scope.classId && !scope.sectionId && !scope.subjectId && !scope.departmentId;

    // 1. Load every role this user holds, with its own scope columns.
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    for (const ur of userRoles) {
      const grantedKeys = ur.role.rolePermissions.map((rp) => rp.permission.key);
      if (!grantedKeys.includes(permissionKey)) continue;

      // Unscoped role assignment (all scope columns null) = school-wide
      // grant for that permission (used for Principal/Super Admin style
      // roles) — safe here because isSelfOnlyPermission is false, so this
      // branch is only reachable for genuinely staff/administrative keys.
      const roleIsUnscoped = !ur.classId && !ur.sectionId && !ur.subjectId && !ur.departmentId;
      if (roleIsUnscoped) return true;

      // A scoped role can never satisfy a context-free (empty-scope)
      // check — there's nothing real to match it against, so the safe
      // default is to deny, not to shrug and allow.
      if (requestedScopeIsEmpty) continue;

      // Scoped role: every scope dimension the role assignment specifies
      // must match the requested scope (or the requested scope doesn't care
      // about that dimension).
      const classOk = !ur.classId || !scope.classId || ur.classId === scope.classId;
      const sectionOk = !ur.sectionId || !scope.sectionId || ur.sectionId === scope.sectionId;
      const subjectOk = !ur.subjectId || !scope.subjectId || ur.subjectId === scope.subjectId;
      const deptOk = !ur.departmentId || !scope.departmentId || ur.departmentId === scope.departmentId;

      if (classOk && sectionOk && subjectOk && deptOk) return true;
    }
  }

  // 2. Relationship-based access (parents, and students viewing their own
  // record) that doesn't run through the role table at all. This is the
  // ONLY path that can satisfy a self-only permission.
  if (scope.studentId) {
    const isSelf = await isStudentSelf(userId, scope.studentId);
    if (isSelf && SELF_ACCESS_PERMISSIONS.has(permissionKey)) return true;

    const isGuardian = await isGuardianOfStudent(userId, scope.studentId);
    if (isGuardian && GUARDIAN_ACCESS_PERMISSIONS.has(permissionKey)) return true;
  }

  return false;
}

// Permissions a student always has over their own record, independent of
// any role assignment.
const SELF_ACCESS_PERMISSIONS = new Set([
  "attendance:view:own",
  "grades:view:own",
  "assignments:view:own",
  "timetable:view:own",
  "finance:view:own",
  "exams:view:own",
]);

// Permissions a parent/guardian has over a linked child's record.
const GUARDIAN_ACCESS_PERMISSIONS = new Set([
  "attendance:view:own",
  "grades:view:own",
  "assignments:view:own",
  "timetable:view:own",
  "announcements:view:own",
  "finance:view:own",
  "exams:view:own",
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

/**
 * Throws-on-failure convenience wrapper for use inside route handlers/services.
 */
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
