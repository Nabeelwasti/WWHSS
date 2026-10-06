import { describe, expect, it, beforeAll } from "vitest";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { S3BackupProvider } from "../modules/backup/backup.service.js";

const endpoint = process.env.S3_ENDPOINT || "http://127.0.0.1:9000";
const bucket = process.env.S3_BUCKET || "wwhss-backups";

describe("S3 backup provider integration", () => {
  beforeAll(async () => {
    const client = new S3Client({ endpoint, region: process.env.S3_REGION || "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || "minioadmin", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "minioadmin" } });
    try { await client.send(new CreateBucketCommand({ Bucket: bucket })); } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already|exists/i.test(message)) throw error;
    }
  });

  it("round-trips an encrypted backup object through S3-compatible storage", async () => {
    const provider = new S3BackupProvider();
    const filename = `backup-integration-${Date.now()}.enc.json`;
    const payload = JSON.stringify({ id: filename, createdAt: new Date().toISOString(), version: "1.1.0", encrypted: true, data: { ciphertext: "aa", iv: "bb", tag: "cc" }, tableCounts: {} });
    await provider.saveBackup(filename, payload);
    expect(await provider.getBackupPayload(filename)).toBe(payload);
    expect((await provider.listBackups()).some((b) => b.filename === filename)).toBe(true);
    await provider.deleteBackup(filename);
    await expect(provider.getBackupPayload(filename)).rejects.toThrow(/not found/i);
  });
});
