import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export class StorageValidationError extends Error {}
export class StorageConfigError extends Error {}

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

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!env.s3Bucket) {
      throw new StorageConfigError("S3_BUCKET environment variable is required for S3 storage");
    }

    this.bucket = env.s3Bucket;
    this.client = new S3Client({
      region: env.s3Region,
      credentials: env.s3AccessKeyId && env.s3SecretAccessKey ? {
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey,
      } : undefined,
      ...(env.s3Endpoint && { endpoint: env.s3Endpoint }),
    });
  }

  async saveFile(filename: string, buffer: Buffer, mimeType: string): Promise<void> {
    const key = `storage/${filename}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
    });

    try {
      await this.client.send(command);
    } catch (error) {
      throw new StorageValidationError(`Failed to upload file to S3: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getFile(filename: string): Promise<{ buffer?: Buffer; mimeType?: string }> {
    const key = `storage/${filename}`;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const response = await this.client.send(command);
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        const reader = response.Body as any;
        if (reader.getReader) {
          // ReadableStream
          const readableReader = reader.getReader();
          let result = await readableReader.read();
          while (!result.done) {
            chunks.push(result.value);
            result = await readableReader.read();
          }
        } else if (reader[Symbol.asyncIterator]) {
          // AsyncIterable
          for await (const chunk of reader) {
            chunks.push(chunk);
          }
        }
      }

      const buffer = Buffer.concat(chunks as any);
      return {
        buffer,
        mimeType: response.ContentType,
      };
    } catch (error) {
      throw new StorageValidationError(`Failed to retrieve file from S3: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteFile(filename: string): Promise<void> {
    const key = `storage/${filename}`;
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.client.send(command);
    } catch (error) {
      throw new StorageValidationError(`Failed to delete file from S3: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async exists(filename: string): Promise<boolean> {
    const key = `storage/${filename}`;
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }
}

let currentProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!currentProvider) {
    const type = env.storageProvider;
    if (type === "s3" || type === "cloud") {
      try {
        currentProvider = new S3StorageProvider();
      } catch (error) {
        if (error instanceof StorageConfigError && (env.vercelEnv === "production" || env.vercelEnv === "preview")) {
          throw error;
        }
        console.warn("S3 storage initialization failed, falling back to local storage:", error instanceof Error ? error.message : String(error));
        currentProvider = new LocalStorageProvider();
      }
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
    await tx.storageFile.create({
      data: {
        storageKey: safeName,
        originalName: input.originalFilename,
        mimeType: input.mimeType,
        size: input.buffer.length,
        ownerUserId: uploadedByUserId,
        entityType: input.studentProfileId ? "StudentProfile" : input.staffProfileId ? "StaffProfile" : undefined,
        entityId: input.studentProfileId || input.staffProfileId,
        isPrivate: true,
      },
    });

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
