import { describe, expect, it, vi } from "vitest";

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    verify: vi.fn(async (h: string, pw: string) => h === `hashed:${pw}`),
  },
}));

import { publicUserSelect } from "../modules/users/users.service.js";

function assertNoSensitiveFields(obj: unknown, path = ""): void {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => assertNoSensitiveFields(item, `${path}[${index}]`));
    return;
  }
  if (typeof obj === "object") {
    const sensitiveFieldNames = [
      "passwordHash",
      "password_hash",
      "tokenVersion",
      "token_version",
      "tokenHash",
      "token_hash",
      "refreshToken",
      "refresh_token",
      "secret",
      "rawPassword",
    ];
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const currentPath = path ? `${path}.${key}` : key;
      for (const forbidden of sensitiveFieldNames) {
        expect(key, `Found sensitive key "${key}" at path "${currentPath}"`).not.toBe(forbidden);
      }
      assertNoSensitiveFields((obj as Record<string, unknown>)[key], currentPath);
    }
  }
}

describe("Response Safe Serialization & publicUserSelect", () => {
  it("ensures publicUserSelect does not select private account fields", () => {
    expect(publicUserSelect).not.toHaveProperty("passwordHash");
    expect(publicUserSelect).not.toHaveProperty("tokenVersion");
    expect(publicUserSelect).not.toHaveProperty("refreshTokens");
  });

  it("recursively verifies sample nested responses containing user and staff structures have no secret fields", () => {
    const mockLeavesResponse = {
      leaves: [
        {
          id: "leave-1",
          staff: {
            id: "staff-1",
            user: {
              id: "user-1",
              email: "teacher@school.edu",
              fullName: "Jane Teacher",
              phone: "1234567890",
              photoUrl: null,
              isActive: true,
              createdAt: new Date(),
            },
          },
          approvedBy: { id: "admin-1", fullName: "Admin User" },
        },
      ],
    };

    assertNoSensitiveFields(mockLeavesResponse);

    const mockPayrollResponse = {
      periods: [
        {
          id: "period-1",
          records: [
            {
              id: "rec-1",
              staff: {
                id: "staff-1",
                user: {
                  id: "user-1",
                  email: "staff@school.edu",
                  fullName: "Staff Member",
                },
              },
            },
          ],
        },
      ],
    };

    assertNoSensitiveFields(mockPayrollResponse);
  });

  it("fails if an unauthorized response payload injects passwordHash or tokenVersion", () => {
    const leakyResponse = {
      user: {
        id: "user-1",
        email: "leak@school.edu",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$...",
      },
    };

    expect(() => assertNoSensitiveFields(leakyResponse)).toThrow();
  });
});
