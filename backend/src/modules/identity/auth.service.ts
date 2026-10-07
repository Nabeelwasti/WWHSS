import argon2 from "argon2";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { signAccessToken, newRefreshTokenValue, hashRefreshToken } from "./tokens.js";

export class AuthError extends Error {}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw new AuthError("Invalid credentials");

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new AuthError("Invalid credentials");

  const accessToken = signAccessToken({ sub: user.id, email: user.email, tokenVersion: user.tokenVersion });
  const { token: refreshToken, hash } = newRefreshTokenValue();

  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "auth:login" },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, fullName: user.fullName },
  };
}

export async function refresh(presentedToken: string) {
  const hash = hashRefreshToken(presentedToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const record = await tx.refreshToken.findFirst({ where: { tokenHash: hash } });

    if (!record || record.expiresAt < now) {
      throw new AuthError("Invalid or expired refresh token");
    }

    if (record.revoked) {
      await tx.refreshToken.updateMany({ where: { userId: record.userId, revoked: false }, data: { revoked: true } });
      await tx.auditLog.create({ data: { userId: record.userId, action: "auth:refresh_reuse_detected", metadata: { refreshTokenId: record.id } } });
      throw new AuthError("Invalid or expired refresh token");
    }

    // Atomic conditional update: exactly one concurrent request can flip revoked: false -> true
    const claimResult = await tx.refreshToken.updateMany({
      where: {
        id: record.id,
        revoked: false,
        expiresAt: { gt: now },
      },
      data: { revoked: true },
    });

    if (claimResult.count !== 1) {
      throw new AuthError("Invalid or expired refresh token");
    }

    const user = await tx.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.isActive) throw new AuthError("Account inactive");

    const accessToken = signAccessToken({ sub: user.id, email: user.email, tokenVersion: user.tokenVersion });
    const { token: newRefresh, hash: newHash } = newRefreshTokenValue();
    const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    await tx.refreshToken.create({ data: { userId: user.id, tokenHash: newHash, expiresAt } });

    return { accessToken, refreshToken: newRefresh };
  });
}


export async function logout(presentedToken: string) {
  const hash = hashRefreshToken(presentedToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash: hash }, data: { revoked: true } });
}


// Self-service password change. Requires the CURRENT password even though
// the person is already logged in: otherwise anyone who briefly borrows an
// unlocked phone (very common on shared family devices) could lock the real
// owner out permanently.
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new AuthError("Account not available");

  const valid = await argon2.verify(user.passwordHash, currentPassword);
  if (!valid) throw new AuthError("Your current password is incorrect");

  if (newPassword === currentPassword) {
    throw new AuthError("Your new password must be different from the current one");
  }

  const passwordHash = await argon2.hash(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    // Sign out every other session
    await tx.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });

    await tx.auditLog.create({ data: { userId, action: "auth:change_password" } });
  });
}
