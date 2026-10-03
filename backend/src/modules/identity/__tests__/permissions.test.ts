import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma client module before importing the code under test, so
// these tests exercise the real permission LOGIC without needing an actual
// Postgres instance. This is a genuine automated test, not a placeholder —
// run it with `npm test` after `npm install`.
vi.mock("../../../db/client.js", () => ({
  prisma: {
    userRole: { findMany: vi.fn() },
    studentProfile: { findUnique: vi.fn() },
    parentStudentLink: { findFirst: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { userHasPermission } from "../permissions.js";

const mockedFindMany = prisma.userRole.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedStudentFind = prisma.studentProfile.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedGuardianFind = prisma.parentStudentLink.findFirst as unknown as ReturnType<typeof vi.fn>;

describe("userHasPermission", () => {
  beforeEach(() => {
    mockedFindMany.mockReset();
    mockedStudentFind.mockReset();
    mockedGuardianFind.mockReset();
  });

  it("denies a permission the user's role does not grant", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: null,
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "attendance:view:class" } }] },
      },
    ]);

    const allowed = await userHasPermission("user-1", "finance:manage");
    expect(allowed).toBe(false);
  });

  it("grants an unscoped role's permission school-wide", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: null,
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "finance:view" } }] },
      },
    ]);

    const allowed = await userHasPermission("principal-1", "finance:view", { classId: "any-class" });
    expect(allowed).toBe(true);
  });

  it("denies a scoped teacher role for a DIFFERENT class than assigned", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: "grade-9",
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "attendance:mark" } }] },
      },
    ]);

    const allowed = await userHasPermission("teacher-1", "attendance:mark", { classId: "grade-10" });
    expect(allowed).toBe(false);
  });

  it("grants a scoped teacher role for the exact class it's assigned to", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: "grade-10",
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "attendance:mark" } }] },
      },
    ]);

    const allowed = await userHasPermission("teacher-1", "attendance:mark", { classId: "grade-10" });
    expect(allowed).toBe(true);
  });

  it("lets a student view their own attendance with no role assignment at all", async () => {
    mockedFindMany.mockResolvedValue([]);
    mockedStudentFind.mockResolvedValue({ id: "student-profile-1", userId: "student-user-1" });

    const allowed = await userHasPermission("student-user-1", "attendance:view:own", {
      studentId: "student-profile-1",
    });
    expect(allowed).toBe(true);
  });

  it("denies a DIFFERENT student trying to view someone else's attendance", async () => {
    mockedFindMany.mockResolvedValue([]);
    mockedStudentFind.mockResolvedValue({ id: "student-profile-1", userId: "someone-else" });
    mockedGuardianFind.mockResolvedValue(null);

    const allowed = await userHasPermission("student-user-1", "attendance:view:own", {
      studentId: "student-profile-1",
    });
    expect(allowed).toBe(false);
  });

  it("lets a linked guardian view their child's attendance", async () => {
    mockedFindMany.mockResolvedValue([]);
    mockedStudentFind.mockResolvedValue({ id: "student-profile-1", userId: "the-student" });
    mockedGuardianFind.mockResolvedValue({ id: "link-1", parentId: "parent-1", studentId: "student-profile-1" });

    const allowed = await userHasPermission("parent-1", "attendance:view:own", {
      studentId: "student-profile-1",
    });
    expect(allowed).toBe(true);
  });

  it("denies an unrelated adult who is neither the student nor a linked guardian", async () => {
    mockedFindMany.mockResolvedValue([]);
    mockedStudentFind.mockResolvedValue({ id: "student-profile-1", userId: "the-student" });
    mockedGuardianFind.mockResolvedValue(null);

    const allowed = await userHasPermission("random-user", "attendance:view:own", {
      studentId: "student-profile-1",
    });
    expect(allowed).toBe(false);
  });

  it("denies a subject-scoped teacher role when the class matches but the subject does not", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: "grade-10",
        sectionId: null,
        subjectId: "physics",
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "course:manage" } }] },
      },
    ]);

    const allowed = await userHasPermission("teacher-1", "course:manage", {
      classId: "grade-10",
      subjectId: "chemistry",
    });
    expect(allowed).toBe(false);
  });

  it("grants a subject-scoped teacher role only when BOTH class and subject match", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: "grade-10",
        sectionId: null,
        subjectId: "physics",
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "course:manage" } }] },
      },
    ]);

    const allowed = await userHasPermission("teacher-1", "course:manage", {
      classId: "grade-10",
      subjectId: "physics",
    });
    expect(allowed).toBe(true);
  });

  it("CRITICAL REGRESSION TEST — the vulnerability this fixes: an unscoped 'student' role must NOT grant access to another student's record", async () => {
    // This is exactly the shape of a real student's role assignment: no
    // classId/sectionId/subjectId/departmentId (a student's class lives on
    // their StudentProfile, not their role), holding a self-only permission.
    // Before the fix, `roleIsUnscoped` short-circuited this to `true` for
    // ANY requested studentId, before the self/guardian check ever ran —
    // meaning any student could view or act as any other student on every
    // endpoint using attendance:view:own, assignments:view:own,
    // finance:view:own, or exams:view:own.
    mockedFindMany.mockResolvedValue([
      {
        classId: null,
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "attendance:view:own" } }] },
      },
    ]);
    mockedStudentFind.mockResolvedValue({ id: "victim-profile", userId: "victim-user" });
    mockedGuardianFind.mockResolvedValue(null);

    const allowed = await userHasPermission("attacker-student-user", "attendance:view:own", {
      studentId: "victim-profile",
    });
    expect(allowed).toBe(false);
  });

  it("the same fix must not break a student's genuine access to their OWN record", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: null,
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "attendance:view:own" } }] },
      },
    ]);
    mockedStudentFind.mockResolvedValue({ id: "own-profile", userId: "real-student-user" });

    const allowed = await userHasPermission("real-student-user", "attendance:view:own", {
      studentId: "own-profile",
    });
    expect(allowed).toBe(true);
  });

  it("self-only permissions can never be granted via role scope even if a role is (unusually) assigned with matching scope columns", async () => {
    // Defense in depth: even if someone mis-configures a role assignment to
    // look scoped, self-only keys must still route only through the
    // relationship check, never through role matching.
    mockedFindMany.mockResolvedValue([
      {
        classId: "grade-10",
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "assignments:view:own" } }] },
      },
    ]);
    mockedStudentFind.mockResolvedValue({ id: "victim-profile", userId: "victim-user" });
    mockedGuardianFind.mockResolvedValue(null);

    const allowed = await userHasPermission("attacker-user", "assignments:view:own", {
      studentId: "victim-profile",
      classId: "grade-10",
    });
    expect(allowed).toBe(false);
  });

  it("SECOND REAL BUG FOUND & FIXED — a bare, context-free permission check must NOT be satisfiable by a SCOPED role", async () => {
    // This is exactly the shape of the /resources route's original bug: a
    // teacher scoped to one class/subject, holding "course:manage", and a
    // route checking that permission with no scope at all (scope={}).
    // Before this fix, every per-dimension comparison defaulted to "true"
    // when the requested scope didn't mention that dimension — so a scoped
    // teacher could pass a completely context-free check meant to mean
    // "school-wide authority only."
    mockedFindMany.mockResolvedValue([
      {
        classId: "grade-10",
        sectionId: null,
        subjectId: "physics",
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "course:manage" } }] },
      },
    ]);

    const allowed = await userHasPermission("scoped-teacher", "course:manage", {});
    expect(allowed).toBe(false);
  });

  it("a bare check still correctly grants a genuinely unscoped (school-wide) role", async () => {
    mockedFindMany.mockResolvedValue([
      {
        classId: null,
        sectionId: null,
        subjectId: null,
        departmentId: null,
        role: { rolePermissions: [{ permission: { key: "users:manage" } }] },
      },
    ]);

    const allowed = await userHasPermission("principal-1", "users:manage", {});
    expect(allowed).toBe(true);
  });
});
