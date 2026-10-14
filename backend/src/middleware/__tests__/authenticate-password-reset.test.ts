import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { findUser, verifyToken } = vi.hoisted(() => ({
  findUser: vi.fn(),
  verifyToken: vi.fn(() => ({ sub: "user-1", tokenVersion: 0 })),
}));

vi.mock("../../db/client.js", () => ({ prisma: { user: { findUnique: findUser } } }));
vi.mock("../../modules/identity/tokens.js", () => ({ verifyAccessToken: verifyToken }));

import { authenticate } from "../authenticate.js";

function requestFor(originalUrl: string) {
  return { headers: { authorization: "Bearer test-token" }, originalUrl } as unknown as Request;
}
function responseMock() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res as unknown as Response & typeof res;
}

describe("mandatory temporary-password change gate", () => {
  beforeEach(() => {
    findUser.mockReset();
    verifyToken.mockClear();
    findUser.mockResolvedValue({ id: "user-1", isActive: true, tokenVersion: 0, mustChangePassword: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("blocks ordinary protected routes until the temporary password is changed", async () => {
    const req = requestFor("/api/users");
    const res = responseMock();
    const next = vi.fn() as unknown as NextFunction;
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PASSWORD_CHANGE_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["/api/auth/me", "/api/auth/change-password"])("allows the password recovery route %s", async (path) => {
    const req = requestFor(path);
    const res = responseMock();
    const next = vi.fn() as unknown as NextFunction;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("user-1");
  });
});
