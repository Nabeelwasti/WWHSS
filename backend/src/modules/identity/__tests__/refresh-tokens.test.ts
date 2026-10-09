import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    verify: vi.fn(async (hash: string, pw: string) => hash === `hashed:${pw}`),
  },
}));

vi.mock("../../../config/env.js", () => ({
  env: {
    jwtAccessSecret: "test",
    jwtRefreshSecret: "test",
    jwtIssuer: "test-issuer",
    jwtAudience: "test-audience",
    accessTokenTtlMin: 15,
    refreshTokenTtlDays: 30,
    nodeEnv: "test",
  },
}));

const { mockFindFirst, mockUpdateMany, mockCreate, mockUserFindUnique, mockAuditCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCreate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock("../../../db/client.js", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        refreshToken: {
          findFirst: mockFindFirst,
          updateMany: mockUpdateMany,
          create: mockCreate,
        },
        user: {
          findUnique: mockUserFindUnique,
        },
        auditLog: {
          create: mockAuditCreate,
        },
      })
    ),
    refreshToken: {
      findFirst: mockFindFirst,
      updateMany: mockUpdateMany,
      create: mockCreate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

import { refresh, AuthError } from "../auth.service.js";

describe("Refresh Token Rotation Security", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdateMany.mockReset();
    mockCreate.mockReset();
    mockUserFindUnique.mockReset();
    mockAuditCreate.mockReset();
  });

  it("rotates refresh token cleanly on valid presentation", async () => {
    mockFindFirst.mockResolvedValue({
      id: "rt-1",
      userId: "u-1",
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserFindUnique.mockResolvedValue({ id: "u-1", email: "user@school.edu", isActive: true });
    mockCreate.mockResolvedValue({});

    const result = await refresh("valid-token");
    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "rt-1", revoked: false }),
        data: expect.objectContaining({ revoked: true, rotatedAt: expect.any(Date) }),
      })
    );
  });

  it("prevents duplicate consumption under concurrent requests (race condition protection)", async () => {
    mockFindFirst.mockResolvedValue({
      id: "rt-1",
      userId: "u-1",
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(refresh("stolen-or-replayed-token")).rejects.toThrow(AuthError);
  });

  it("commits session revocation and an audit event when a revoked refresh token is replayed", async () => {
    mockFindFirst.mockResolvedValue({
      id: "rt-replayed",
      userId: "u-1",
      revoked: true,
      rotatedAt: new Date(Date.now() - 6000),
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockUpdateMany.mockResolvedValue({ count: 2 });
    mockAuditCreate.mockResolvedValue({});

    await expect(refresh("replayed-token")).rejects.toThrow(AuthError);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", revoked: false },
      data: { revoked: true },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: {
        userId: "u-1",
        action: "auth:refresh_reuse_detected",
        metadata: { refreshTokenId: "rt-replayed" },
      },
    });
  });

  it("does not revoke other sessions for a bounded concurrent refresh retry", async () => {
    mockFindFirst.mockResolvedValue({
      id: "rt-recent",
      userId: "u-1",
      revoked: true,
      rotatedAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockAuditCreate.mockResolvedValue({});

    await expect(refresh("concurrent-token")).rejects.toThrow(AuthError);

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: {
        userId: "u-1",
        action: "auth:refresh_concurrent_retry",
        metadata: { refreshTokenId: "rt-recent" },
      },
    });
  });

  it("rejects an inactive user account during refresh attempt", async () => {
    mockFindFirst.mockResolvedValue({
      id: "rt-1",
      userId: "u-1",
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserFindUnique.mockResolvedValue({ id: "u-1", email: "user@school.edu", isActive: false });

    await expect(refresh("token-for-deactivated-user")).rejects.toThrow(AuthError);
  });
});
