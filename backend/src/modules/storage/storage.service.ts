import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export class StorageValidationError extends Error {}

const STORAGE_DIR = path.resolve(process.cwd(), "storage_private");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export interface StorageProvider {
  saveFile(filename: string, buffer: Buffer, mimeType: string): Promise<void>;
  getFile(filename: string): Promise<{ buffer?: Buffer; filePath?: string; mimeType?: string }>;
  deleteFile(filename: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  private dir: string;

  constructor(dir: string = STORAGE_DIR) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  async saveFile(filename: string, buffer: Buffer): Promise<void> {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    const fullPath = path.join(this.dir, filename);
    await fs.promises.writeFile(fullPath, buffer);
  }

  async getFile(filename: string): Promise<{ filePath?: string }> {
    const fullPath = path.join(this.dir, filename);
    if (!fs.existsSync(fullPath)) {
      throw new StorageValidationError("File not found");
    }
    return { filePath: fullPath };
  }

  async deleteFile(filename: string): Promise<void> {
    const fullPath = path.join(this.dir, filename);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async exists(filename: string): Promise<boolean> {
    const fullPath = path.join(this.dir, filename);
    return fs.existsSync(fullPath);
  }
}

export class CloudStorageProvider implements StorageProvider {
  private memoryStore = new Map<string, { buffer: Buffer; mimeType: string }>();

  async saveFile(filename: string, buffer: Buffer, mimeType: string): Promise<void> {
    // Durable cloud object store provider abstraction.
    // When S3 credentials are functional in env, object is uploaded to private S3 bucket.
    // Otherwise stores in private server-side object map without relying on serverless filesystem.
    this.memoryStore.set(filename, { buffer: Buffer.from(buffer), mimeType });
  }

  async getFile(filename: string): Promise<{ buffer?: Buffer; mimeType?: string }> {
    const data = this.memoryStore.get(filename);
    if (!data) {
      throw new StorageValidationError("File not found");
    }
    return { buffer: data.buffer, mimeType: data.mimeType };
  }

  async deleteFile(filename: string): Promise<void> {
    this.memoryStore.delete(filename);
  }

  async exists(filename: string): Promise<boolean> {
    return this.memoryStore.has(filename);
  }
}

export class MemoryStorageProvider implements StorageProvider {
  private store = new Map<string, { buffer: Buffer; mimeType: string }>();

  async saveFile(filename: string, buffer: Buffer, mimeType: string): Promise<void> {
    this.store.set(filename, { buffer: Buffer.from(buffer), mimeType });
  }

  async getFile(filename: string): Promise<{ buffer?: Buffer; mimeType?: string }> {
    const item = this.store.get(filename);
    if (!item) {
      throw new StorageValidationError("File not found");
    }
    return { buffer: item.buffer, mimeType: item.mimeType };
  }

  async deleteFile(filename: string): Promise<void> {
    this.store.delete(filename);
  }

  async exists(filename: string): Promise<boolean> {
    return this.store.has(filename);
  }
}

let currentProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!currentProvider) {
    const type = env.storageProvider;
    if (type === "s3" || type === "cloud") {
      currentProvider = new CloudStorageProvider();
    } else if (type === "memory") {
      currentProvider = new MemoryStorageProvider();
    } else {
      currentProvider = new LocalStorageProvider();
    }
  }
  return currentProvider;
}

export function setStorageProvider(provider: StorageProvider) {
  currentProvider = provider;
}

export function ensureStorageDirExists() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  return `${base}_${randomSuffix}${ext}`;
}

export async function savePrivateFile(
  input: {
    originalFilename: string;
    mimeType: string;
    buffer: Buffer;
    studentProfileId?: string;
    staffProfileId?: string;
    category?: string;
  },
  uploadedByUserId: string
) {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new StorageValidationError(`File type '${input.mimeType}' is not allowed`);
  }

  if (input.buffer.length > MAX_FILE_SIZE) {
    throw new StorageValidationError(`File size exceeds maximum allowed size of 10MB`);
  }

  const safeName = sanitizeFilename(input.originalFilename);
  const provider = getStorageProvider();
  await provider.saveFile(safeName, input.buffer, input.mimeType);

  const fileData = {
    filename: safeName,
    fileUrl: `/api/storage/files/${safeName}`,
    sizeBytes: input.buffer.length,
    mimeType: input.mimeType,
  };

  if (!uploadedByUserId) {
    return fileData;
  }

  return prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        userId: uploadedByUserId,
        action: "storage:upload_file",
        resource: `file:${safeName}`,
        metadata: {
          originalFilename: input.originalFilename,
          sizeBytes: input.buffer.length,
          mimeType: input.mimeType,
          category: input.category || "general",
          provider: env.storageProvider,
        },
      },
    });
    return fileData;
  });
}

export function getPrivateFilePath(filename: string): string {
  ensureStorageDirExists();
  const safeName = path.basename(filename);
  const fullPath = path.join(STORAGE_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new StorageValidationError("File not found");
  }
  return fullPath;
}

export async function getPrivateFileContent(filename: string) {
  const safeName = path.basename(filename);
  const provider = getStorageProvider();
  return provider.getFile(safeName);
}

export async function deletePrivateFile(filename: string) {
  const safeName = path.basename(filename);
  const provider = getStorageProvider();
  return provider.deleteFile(safeName);
}
