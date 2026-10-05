import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../db/client.js";

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

/**
 * Exports essential school database tables into a structured JSON backup object.
 */
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

/**
 * Encrypts data using AES-256-GCM.
 */
export function encryptData(data: string, secretKey: string): { ciphertext: string; iv: string; tag: string } {
  const key = crypto.scryptSync(secretKey, "wwhss-salt", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return { ciphertext: encrypted, iv: iv.toString("hex"), tag };
}

/**
 * Decrypts AES-256-GCM encrypted data.
 */
export function decryptData(encrypted: { ciphertext: string; iv: string; tag: string }, secretKey: string): string {
  const key = crypto.scryptSync(secretKey, "wwhss-salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "hex"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "hex"));
  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Creates an encrypted backup file on disk.
 */
export async function createEncryptedBackup(encryptionSecret?: string): Promise<BackupMetadata> {
  ensureBackupDirExists();
  const backupData = await exportDatabaseData();
  const jsonStr = JSON.stringify(backupData, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `backup-${timestamp}`;
  const secret = encryptionSecret || process.env.JWT_ACCESS_SECRET || "default-wwhss-backup-secret-key-32b";

  const encrypted = encryptData(jsonStr, secret);
  const filename = `${id}.enc.json`;
  const filePath = path.join(BACKUP_DIR, filename);

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

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    id,
    createdAt: payload.createdAt,
    version: payload.version,
    tables: payload.tableCounts,
    encrypted: true,
    filename,
  };
}

/**
 * Lists all backup files.
 */
export function listBackups(): BackupMetadata[] {
  ensureBackupDirExists();
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json"));
  const backups: BackupMetadata[] = [];

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), "utf8"));
      backups.push({
        id: content.id || file,
        createdAt: content.createdAt || new Date().toISOString(),
        version: content.version || "1.0.0",
        tables: content.tableCounts || {},
        encrypted: Boolean(content.encrypted),
        filename: file,
      });
    } catch {
      // ignore unparseable files
    }
  }

  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Verifies recovery capability by decrypting and checking JSON integrity.
 */
export function verifyBackupRecovery(filename: string, encryptionSecret?: string): { valid: boolean; summary: Record<string, number> } {
  ensureBackupDirExists();
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) throw new BackupError(`Backup file ${filename} not found`);

  const fileContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const secret = encryptionSecret || process.env.JWT_ACCESS_SECRET || "default-wwhss-backup-secret-key-32b";

  if (!fileContent.encrypted || !fileContent.data) {
    throw new BackupError("Invalid backup format or unencrypted file");
  }

  const decryptedJson = decryptData(fileContent.data, secret);
  const parsed = JSON.parse(decryptedJson);

  if (!parsed.meta || !parsed.tables) {
    throw new BackupError("Decrypted backup payload is missing required schema sections");
  }

  const summary = Object.fromEntries(
    Object.entries(parsed.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );

  return { valid: true, summary };
}
