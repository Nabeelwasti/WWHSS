import { describe, it, expect, beforeEach } from "vitest";
import {
  listBackups,
  verifyBackupRecovery,
  restoreFromBackup,
  setBackupProvider,
  MemoryBackupProvider,
  encryptData,
  decryptData,
  BackupMetadata,
} from "../backup.service.js";

describe("Backup & Recovery Service Test Suite", () => {
  let memoryProvider: MemoryBackupProvider;

  beforeEach(() => {
    memoryProvider = new MemoryBackupProvider();
    setBackupProvider(memoryProvider);
  });

  it("encrypts and decrypts payload correctly using AES-256-GCM", () => {
    const raw = JSON.stringify({ test: "data", count: 42 });
    const secret = "a-very-secret-encryption-key-32b!";
    const encrypted = encryptData(raw, secret);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = decryptData(encrypted, secret);
    expect(decrypted).toBe(raw);
  });

  it("lists, verifies recovery and restores from encrypted backup payload", async () => {
    const secret = "dev-backup-encryption-key-must-be-at-least-32-bytes!";
    const mockDbData = {
      meta: { exportedAt: new Date().toISOString(), version: "1.0.0" },
      tables: { users: 5, roles: 3, studentProfiles: 10 },
    };
    const encrypted = encryptData(JSON.stringify(mockDbData), secret);
    const filename = "backup-2026-10-06.enc.json";

    const payload = {
      id: "backup-2026-10-06",
      createdAt: new Date().toISOString(),
      version: "1.0.0",
      encrypted: true,
      data: encrypted,
      tableCounts: { users: 5, roles: 3, studentProfiles: 10 },
    };

    await memoryProvider.saveBackup(filename, JSON.stringify(payload));

    const backups: BackupMetadata[] = await listBackups();
    expect(backups.length).toBe(1);
    expect(backups[0].filename).toBe(filename);

    const verification = await verifyBackupRecovery(filename, secret);
    expect(verification.valid).toBe(true);
    expect(verification.summary.users).toBe(5);

    const restore = await restoreFromBackup(filename, secret);
    expect(restore.success).toBe(true);
    expect(restore.summary.studentProfiles).toBe(10);
  });
});
