import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { userHasPermission } from "../identity/permissions.js";

export class StorageValidationError extends Error {}
export class StorageConfigError extends Error {}
export class StorageNotFoundError extends StorageValidationError {}
export class StorageAuthorizationError extends StorageValidationError {}

const STORAGE_DIR = path.resolve(process.cwd(), "storage_private");
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

  async getFile(filename: string): Promise<{ filePath?: string; mimeType?: string }> {
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
      region: env.s3Region || "us-east-1",
      credentials:
        env.s3AccessKeyId && env.s3SecretAccessKey
          ? {
              accessKeyId: env.s3AccessKeyId,
              secretAccessKey: env.s3SecretAccessKey,
            }
          : undefined,
      ...(env.s3Endpoint ? { endpoint: env.s3Endpoint } : {}),
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
      throw new StorageValidationError(
        `Failed to upload file to S3: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getFile(filename: string): Promise<{ buffer?: Buffer; mimeType?: string }> {
    const key = `storage/${filename}`;
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) throw new StorageNotFoundError("File not found");
      return {
        buffer: Buffer.from(await response.Body.transformToByteArray()),
        mimeType: response.ContentType,
      };
    } catch (error) {
      if (
        error instanceof StorageNotFoundError ||
        (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
      ) {
        throw new StorageNotFoundError("File not found");
      }
      throw new StorageValidationError(
        `Failed to retrieve file from S3: ${error instanceof Error ? error.message : String(error)}`
      );
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
      throw new StorageValidationError(
        `Failed to delete file from S3: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async exists(filename: string): Promise<boolean> {
    const key = `storage/${filename}`;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return false;
      throw new StorageValidationError(
        `Failed to check S3 object: ${error instanceof Error ? error.message : String(error)}`
      );
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
        if (env.nodeEnv === "production" || env.vercelEnv === "preview" || env.vercelEnv === "production") {
          throw error;
        }
        console.warn("S3 initialization failed, falling back to local storage");
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
    classId?: string;
    sectionId?: string;
    subjectId?: string;
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

  if (!uploadedByUserId) throw new StorageAuthorizationError("An authenticated uploader is required");

  try {
    return await prisma.$transaction(async (tx) => {
    await tx.storageFile.create({
      data: {
        storageKey: safeName,
        originalName: input.originalFilename,
        mimeType: input.mimeType,
        size: input.buffer.length,
        ownerUserId: uploadedByUserId,
        entityType: input.studentProfileId ? "StudentProfile" : input.staffProfileId ? "StaffProfile" : undefined,
        entityId: input.studentProfileId || input.staffProfileId,
        classId: input.classId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
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
  } catch (error) {
    try {
      await provider.deleteFile(safeName);
    } catch (compensationError) {
      throw new StorageValidationError(
        `Storage metadata transaction failed and object compensation also failed: ${error instanceof Error ? error.message : String(error)}; compensation: ${compensationError instanceof Error ? compensationError.message : String(compensationError)}`
      );
    }
    throw error;
  }
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

export async function getPrivateFileContent(filename: string, requesterUserId: string) {
  if (!requesterUserId) throw new StorageAuthorizationError("An authenticated requester is required");

  const safeName = path.basename(filename);
  const file = await prisma.storageFile.findUnique({ where: { storageKey: safeName } });
  if (!file) throw new StorageNotFoundError("File not found");

  if (file.isPrivate) {
    let allowed = file.ownerUserId === requesterUserId;

    if (!allowed && file.entityType === "StudentProfile" && file.entityId) {
      const [student, guardianLink] = await Promise.all([
        prisma.studentProfile.findUnique({ where: { id: file.entityId }, select: { userId: true } }),
        prisma.parentStudentLink.findFirst({
          where: { studentId: file.entityId, parentId: requesterUserId },
          select: { id: true },
        }),
      ]);
      allowed = student?.userId === requesterUserId || Boolean(guardianLink);
    }

    if (!allowed && file.entityType === "StaffProfile" && file.entityId) {
      const staff = await prisma.staffProfile.findUnique({
        where: { id: file.entityId },
        select: { userId: true },
      });
      allowed = staff?.userId === requesterUserId;
    }

    if (!allowed && (file.classId || file.sectionId || file.subjectId)) {
      allowed = await userHasPermission(requesterUserId, "academics:view", {
        classId: file.classId ?? undefined,
        sectionId: file.sectionId ?? undefined,
        subjectId: file.subjectId ?? undefined,
      });
    }

    if (!allowed) throw new StorageAuthorizationError("You are not authorized to access this private file");
  }

  const provider = getStorageProvider();
  const fileData = await provider.getFile(safeName);

  await prisma.auditLog.create({
    data: {
      userId: requesterUserId,
      action: "storage:download_file",
      resource: `file:${safeName}`,
      metadata: {
        storageFileId: file.id,
        provider: env.storageProvider,
      },
    },
  });

  return fileData;
}

export async function deletePrivateFile(filename: string, requesterUserId: string) {
  if (!requesterUserId) throw new StorageAuthorizationError("An authenticated requester is required");
  const safeName = path.basename(filename);
  const file = await prisma.storageFile.findUnique({ where: { storageKey: safeName } });
  if (!file) throw new StorageNotFoundError("File not found");
  if (file.ownerUserId !== requesterUserId) {
    throw new StorageAuthorizationError("Only the file owner may delete this private file");
  }

  const provider = getStorageProvider();
  await provider.deleteFile(safeName);
  await prisma.storageFile.delete({ where: { id: file.id } });
}
