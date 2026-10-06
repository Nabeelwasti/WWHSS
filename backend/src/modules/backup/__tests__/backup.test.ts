import { describe, it, expect, beforeEach } from "vitest";
import {
  listBackups,
  verifyBackupRecovery,
  restoreFromBackup,
  setBackupProvider,
  MemoryBackupProvider,
  encryptData,
  decryptData,
} from "../backup.service.js";

describe("Backup & Recovery Service", () => {
  let memoryProvider: MemoryBackupProvider;
  const secret = "dev-backup-encryption-key-must-be-at-least-32-bytes!";

  beforeEach(() => {
    memoryProvider = new MemoryBackupProvider();
    setBackupProvider(memoryProvider);
  });

  it("encrypts and decrypts payload correctly using AES-256-GCM", () => {
    const raw = JSON.stringify({ test: "data", count: 42 });
    const encrypted = encryptData(raw, secret);
    expect(decryptData(encrypted, secret)).toBe(raw);
  });

  it("lists and verifies a valid encrypted backup", async () => {
    const tables = { users: [], roles: [], studentProfiles: [] };
    const encrypted = encryptData(JSON.stringify({ meta: { version: "1.0.0" }, tables }), secret);
    const filename = "backup-2026-10-06.enc.json";
    await memoryProvider.saveBackup(filename, JSON.stringify({
      id: "backup-2026-10-06",
      createdAt: new Date().toISOString(),
      version: "1.0.0",
      encrypted: true,
      data: encrypted,
      tableCounts: { users: 0, roles: 0, studentProfiles: 0 },
    }));
    expect((await listBackups())[0].filename).toBe(filename);
    expect((await verifyBackupRecovery(filename, secret)).valid).toBe(true);
  });

  it("requires a privileged user before any restore is attempted", async () => {
    await expect(restoreFromBackup("missing.enc.json", secret)).rejects.toThrow("privileged restoring user");
  });
});
