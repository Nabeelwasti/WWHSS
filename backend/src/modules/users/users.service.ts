import argon2 from "argon2";
import crypto from "node:crypto";
import { prisma } from "../../db/client.js";

// Every function here performs a real write against the real database.
// There is no seed/demo shortcut — this is the same code path a live
// deployment uses to onboard its actual staff, students, and parents.

export async function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      userRoles: { select: { role: { select: { key: true, name: true } }, classId: true, sectionId: true } },
    },
    orderBy: { fullName: "asc" },
  });
}

// Creates a real account. If no password is supplied, generates a random
// one-time password the admin must relay to the person out-of-band and
// which should be changed on first login (self-service password change is
// a follow-up module, not faked here).
export async function createUser(input: { email: string; fullName: string; phone?: string; password?: string }) {
  const rawPassword = input.password ?? crypto.randomBytes(9).toString("base64url");
  const passwordHash = await argon2.hash(rawPassword);

  const user = await prisma.user.create({
    data: { email: input.email, fullName: input.fullName, phone: input.phone, passwordHash },
  });

  // Only returned once, at creation time — never stored or logged in
  // plaintext, and never fabricated as a "default" like the seed admin.
  return { user, temporaryPassword: input.password ? undefined : rawPassword };
}

export async function assignRole(input: {
  userId: string;
  roleKey: string;
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  departmentId?: string;
}) {
  const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw new Error(`Unknown role: ${input.roleKey}`);

  return prisma.userRole.create({
    data: {
      userId: input.userId,
      roleId: role.id,
      classId: input.classId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      departmentId: input.departmentId,
    },
  });
}

export async function removeRoleAssignment(userRoleId: string) {
  return prisma.userRole.delete({ where: { id: userRoleId } });
}

export async function deactivateUser(userId: string) {
  // Soft delete only — never hard-delete a person's account, since that
  // would silently orphan their real attendance/grade/finance history.
  const user = await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

  // Defense in depth: the refresh endpoint already re-checks isActive and
  // would reject this person's next refresh regardless, but revoking their
  // outstanding refresh tokens immediately — rather than waiting for that
  // check to matter — means a leaked or shared refresh token stops working
  // the moment an admin deactivates the account, not up to its natural
  // expiry (default 30 days) later.
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });

  return user;
}

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}

// For the very common "I forgot my password" case. An administrator
// generates a fresh one-time password and relays it in person or by phone.
// Every existing session for that person is ended immediately.
export async function resetPassword(userId: string) {
  const temporaryPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await argon2.hash(temporaryPassword);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });

  return { temporaryPassword };
}
