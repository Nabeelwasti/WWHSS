import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/client.js", () => ({
  prisma: {
    userRole: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../db/client.js";
import { assertCanAssignRole, assertCanManageUser, UserValidationError } from "./users.service.js";

const mockedUserRoleFindMany = prisma.userRole.findMany as unknown as ReturnType<typeof vi.fn>;

describe("privileged user administration", () => {
  beforeEach(() => mockedUserRoleFindMany.mockReset());

  it("blocks a principal from assigning super_admin", async () => {
    mockedUserRoleFindMany
      .mockResolvedValueOnce([{ role: { key: "principal" } }])
      .mockResolvedValueOnce([]);

    await expect(assertCanAssignRole("principal-user", "target-user", "super_admin"))
      .rejects.toBeInstanceOf(UserValidationError);
  });

  it("blocks a principal from assigning an equal-level principal role", async () => {
    mockedUserRoleFindMany
      .mockResolvedValueOnce([{ role: { key: "principal" } }])
      .mockResolvedValueOnce([]);

    await expect(assertCanAssignRole("principal-user", "target-user", "principal"))
      .rejects.toThrow("equal to or higher");
  });

  it("allows a principal to assign a lower-level teacher role", async () => {
    mockedUserRoleFindMany
      .mockResolvedValueOnce([{ role: { key: "principal" } }])
      .mockResolvedValueOnce([]);

    await expect(assertCanAssignRole("principal-user", "teacher-user", "teacher")).resolves.toBeUndefined();
  });

  it("blocks a principal from modifying another principal", async () => {
    mockedUserRoleFindMany
      .mockResolvedValueOnce([{ role: { key: "principal" } }])
      .mockResolvedValueOnce([{ role: { key: "principal" } }]);

    await expect(assertCanManageUser("principal-user", "peer-principal"))
      .rejects.toThrow("equal or higher");
  });

  it("allows super_admin to administer another super_admin", async () => {
    mockedUserRoleFindMany
      .mockResolvedValueOnce([{ role: { key: "super_admin" } }])
      .mockResolvedValueOnce([{ role: { key: "super_admin" } }]);

    await expect(assertCanManageUser("admin-a", "admin-b")).resolves.toBeUndefined();
  });

  it("allows super_admin to grant super_admin", async () => {
    mockedUserRoleFindMany
      .mockResolvedValueOnce([{ role: { key: "super_admin" } }])
      .mockResolvedValueOnce([]);

    await expect(assertCanAssignRole("admin-a", "new-admin", "super_admin")).resolves.toBeUndefined();
  });

  it("rejects roles outside the approved privilege hierarchy", async () => {
    mockedUserRoleFindMany.mockResolvedValueOnce([{ role: { key: "principal" } }]);

    await expect(assertCanAssignRole("principal-user", "target-user", "custom_unknown"))
      .rejects.toThrow("approved privilege hierarchy");
  });
});
