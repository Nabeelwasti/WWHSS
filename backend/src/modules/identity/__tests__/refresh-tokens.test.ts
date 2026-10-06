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

const { mockFindFirst, mockUpdateMany, mockCreate, mockUserFindUnique } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCreate: vi.fn(),
  mockUserFindUnique: vi.fn(),
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
        data: { revoked: true },
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
