import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    user: { create: vi.fn(), update: vi.fn() },
    userRole: { create: vi.fn(), delete: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  prisma: {
    user: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn() },
    class: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
    subject: { findUnique: vi.fn() },
    department: { findUnique: vi.fn() },
    userRole: { findMany: vi.fn(), findUnique: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("argon2", () => ({ default: { hash: vi.fn(async () => "hashed-password") } }));
vi.mock("../../db/client.js", () => ({ prisma: mocks.prisma }));

import { prisma } from "../../db/client.js";
import { assignRole, createUser, deactivateUser, removeRoleAssignment, resetPassword } from "./users.service.js";

describe("user administration audit atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx));
    mocks.prisma.userRole.findMany.mockImplementation(async ({ where }: { where: { userId: string } }) => [
      { role: { key: where.userId === "actor" ? "super_admin" : "student" } },
    ]);
    mocks.prisma.userRole.findUnique.mockResolvedValue({ userId: "target" });
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "target" });
    mocks.prisma.role.findUnique.mockResolvedValue({ id: "role-teacher" });
    mocks.tx.user.create.mockResolvedValue({ id: "created-user", email: "new@example.com", fullName: "New User" });
    mocks.tx.user.update.mockResolvedValue({ id: "target", isActive: false });
    mocks.tx.userRole.create.mockResolvedValue({ id: "assignment", role: { key: "teacher" } });
    mocks.tx.userRole.delete.mockResolvedValue({ id: "assignment" });
    mocks.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("commits user creation and its audit event in the same transaction", async () => {
    await createUser({ email: "new@example.com", fullName: "New User", actorId: "actor" });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.user.create).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: { userId: "actor", action: "users:create", resource: "user:created-user" },
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("commits role assignment and its audit event together", async () => {
    mocks.prisma.class.findUnique.mockResolvedValue({ id: "class-9" });
    await assignRole({ userId: "target", roleKey: "teacher", classId: "class-9", actorId: "actor" });
    expect(mocks.tx.userRole.create).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "actor", action: "users:assign_role", resource: "user:target" }),
    }));
  });

  it("commits role removal and its audit event together", async () => {
    await removeRoleAssignment("assignment", "actor");
    expect(mocks.tx.userRole.delete).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "actor", action: "users:remove_role", resource: "user_role:assignment" }),
    }));
  });

  it("commits deactivation, refresh-token revocation, and audit together", async () => {
    await deactivateUser("target", "actor");
    expect(mocks.tx.user.update).toHaveBeenCalledOnce();
    expect(mocks.tx.refreshToken.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "actor", action: "users:deactivate", resource: "user:target" }),
    }));
  });

  it("commits password reset, session revocation, and audit together", async () => {
    await resetPassword("target", "actor");
    expect(mocks.tx.user.update).toHaveBeenCalledOnce();
    expect(mocks.tx.refreshToken.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "actor", action: "users:reset_password", resource: "user:target" }),
    }));
  });

  it("fails the mutation when the required audit write fails", async () => {
    mocks.tx.auditLog.create.mockRejectedValueOnce(new Error("audit storage unavailable"));
    await expect(createUser({ email: "new@example.com", fullName: "New User", actorId: "actor" }))
      .rejects.toThrow("audit storage unavailable");
  });
});
