import { describe, it, expect, beforeEach } from "vitest";
import {
  savePrivateFile,
  getPrivateFileContent,
  StorageValidationError,
  LocalStorageProvider,
  CloudStorageProvider,
  MemoryStorageProvider,
  setStorageProvider,
} from "../storage.service.js";

describe("Storage Provider & Service Test Suite", () => {
  beforeEach(() => {
    setStorageProvider(new MemoryStorageProvider());
  });

  it("saves and retrieves private files via MemoryStorageProvider", async () => {
    const buffer = Buffer.from("Hello WWHSS Storage Test");
    const result = await savePrivateFile(
      { originalFilename: "report.pdf", mimeType: "application/pdf", buffer },
      "" // empty uploadedByUserId skips DB auditLog in unit test
    );

    expect(result.filename).toMatch(/^report_[a-f0-9]+\.pdf$/);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.sizeBytes).toBe(buffer.length);

    const retrieved = await getPrivateFileContent(result.filename);
    expect(retrieved.buffer?.toString()).toBe("Hello WWHSS Storage Test");
  });

  it("rejects forbidden mime types", async () => {
    const buffer = Buffer.from("malicious script");
    await expect(
      savePrivateFile(
        { originalFilename: "script.exe", mimeType: "application/x-msdownload", buffer },
        ""
      )
    ).rejects.toThrow(StorageValidationError);
  });

  it("rejects files exceeding 10MB limit", async () => {
    const hugeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(
      savePrivateFile(
        { originalFilename: "large.pdf", mimeType: "application/pdf", buffer: hugeBuffer },
        ""
      )
    ).rejects.toThrow(StorageValidationError);
  });

  it("verifies CloudStorageProvider and LocalStorageProvider interfaces", async () => {
    const cloudProvider = new CloudStorageProvider();
    await cloudProvider.saveFile("test_cloud.txt", Buffer.from("Cloud Content"), "text/plain");
    const cloudFile = await cloudProvider.getFile("test_cloud.txt");
    expect(cloudFile.buffer?.toString()).toBe("Cloud Content");

    const localProvider = new LocalStorageProvider();
    expect(localProvider).toBeDefined();
  });
});
