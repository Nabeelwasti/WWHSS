import { afterEach, describe, expect, it, vi } from "vitest";

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://wwhss:secret@localhost:5432/wwhss",
  JWT_ACCESS_SECRET: "access-secret-unique-value-1234567890",
  JWT_REFRESH_SECRET: "refresh-secret-unique-value-1234567890",
  JWT_ISSUER: "https://api.school.example",
  JWT_AUDIENCE: "https://school.example",
  BACKUP_ENCRYPTION_KEY: "backup-secret-unique-value-1234567890",
  STORAGE_PROVIDER: "s3",
  BACKUP_PROVIDER: "s3",
  S3_BUCKET: "wwhss-test",
  CORS_ORIGIN: "https://school.example",
  TRUST_PROXY: "1",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("production cryptographic secret separation", () => {
  it.each([
    ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"],
    ["JWT_ACCESS_SECRET", "BACKUP_ENCRYPTION_KEY"],
    ["JWT_REFRESH_SECRET", "BACKUP_ENCRYPTION_KEY"],
  ] as const)("rejects reuse of %s and %s", async (first, second) => {
    for (const [key, value] of Object.entries(productionEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv(second, productionEnvironment[first]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../env.js")).rejects.toThrow("Environment validation failed");
  });

  it("accepts independent strong production secrets", async () => {
    for (const [key, value] of Object.entries(productionEnvironment)) {
      vi.stubEnv(key, value);
    }

    const { env } = await import("../env.js");
    expect(new Set([env.jwtAccessSecret, env.jwtRefreshSecret, env.backupEncryptionKey]).size).toBe(3);
  });
});
