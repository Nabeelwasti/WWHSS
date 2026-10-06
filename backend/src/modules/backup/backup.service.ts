import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, NoSuchKey, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export class BackupError extends Error {}
export class BackupNotFoundError extends BackupError {}

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const BACKUP_PREFIX = "backups/";
const BACKUP_SUFFIX = ".enc.json";
const BACKUP_SCHEMA_VERSION = "1.1.0";
function safeBackupFilename(filename: string): string {
  const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe !== filename || !safe.endsWith(BACKUP_SUFFIX) || safe.length > 180) throw new BackupError("Invalid backup filename");
  return safe;
}
function envelopeMetadata(raw: string, filename: string): BackupMetadata {
  let v: any;
  try { v = JSON.parse(raw); } catch { throw new BackupError("Invalid backup envelope"); }
  if (!v || v.encrypted !== true || !v.data?.ciphertext || !v.data?.iv || !v.data?.tag || typeof v.id !== "string" || typeof v.createdAt !== "string" || typeof v.version !== "string") throw new BackupError("Invalid encrypted backup envelope");
  return { id: v.id, createdAt: v.createdAt, version: v.version, tables: v.tableCounts || {}, encrypted: true, filename };
}

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
    const filePath = path.join(this.dir, safeBackupFilename(filename));
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
    const filePath = path.join(this.dir, safeBackupFilename(filename));
    if (!fs.existsSync(filePath)) {
      throw new BackupError(`Backup file ${filename} not found`);
    }
    return fs.promises.readFile(filePath, "utf8");
  }

  async deleteBackup(filename: string): Promise<void> {
    const filePath = path.join(this.dir, safeBackupFilename(filename));
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export class S3BackupProvider implements BackupProvider {
  private readonly client: S3Client;
  constructor() {
    if (!env.s3Bucket) throw new BackupError("S3_BUCKET is required for S3 backups");
    this.client = new S3Client({ region: env.s3Region, credentials: env.s3AccessKeyId && env.s3SecretAccessKey ? { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey } : undefined, ...(env.s3Endpoint ? { endpoint: env.s3Endpoint, forcePathStyle: true } : {}) });
  }
  private key(filename: string) { return BACKUP_PREFIX + safeBackupFilename(filename); }
  async saveBackup(filename: string, payloadStr: string) { await this.client.send(new PutObjectCommand({ Bucket: env.s3Bucket!, Key: this.key(filename), Body: payloadStr, ContentType: "application/json", ServerSideEncryption: "AES256" })); }
  async listBackups() {
    const out: BackupMetadata[] = []; let token: string | undefined;
    do { const page = await this.client.send(new ListObjectsV2Command({ Bucket: env.s3Bucket!, Prefix: BACKUP_PREFIX, ContinuationToken: token }));
      for (const obj of page.Contents ?? []) { const key=obj.Key; if (!key || !key.startsWith(BACKUP_PREFIX)) continue; const filename=key.slice(BACKUP_PREFIX.length); if (!filename.endsWith(BACKUP_SUFFIX)) continue; try { out.push(envelopeMetadata(await this.getBackupPayload(filename), filename)); } catch (e) { if (!(e instanceof BackupNotFoundError)) throw e; } }
      token=page.IsTruncated ? page.NextContinuationToken : undefined;
    } while(token); return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  async getBackupPayload(filename: string) { const safe=safeBackupFilename(filename); try { const r=await this.client.send(new GetObjectCommand({Bucket:env.s3Bucket!,Key:this.key(safe)})); if(!r.Body) throw new BackupNotFoundError("Backup not found"); return await r.Body.transformToString(); } catch(e) { if(e instanceof BackupNotFoundError || e instanceof NoSuchKey || (e instanceof S3ServiceException && e.$metadata.httpStatusCode===404)) throw new BackupNotFoundError(`Backup file ${safe} not found`); throw new BackupError(`Failed to retrieve backup: ${e instanceof Error?e.message:String(e)}`); } }
  async deleteBackup(filename: string) { const safe=safeBackupFilename(filename); try { await this.client.send(new DeleteObjectCommand({Bucket:env.s3Bucket!,Key:this.key(safe)})); } catch(e) { throw new BackupError(`Failed to delete backup: ${e instanceof Error?e.message:String(e)}`); } }
}
export class CloudBackupProvider extends S3BackupProvider {}

export class MemoryBackupProvider implements BackupProvider {
  private store = new Map<string, string>();

  async saveBackup(filename: string, payloadStr: string): Promise<void> {
    this.store.set(safeBackupFilename(filename), payloadStr);
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
    const val = this.store.get(safeBackupFilename(filename));
    if (!val) {
      throw new BackupError(`Backup file ${filename} not found`);
    }
    return val;
  }

  async deleteBackup(filename: string): Promise<void> {
    this.store.delete(safeBackupFilename(filename));
  }
}

let activeBackupProvider: BackupProvider | null = null;

export function getBackupProvider(): BackupProvider {
  if (!activeBackupProvider) {
    const type = env.backupProvider;
    if (type === "s3" || type === "cloud") {
      activeBackupProvider = new S3BackupProvider();
    } else if (type === "memory") {
      if (env.nodeEnv !== "test") throw new BackupError("Memory backup provider is permitted only in NODE_ENV=test");
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
    refreshTokens,
    auditLogs,
    academicYears,
    classes,
    sections,
    subjects,
    studentProfiles,
    studentEnrollmentHistory,
    staffProfiles,
    parentStudentLinks,
    fundingCategories,
    studentFundingRecords,
    feeStructures,
    feeInvoices,
    feeWaivers,
    payments,
    paymentAdjustments,
    attendanceRecords,
    courses,
    courseTeacherAssignments,
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
    schoolProfiles,
    documentSequences,
    storageFiles,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany(),
    prisma.permission.findMany(),
    prisma.rolePermission.findMany(),
    prisma.department.findMany(),
    prisma.userRole.findMany(),
    prisma.refreshToken.findMany(),
    prisma.auditLog.findMany(),
    prisma.academicYear.findMany(),
    prisma.class.findMany(),
    prisma.section.findMany(),
    prisma.subject.findMany(),
    prisma.studentProfile.findMany(),
    prisma.studentEnrollmentHistory.findMany(),
    prisma.staffProfile.findMany(),
    prisma.parentStudentLink.findMany(),
    prisma.fundingCategory.findMany(),
    prisma.studentFundingRecord.findMany(),
    prisma.feeStructure.findMany(),
    prisma.feeInvoice.findMany(),
    prisma.feeWaiver.findMany(),
    prisma.payment.findMany(),
    prisma.paymentAdjustment.findMany(),
    prisma.attendanceRecord.findMany(),
    prisma.course.findMany(),
    prisma.courseTeacherAssignment.findMany(),
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
    prisma.schoolProfile.findMany(),
    prisma.documentSequence.findMany(),
    prisma.storageFile.findMany(),
  ]);

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      version: BACKUP_SCHEMA_VERSION,
      school: "Workers Welfare Higher Secondary School",
    },
    tables: {
      users,
      roles,
      permissions,
      rolePermissions,
      departments,
      userRoles,
      refreshTokens,
      auditLogs,
      academicYears,
      classes,
      sections,
      subjects,
      studentProfiles,
      studentEnrollmentHistory,
      staffProfiles,
      parentStudentLinks,
      fundingCategories,
      studentFundingRecords,
      feeStructures,
      feeInvoices,
      feeWaivers,
      payments,
      paymentAdjustments,
      attendanceRecords,
      courses,
      courseTeacherAssignments,
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
      schoolProfiles,
      documentSequences,
      storageFiles,
    },
  };
}

export function encryptData(data: string, secretKey: string): { ciphertext: string; iv: string; tag: string; salt: string } {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(secretKey, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return { ciphertext: encrypted, iv: iv.toString("hex"), tag, salt: salt.toString("hex") };
}

export function decryptData(encrypted: { ciphertext: string; iv: string; tag: string; salt?: string }, secretKey: string): string {
  // Backward compatibility: backups created before randomized per-envelope
  // salts used the legacy fixed salt. New backups always carry their own
  // cryptographically random salt.
  const salt = encrypted.salt ? Buffer.from(encrypted.salt, "hex") : "wwhss-salt";
  const key = crypto.scryptSync(secretKey, salt, 32);
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
    version: BACKUP_SCHEMA_VERSION,
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

export async function restoreFromBackup(filename: string, encryptionSecret?: string, restoredByUserId?: string, dryRun = false): Promise<{ success: boolean; dryRun: boolean; summary: Record<string, number> }> {
  if (!restoredByUserId) throw new BackupError("A privileged restoring user is required");
  const raw = await getBackupProvider().getBackupPayload(filename);
  let envelope: any; try { envelope=JSON.parse(raw); } catch { throw new BackupError("Invalid backup envelope"); }
  if (!envelope.encrypted || !envelope.data) throw new BackupError("Invalid backup format or unencrypted file");
  let parsed: any; try { parsed=JSON.parse(decryptData(envelope.data, encryptionSecret || env.backupEncryptionKey)); } catch(e) { if(e instanceof BackupError) throw e; throw new BackupError("Backup decryption or JSON validation failed"); }
  if (!parsed.meta || !parsed.tables || typeof parsed.tables !== "object") throw new BackupError("Decrypted backup payload is missing required schema sections");
  const tables=parsed.tables as Record<string, unknown>;
  const tableMap: Record<string,string> = { users:"users", roles:"roles", permissions:"permissions", rolePermissions:"role_permissions", departments:"departments", userRoles:"user_roles", refreshTokens:"refresh_tokens", auditLogs:"audit_logs", academicYears:"academic_years", classes:"classes", sections:"sections", subjects:"subjects", studentProfiles:"student_profiles", studentEnrollmentHistory:"student_enrollment_history", staffProfiles:"staff_profiles", parentStudentLinks:"parent_student_links", fundingCategories:"funding_categories", studentFundingRecords:"student_funding_records", feeStructures:"fee_structures", feeInvoices:"fee_invoices", feeWaivers:"fee_waivers", payments:"payments", paymentAdjustments:"payment_adjustments", attendanceRecords:"attendance_records", courses:"courses", courseTeacherAssignments:"course_teacher_assignments", lessons:"lessons", resources:"resources", assignments:"assignments", submissions:"submissions", quizzes:"quizzes", quizQuestions:"quiz_questions", quizAttempts:"quiz_attempts", exams:"exams", examSubjects:"exam_subjects", examResults:"exam_results", aiUsageRecords:"ai_usage_records", aiAssessmentTests:"ai_assessment_tests", aiAssessmentQuestions:"ai_assessment_questions", aiAnswerSheets:"ai_answer_sheets", documentRecords:"document_records", rooms:"rooms", timetableSlots:"timetable_slots", books:"books", bookCopies:"book_copies", bookLoans:"book_loans", cmsPages:"cms_pages", notices:"notices", events:"events", galleryItems:"gallery_items", notifications:"notifications", schoolProfiles:"school_profiles", documentSequences:"document_sequences", storageFiles:"storage_files" };
  const backupVersion = typeof envelope.version === "string" ? envelope.version : "";
  const [backupMajor] = backupVersion.split(".").map(Number);
  const [currentMajor] = BACKUP_SCHEMA_VERSION.split(".").map(Number);
  if (!Number.isInteger(backupMajor) || backupMajor !== currentMajor) throw new BackupError(`Unsupported backup schema version: ${backupVersion}`);
  const requiredKeys = Object.keys(tableMap);
  const keys=Object.keys(tables);
  for(const k of keys) { if(!tableMap[k] || !Array.isArray(tables[k])) throw new BackupError(`Invalid or unsupported backup table: ${k}`); }
  for(const k of requiredKeys) { if(!(k in tables)) throw new BackupError(`Backup is incomplete: missing table: ${k}`); }
  if (dryRun) {
    const summary: Record<string, number> = {};
    for (const [key, table] of Object.entries(tableMap)) {
      const rows = tables[key] as Record<string, unknown>[];
      const columns = await prisma.$queryRaw<Array<{ columnName: string }>>`SELECT column_name AS "columnName" FROM information_schema.columns WHERE table_schema='public' AND table_name=${table}`;
      const allowed = new Set(columns.map((column) => column.columnName));
      for (const row of rows) if (Object.keys(row).some((name) => !allowed.has(name))) throw new BackupError(`Backup contains unknown column in ${key}`);
      summary[key] = rows.length;
    }
    return { success: true, dryRun: true, summary };
  }
  const result=await prisma.$transaction(async tx=>{
    const fk=await tx.$queryRaw<Array<{childTable:string,parentTable:string}>>`SELECT child.relname AS "childTable", parent.relname AS "parentTable" FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND n.nspname='public'`;
    const selected=new Set(Object.values(tableMap)); const deps=new Map<string,Set<string>>(); const children=new Map<string,Set<string>>(); for(const t of selected){deps.set(t,new Set());children.set(t,new Set());} for(const f of fk){if(selected.has(f.childTable)&&selected.has(f.parentTable)&&f.childTable!==f.parentTable){deps.get(f.childTable)!.add(f.parentTable);children.get(f.parentTable)!.add(f.childTable);}}
    const ready=[...selected].filter(t=>deps.get(t)!.size===0).sort(); const order:string[]=[]; while(ready.length){const t=ready.shift()!;order.push(t);for(const c of [...children.get(t)!].sort()){deps.get(c)!.delete(t);if(deps.get(c)!.size===0){ready.push(c);ready.sort();}}} if(order.length!==selected.size) throw new BackupError("Backup restore dependency graph contains a foreign-key cycle");
    const reverse=new Map(Object.entries(tableMap).map(([k,v])=>[v,k])); const counts:Record<string,number>={};
    for(const table of order){const key=reverse.get(table)!;const rows=tables[key] as Record<string,unknown>[]; if(!rows.length){counts[key]=0;continue;} const cols=await tx.$queryRaw<Array<{columnName:string;dataType:string;udtName:string}>>`SELECT column_name AS "columnName", data_type AS "dataType", udt_name AS "udtName" FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} ORDER BY ordinal_position`; const allowed=new Set(cols.map(c=>c.columnName)); const pk=await tx.$queryRaw<Array<{columnName:string}>>`SELECT kcu.column_name AS "columnName" FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_name=kcu.table_name WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY' AND tc.table_name=${table} ORDER BY kcu.ordinal_position`; if(!pk.length) throw new BackupError(`Table ${table} has no primary key`); let affected=0;
      for(const row of rows){const names=Object.keys(row);if(names.some(n=>!allowed.has(n))) throw new BackupError(`Backup contains unknown column in ${key}`);const values=names.map(n=>{const value=row[n]===undefined?null:row[n];if(value===null)return null;const column=cols.find(c=>c.columnName===n);if(!column)return value;if(column.dataType==="timestamp without time zone"||column.dataType==="timestamp with time zone"){const date=new Date(String(value));if(Number.isNaN(date.getTime()))throw new BackupError(`Invalid datetime value in ${key}.${n}`);return date.toISOString();}if(column.dataType==="json"||column.dataType==="jsonb"){return typeof value==="string"?value:JSON.stringify(value);}return value;});const boundValues: unknown[]=[];const placeholders=names.map((n,i)=>{const column=cols.find(c=>c.columnName===n);const value=values[i];if(value===null)return "NULL";if(!column){boundValues.push(value);return `${boundValues.length}`;}if(column.dataType==="timestamp without time zone"||column.dataType==="timestamp with time zone"){const escaped=String(value).replace(/'/g,"''");return column.dataType==="timestamp without time zone"?"TIMESTAMP '" + escaped + "'":"TIMESTAMPTZ '" + escaped + "'";}if(column.dataType==="date"){return "DATE '" + String(value).replace(/'/g,"''") + "'";}if(column.dataType==="time without time zone"){return "TIME '" + String(value).replace(/'/g,"''") + "'";}boundValues.push(value);const p=`$${boundValues.length}`;if(column.dataType==="json")return p+"::json";if(column.dataType==="jsonb")return p+"::jsonb";if(column.udtName==="uuid")return p+"::uuid";if(column.dataType==="numeric"||column.dataType==="decimal")return p+"::numeric";if(column.dataType==="bigint")return p+"::bigint";if(column.dataType==="integer")return p+"::integer";if(column.dataType==="smallint")return p+"::smallint";if(column.dataType==="double precision")return p+"::double precision";if(column.dataType==="real")return p+"::real";if(column.dataType==="boolean")return p+"::boolean";return p;}).join(",");const qcols=names.map(n=>`"${n.replace(/"/g,'""')}"`).join(",");const conflict=pk.map(x=>`"${x.columnName.replace(/"/g,'""')}"`).join(",");const updates=names.filter(n=>!pk.some(x=>x.columnName===n)).map(n=>`"${n.replace(/"/g,'""')}"=EXCLUDED."${n.replace(/"/g,'""')}"`).join(",");const sql=`INSERT INTO "public"."${table}" (${qcols}) VALUES (${placeholders}) ON CONFLICT (${conflict}) DO ${updates?"UPDATE SET "+updates:"NOTHING"}`; affected+=await tx.$executeRawUnsafe(sql,...boundValues); } counts[key]=affected; if(affected!==rows.length) throw new BackupError(`Restore count mismatch for ${key}`); }
    const sequences = await tx.$queryRaw<Array<{tableName:string;columnName:string;sequenceName:string|null}>>`
      SELECT table_name AS "tableName", column_name AS "columnName",
             pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS "sequenceName"
      FROM information_schema.columns
      WHERE table_schema='public'
        AND pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) IS NOT NULL
    `;
    for (const sequence of sequences) {
      if (!sequence.sequenceName) continue;
      const table = `"public"."${sequence.tableName.replace(/"/g, '""')}"`;
      const column = `"${sequence.columnName.replace(/"/g, '""')}"`;
      await tx.$executeRawUnsafe(`SELECT setval(${JSON.stringify(sequence.sequenceName)}::regclass, COALESCE((SELECT MAX(${column}) FROM ${table}), 1), true)`);
    }

    await tx.auditLog.create({data:{userId:restoredByUserId,action:"backup:restore",resource:`backup:${safeBackupFilename(filename)}`,metadata:{version:envelope.version,tableCounts:envelope.tableCounts,restoredTables:order}}}); return counts;
  },{maxWait:10000,timeout:120000});
  return {success:true,dryRun:false,summary:result};
}