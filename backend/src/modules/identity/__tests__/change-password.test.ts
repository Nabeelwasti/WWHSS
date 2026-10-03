import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("argon2", () => ({
  default: {
    // Deterministic stand-ins so the test exercises OUR logic, not the
    // hashing library: "hash(x)" is just "hashed:x".
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    verify: vi.fn(async (hash: string, pw: string) => hash === `hashed:${pw}`),
  },
}));

vi.mock("../../../config/env.js", () => ({
  env: {
    jwtAccessSecret: "test",
    jwtRefreshSecret: "test",
    accessTokenTtlMin: 15,
    refreshTokenTtlDays: 30,
    nodeEnv: "test",
  },
}));

vi.mock("../../../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { changePassword, AuthError } from "../auth.service.js";

describe("changePassword", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.update).mockReset();
    vi.mocked(prisma.refreshToken.updateMany).mockReset();
  });

  it("rejects a wrong current password and changes nothing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      isActive: true,
      passwordHash: "hashed:the-real-password",
    } as never);

    await expect(changePassword("u1", "not-the-password", "a-brand-new-password")).rejects.toThrow(AuthError);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("changes the password and signs out every session when the current password is right", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      isActive: true,
      passwordHash: "hashed:old-password-123",
    } as never);

    await changePassword("u1", "old-password-123", "a-brand-new-password");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed:a-brand-new-password" },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revoked: false },
      data: { revoked: true },
    });
  });

  it("refuses to 'change' to the same password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      isActive: true,
      passwordHash: "hashed:same-password-1",
    } as never);

    await expect(changePassword("u1", "same-password-1", "same-password-1")).rejects.toThrow(AuthError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses for a deactivated account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      isActive: false,
      passwordHash: "hashed:whatever-123",
    } as never);

    await expect(changePassword("u1", "whatever-123", "a-brand-new-password")).rejects.toThrow(AuthError);
  });
});
