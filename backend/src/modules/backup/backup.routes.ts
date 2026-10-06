import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createEncryptedBackup,
  listBackups,
  verifyBackupRecovery,
  restoreFromBackup,
  exportDatabaseData,
  BackupError,
} from "./backup.service.js";

export const backupRouter = Router();
backupRouter.use(authenticate);

// Human-facing exports are deliberately different from disaster-recovery
// backups. A DR backup must contain everything required to restore the
// system, while an export should never disclose authentication/session
// material merely because the caller is allowed to download business data.
const SENSITIVE_KEY = /password|refresh.?token|tokenHash|secret|api.?key|private.?key/i;
const SENSITIVE_TABLES = new Set(["refreshTokens", "auditLogs"]);

function sanitizeHumanExport(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => sanitizeHumanExport(item)).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const sanitized = sanitizeHumanExport(childValue, childKey);
    if (sanitized !== undefined) result[childKey] = sanitized;
  }
  return result;
}

function sanitizeBusinessExport(data: Awaited<ReturnType<typeof exportDatabaseData>>) {
  const tables: Record<string, unknown> = {};
  for (const [tableName, rows] of Object.entries(data.tables)) {
    if (SENSITIVE_TABLES.has(tableName)) continue;
    tables[tableName] = sanitizeHumanExport(rows);
  }
  return { meta: { ...data.meta, exportType: "business", sensitiveSystemDataExcluded: true }, tables };
}

backupRouter.get("/", authorize("backup:view"), async (_req, res) => {
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (e) {
    res.status(500).json({ error: "Failed to list backups" });
  }
});

backupRouter.post("/export", authorize("backup:download"), async (_req, res) => {
  try {
    const data = await exportDatabaseData();
    res.json(sanitizeBusinessExport(data));
  } catch (e) {
    res.status(500).json({ error: "Export failed" });
  }
});

backupRouter.post("/create", authorize("backup:create"), async (_req, res) => {
  try {
    const backup = await createEncryptedBackup();
    res.status(201).json({ backup });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Backup creation failed" });
  }
});

backupRouter.post("/verify/:filename", authorize("backup:view"), async (req, res) => {
  try {
    const result = await verifyBackupRecovery(req.params.filename);
    res.json({ verification: result });
  } catch (e) {
    if (e instanceof BackupError) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Backup verification failed" });
  }
});

backupRouter.post("/restore/:filename", authorize("backup:restore"), async (req, res) => {
  const dryRun = req.body?.dryRun === true;
  if (!dryRun && req.body?.confirm !== "RESTORE") return res.status(400).json({ error: "Destructive restore requires confirm: RESTORE; run a dryRun first." });
  try {
    const result = await restoreFromBackup(req.params.filename, undefined, req.userId!, dryRun);
    res.json({ restore: result });
  } catch (e) {
    if (e instanceof BackupError) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Backup restore failed" });
  }
});
