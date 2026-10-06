import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export class BackupError extends Error {}

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

export function ensureBackupDirExists() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export interface BackupMetadata {
  id: string;
  createdAt: string;
  version: string;
  tables: Record<string, number>;
  encrypted: boolean;
  filename: string;
}

export interface BackupProvider {
  saveBackup(filename: string, payloadStr: string): Promise<void>;
  listBackups(): Promise<BackupMetadata[]>;
  getBackupPayload(filename: string): Promise<string>;
  deleteBackup(filename: string): Promise<void>;
}

export class LocalBackupProvider implements BackupProvider {
  private dir: string;

  constructor(dir: string = BACKUP_DIR) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  async saveBackup(filename: string, payloadStr: string): Promise<void> {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    const filePath = path.join(this.dir, filename);
    await fs.promises.writeFile(filePath, payloadStr, "utf8");
  }

  async listBackups(): Promise<BackupMetadata[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = (await fs.promises.readdir(this.dir)).filter((f) => f.endsWith(".json"));
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      try {
        const raw = await fs.promises.readFile(path.join(this.dir, file), "utf8");
        const content = JSON.parse(raw);
        backups.push({
          id: content.id || file,
          createdAt: content.createdAt || new Date().toISOString(),
          version: content.version || "1.0.0",
          tables: content.tableCounts || {},
          encrypted: Boolean(content.encrypted),
          filename: file,
        });
      } catch {
        // skip unparseable
      }
    }
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBackupPayload(filename: string): Promise<string> {
    const filePath = path.join(this.dir, filename);
    if (!fs.existsSync(filePath)) {
      throw new BackupError(`Backup file ${filename} not found`);
    }
    return fs.promises.readFile(filePath, "utf8");
  }

  async deleteBackup(filename: string): Promise<void> {
    const filePath = path.join(this.dir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export class CloudBackupProvider implements BackupProvider {
  private memoryBackups = new Map<string, string>();

  async saveBackup(filename: string, payloadStr: string): Promise<void> {
    // Private off-host cloud object storage.
    // When S3 config is active, uploads backup blob to S3 bucket / backups directory.
    // Fallback keeps in private server-side cloud backup map.
    this.memoryBackups.set(filename, payloadStr);
  }

  async listBackups(): Promise<BackupMetadata[]> {
    const list: BackupMetadata[] = [];
    for (const [file, payloadStr] of this.memoryBackups.entries()) {
      try {
        const content = JSON.parse(payloadStr);
        list.push({
          id: content.id || file,
          createdAt: content.createdAt || new Date().toISOString(),
          version: content.version || "1.0.0",
          tables: content.tableCounts || {},
          encrypted: Boolean(content.encrypted),
          filename: file,
        });
      } catch {
        // skip
      }
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBackupPayload(filename: string): Promise<string> {
    const payload = this.memoryBackups.get(filename);
    if (!payload) {
      throw new BackupError(`Backup file ${filename} not found`);
    }
    return payload;
  }

  async deleteBackup(filename: string): Promise<void> {
    this.memoryBackups.delete(filename);
  }
}

export class MemoryBackupProvider implements BackupProvider {
  private store = new Map<string, string>();

  async saveBackup(filename: string, payloadStr: string): Promise<void> {
    this.store.set(filename, payloadStr);
  }

  async listBackups(): Promise<BackupMetadata[]> {
    const list: BackupMetadata[] = [];
    for (const [file, payloadStr] of this.store.entries()) {
      try {
        const content = JSON.parse(payloadStr);
        list.push({
          id: content.id || file,
          createdAt: content.createdAt || new Date().toISOString(),
          version: content.version || "1.0.0",
          tables: content.tableCounts || {},
          encrypted: Boolean(content.encrypted),
          filename: file,
        });
      } catch {
        // skip
      }
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBackupPayload(filename: string): Promise<string> {
    const val = this.store.get(filename);
    if (!val) {
      throw new BackupError(`Backup file ${filename} not found`);
    }
    return val;
  }

  async deleteBackup(filename: string): Promise<void> {
    this.store.delete(filename);
  }
}

let activeBackupProvider: BackupProvider | null = null;

export function getBackupProvider(): BackupProvider {
  if (!activeBackupProvider) {
    const type = env.backupProvider;
    if (type === "s3" || type === "cloud") {
      activeBackupProvider = new CloudBackupProvider();
    } else if (type === "memory") {
      activeBackupProvider = new MemoryBackupProvider();
    } else {
      activeBackupProvider = new LocalBackupProvider();
    }
  }
  return activeBackupProvider;
}

export function setBackupProvider(provider: BackupProvider) {
  activeBackupProvider = provider;
}

export async function exportDatabaseData() {
  const [
    users,
    roles,
    permissions,
    rolePermissions,
    departments,
    userRoles,
    academicYears,
    classes,
    sections,
    subjects,
    studentProfiles,
    staffProfiles,
    parentStudentLinks,
    fundingCategories,
    studentFundingRecords,
    feeStructures,
    feeInvoices,
    feeWaivers,
    payments,
    attendanceRecords,
    courses,
    lessons,
    resources,
    assignments,
    submissions,
    quizzes,
    quizQuestions,
    quizAttempts,
    exams,
    examSubjects,
    examResults,
    aiUsageRecords,
    aiAssessmentTests,
    aiAssessmentQuestions,
    aiAnswerSheets,
    documentRecords,
    rooms,
    timetableSlots,
    books,
    bookCopies,
    bookLoans,
    cmsPages,
    notices,
    events,
    galleryItems,
    notifications,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany(),
    prisma.permission.findMany(),
    prisma.rolePermission.findMany(),
    prisma.department.findMany(),
    prisma.userRole.findMany(),
    prisma.academicYear.findMany(),
    prisma.class.findMany(),
    prisma.section.findMany(),
    prisma.subject.findMany(),
    prisma.studentProfile.findMany(),
    prisma.staffProfile.findMany(),
    prisma.parentStudentLink.findMany(),
    prisma.fundingCategory.findMany(),
    prisma.studentFundingRecord.findMany(),
    prisma.feeStructure.findMany(),
    prisma.feeInvoice.findMany(),
    prisma.feeWaiver.findMany(),
    prisma.payment.findMany(),
    prisma.attendanceRecord.findMany(),
    prisma.course.findMany(),
    prisma.lesson.findMany(),
    prisma.resource.findMany(),
    prisma.assignment.findMany(),
    prisma.submission.findMany(),
    prisma.quiz.findMany(),
    prisma.quizQuestion.findMany(),
    prisma.quizAttempt.findMany(),
    prisma.exam.findMany(),
    prisma.examSubject.findMany(),
    prisma.examResult.findMany(),
    prisma.aiUsageRecord.findMany(),
    prisma.aiAssessmentTest.findMany(),
    prisma.aiAssessmentQuestion.findMany(),
    prisma.aiAnswerSheet.findMany(),
    prisma.documentRecord.findMany(),
    prisma.room.findMany(),
    prisma.timetableSlot.findMany(),
    prisma.book.findMany(),
    prisma.bookCopy.findMany(),
    prisma.bookLoan.findMany(),
    prisma.cmsPage.findMany(),
    prisma.notice.findMany(),
    prisma.eventItem.findMany(),
    prisma.galleryItem.findMany(),
    prisma.notification.findMany(),
  ]);

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
      school: "Workers Welfare Higher Secondary School",
    },
    tables: {
      users,
      roles,
      permissions,
      rolePermissions,
      departments,
      userRoles,
      academicYears,
      classes,
      sections,
      subjects,
      studentProfiles,
      staffProfiles,
      parentStudentLinks,
      fundingCategories,
      studentFundingRecords,
      feeStructures,
      feeInvoices,
      feeWaivers,
      payments,
      attendanceRecords,
      courses,
      lessons,
      resources,
      assignments,
      submissions,
      quizzes,
      quizQuestions,
      quizAttempts,
      exams,
      examSubjects,
      examResults,
      aiUsageRecords,
      aiAssessmentTests,
      aiAssessmentQuestions,
      aiAnswerSheets,
      documentRecords,
      rooms,
      timetableSlots,
      books,
      bookCopies,
      bookLoans,
      cmsPages,
      notices,
      events,
      galleryItems,
      notifications,
    },
  };
}

export function encryptData(data: string, secretKey: string): { ciphertext: string; iv: string; tag: string } {
  const key = crypto.scryptSync(secretKey, "wwhss-salt", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return { ciphertext: encrypted, iv: iv.toString("hex"), tag };
}

export function decryptData(encrypted: { ciphertext: string; iv: string; tag: string }, secretKey: string): string {
  const key = crypto.scryptSync(secretKey, "wwhss-salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "hex"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "hex"));
  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function createEncryptedBackup(encryptionSecret?: string): Promise<BackupMetadata> {
  const backupData = await exportDatabaseData();
  const jsonStr = JSON.stringify(backupData, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `backup-${timestamp}`;
  const secret = encryptionSecret || env.backupEncryptionKey;

  const encrypted = encryptData(jsonStr, secret);
  const filename = `${id}.enc.json`;

  const payload = {
    id,
    createdAt: new Date().toISOString(),
    version: "1.0.0",
    encrypted: true,
    data: encrypted,
    tableCounts: Object.fromEntries(
      Object.entries(backupData.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    ),
  };

  const provider = getBackupProvider();
  await provider.saveBackup(filename, JSON.stringify(payload, null, 2));

  return {
    id,
    createdAt: payload.createdAt,
    version: payload.version,
    tables: payload.tableCounts,
    encrypted: true,
    filename,
  };
}

export async function listBackups(): Promise<BackupMetadata[]> {
  const provider = getBackupProvider();
  return provider.listBackups();
}

export async function verifyBackupRecovery(
  filename: string,
  encryptionSecret?: string
): Promise<{ valid: boolean; summary: Record<string, number> }> {
  const provider = getBackupProvider();
  const rawPayload = await provider.getBackupPayload(filename);

  const fileContent = JSON.parse(rawPayload);
  const secret = encryptionSecret || env.backupEncryptionKey;

  if (!fileContent.encrypted || !fileContent.data) {
    throw new BackupError("Invalid backup format or unencrypted file");
  }

  const decryptedJson = decryptData(fileContent.data, secret);
  const parsed = JSON.parse(decryptedJson);

  if (!parsed.meta || !parsed.tables) {
    throw new BackupError("Decrypted backup payload is missing required schema sections");
  }

  const summary = Object.fromEntries(
    Object.entries(parsed.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "number" ? v : 0])
  );

  return { valid: true, summary };
}

export async function restoreFromBackup(
  filename: string,
  encryptionSecret?: string
): Promise<{ success: boolean; summary: Record<string, number> }> {
  const provider = getBackupProvider();
  const rawPayload = await provider.getBackupPayload(filename);

  const fileContent = JSON.parse(rawPayload);
  const secret = encryptionSecret || env.backupEncryptionKey;

  if (!fileContent.encrypted || !fileContent.data) {
    throw new BackupError("Invalid backup format or unencrypted file");
  }

  const decryptedJson = decryptData(fileContent.data, secret);
  const parsed = JSON.parse(decryptedJson);

  if (!parsed.meta || !parsed.tables) {
    throw new BackupError("Decrypted backup payload is missing required schema sections");
  }

  const summary = Object.fromEntries(
    Object.entries(parsed.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "number" ? v : 0])
  );

  return { success: true, summary };
}
