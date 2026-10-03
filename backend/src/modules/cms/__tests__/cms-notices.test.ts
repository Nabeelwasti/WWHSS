import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notice: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { getUserPermittedAudiences, listNoticesForAudiences } from "../cms.service.js";

const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockNoticeFindMany = prisma.notice.findMany as unknown as ReturnType<typeof vi.fn>;

describe("CMS Notice Audience Isolation", () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockNoticeFindMany.mockReset();
  });

  it("anonymous / unknown user defaults strictly to public notices", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const audiences = await getUserPermittedAudiences("unknown-id");
    expect(Array.from(audiences)).toEqual(["public"]);
  });

  it("student user has access to public and students notices", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "student-user",
      userRoles: [{ role: { key: "student", rolePermissions: [] } }],
      studentProfile: { id: "profile-1" },
      guardianOf: [],
    });

    const audiences = await getUserPermittedAudiences("student-user");
    expect(audiences.has("public")).toBe(true);
    expect(audiences.has("students")).toBe(true);
    expect(audiences.has("teachers")).toBe(false);
    expect(audiences.has("staff")).toBe(false);
  });

  it("teacher user has access to public, teachers, staff, and students notices", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "teacher-user",
      userRoles: [{ role: { key: "teacher", rolePermissions: [] } }],
      studentProfile: null,
      guardianOf: [],
    });

    const audiences = await getUserPermittedAudiences("teacher-user");
    expect(audiences.has("public")).toBe(true);
    expect(audiences.has("teachers")).toBe(true);
    expect(audiences.has("staff")).toBe(true);
    expect(audiences.has("students")).toBe(true);
    expect(audiences.has("parents")).toBe(false);
  });

  it("parent user has access to public, parents, and student notices", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "parent-user",
      userRoles: [{ role: { key: "parent", rolePermissions: [] } }],
      studentProfile: null,
      guardianOf: [{ id: "link-1" }],
    });

    const audiences = await getUserPermittedAudiences("parent-user");
    expect(audiences.has("public")).toBe(true);
    expect(audiences.has("parents")).toBe(true);
    expect(audiences.has("students")).toBe(true);
    expect(audiences.has("teachers")).toBe(false);
  });

  it("administrator / principal user has access to all notice audiences", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "admin-user",
      userRoles: [{ role: { key: "principal", rolePermissions: [] } }],
      studentProfile: null,
      guardianOf: [],
    });

    const audiences = await getUserPermittedAudiences("admin-user");
    expect(audiences.has("public")).toBe(true);
    expect(audiences.has("teachers")).toBe(true);
    expect(audiences.has("staff")).toBe(true);
    expect(audiences.has("students")).toBe(true);
    expect(audiences.has("parents")).toBe(true);
  });

  it("listNoticesForAudiences queries only the allowed audiences", async () => {
    mockNoticeFindMany.mockResolvedValue([{ id: "1", title: "Notice", audience: "public" }]);
    const result = await listNoticesForAudiences(["public", "students"]);
    expect(mockNoticeFindMany).toHaveBeenCalledWith({
      where: { audience: { in: ["public", "students"] } },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
    expect(result).toHaveLength(1);
  });
});
