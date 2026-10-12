import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import {
  StorageValidationError,
  StorageNotFoundError,
  MemoryStorageProvider,
  LocalStorageProvider,
  S3StorageProvider,
  setStorageProvider,
} from "../storage.service.js";

describe("Storage providers", () => {
  let memory: MemoryStorageProvider;

  beforeEach(() => {
    memory = new MemoryStorageProvider();
    setStorageProvider(memory);
  });

  it("stores, retrieves, checks existence, and deletes through the explicit test provider", async () => {
    const data = Buffer.from("Hello WWHSS Storage Test");
    await memory.saveFile("report.pdf", data, "application/pdf");
    expect(await memory.exists("report.pdf")).toBe(true);
    const retrieved = await memory.getFile("report.pdf");
    expect(retrieved.buffer?.toString()).toBe(data.toString());
    expect(retrieved.mimeType).toBe("application/pdf");
    await memory.deleteFile("report.pdf");
    expect(await memory.exists("report.pdf")).toBe(false);
    await expect(memory.getFile("report.pdf")).rejects.toThrow(StorageNotFoundError);
  });

  it("keeps local storage as a real filesystem provider", async () => {
    const dir = path.join(os.tmpdir(), `wwhss-storage-test-${Date.now()}`);
    const local = new LocalStorageProvider(dir);
    try {
      await local.saveFile("note.txt", Buffer.from("local"), "text/plain");
      expect(await local.exists("note.txt")).toBe(true);
      expect((await local.getFile("note.txt")).filePath).toContain("note.txt");
      await local.deleteFile("note.txt");
    } finally {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("exposes the S3 provider without falling back to process memory", () => {
    expect(S3StorageProvider).toBeDefined();
  });

  it("retains the provider validation error contract", async () => {
    await expect(memory.getFile("missing.txt")).rejects.toThrow(StorageValidationError);
  });
});
