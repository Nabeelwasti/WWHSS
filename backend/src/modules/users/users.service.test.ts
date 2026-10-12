import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("mocked_hash"),
    verify: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue("mocked_hash"),
  verify: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../db/client.js", () => ({
  prisma: {
    userRole: { findMany: vi.fn() },
    studentProfile: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  },
}));

import { prisma } from "../../db/client.js";
import { assertCanAssignRole, assertCanManageUser, UserValidationError, searchStudentProfiles, getStudentProfileById } from "./users.service.js";

const mockedUserRoleFindMany = prisma.userRole.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedStudentFindMany = prisma.studentProfile.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedStudentCount = prisma.studentProfile.count as unknown as ReturnType<typeof vi.fn>;
const mockedStudentFindUnique = prisma.studentProfile.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("privileged user administration", () => {
  beforeEach(() => {
    mockedUserRoleFindMany.mockReset();
    mockedStudentFindMany.mockReset();
    mockedStudentCount.mockReset();
    mockedStudentFindUnique.mockReset();
  });

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

describe("student privacy boundaries", () => {
  beforeEach(() => {
    mockedStudentFindMany.mockReset();
    mockedStudentCount.mockReset();
    mockedStudentFindUnique.mockReset();
  });

  it("uses a least-privilege selection for student lists unless sensitive access is granted", async () => {
    mockedStudentFindMany.mockResolvedValue([]);
    mockedStudentCount.mockResolvedValue(0);
    await searchStudentProfiles();
    const safeSelect = mockedStudentFindMany.mock.calls[0][0].select;
    for (const field of ["guardianPhone", "emergencyContact", "address", "city", "bloodGroup", "medicalNotes", "fundingCategoryId", "fundingRecords", "fatherName", "motherName", "boardRegistrationNo"]) {
      expect(safeSelect).not.toHaveProperty(field);
    }
    expect(safeSelect.user.select).not.toHaveProperty("phone");
    expect(safeSelect.guardians.include.parent.select).not.toHaveProperty("phone");

    await searchStudentProfiles({ includeSensitive: true });
    const privilegedSelect = mockedStudentFindMany.mock.calls[1][0].select;
    expect(privilegedSelect).toHaveProperty("medicalNotes", true);
    expect(privilegedSelect).toHaveProperty("guardianPhone", true);
    expect(privilegedSelect.user.select).toHaveProperty("phone", true);
  });

  it("redacts student sensitive and financial fields from ordinary full-profile responses", async () => {
    mockedStudentFindUnique.mockResolvedValue({
      id: "student-1", admissionNo: "A-1", classId: null, sectionId: null,
      guardianPhone: "111", emergencyContact: "222", address: "Private address",
      city: "Lahore", bloodGroup: "O+", medicalNotes: "Private notes",
      fatherName: "Father", motherName: "Mother", guardianName: "Guardian",
      guardianRelation: "Parent", dateOfBirth: new Date("2010-01-01"),
      fundingCategoryId: "funding-1", fundingCategory: { name: "Welfare" },
      fundingRecords: [{ id: "funding-record-1" }],
      feeInvoices: [{ id: "invoice-1", payments: [{ id: "payment-1" }] }],
      user: { id: "user-1", fullName: "Student", email: "student@school.edu", phone: "333" },
      guardians: [{ parent: { id: "parent-1", fullName: "Parent", email: "parent@school.edu", phone: "444" } }],
      class: null, section: null, documentRecords: [],
    });
    const profile = await getStudentProfileById("student-1");
    for (const field of ["guardianPhone", "emergencyContact", "address", "city", "bloodGroup", "medicalNotes", "fatherName", "motherName", "guardianName", "guardianRelation", "dateOfBirth", "fundingCategoryId", "fundingCategory", "fundingRecords", "feeInvoices", "documentRecords"]) {
      expect(profile).not.toHaveProperty(field);
    }
    expect(profile.user).not.toHaveProperty("phone");
    expect(profile.guardians[0].parent).not.toHaveProperty("phone");
    expect(profile).toHaveProperty("sensitiveFieldsRedacted", true);
    expect(profile).toHaveProperty("financialFieldsRedacted", true);
    expect(mockedStudentFindUnique.mock.calls[0][0].include).not.toHaveProperty("documentRecords");

    await getStudentProfileById("student-1", false, false, true);
    expect(mockedStudentFindUnique.mock.calls[1][0].include).toHaveProperty("documentRecords");
  });
});
