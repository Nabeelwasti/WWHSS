import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../db/client.js";

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
  ensureStorageDirExists();

  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new StorageValidationError(`File type '${input.mimeType}' is not allowed`);
  }

  if (input.buffer.length > MAX_FILE_SIZE) {
    throw new StorageValidationError(`File size exceeds maximum allowed size of 10MB`);
  }

  const safeName = sanitizeFilename(input.originalFilename);
  const filePath = path.join(STORAGE_DIR, safeName);
  fs.writeFileSync(filePath, input.buffer);

  return prisma.$transaction(async (tx) => {
    const fileUrl = `/api/storage/files/${safeName}`;

    if (uploadedByUserId) {
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
          },
        },
      });
    }

    return {
      filename: safeName,
      fileUrl,
      sizeBytes: input.buffer.length,
      mimeType: input.mimeType,
    };
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
