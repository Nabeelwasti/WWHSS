import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createEncryptedBackup,
  listBackups,
  verifyBackupRecovery,
  exportDatabaseData,
  BackupError,
} from "./backup.service.js";

export const backupRouter = Router();
backupRouter.use(authenticate);

backupRouter.get("/", authorize("users:manage"), async (_req, res) => {
  res.json({ backups: listBackups() });
});

backupRouter.post("/export", authorize("users:manage"), async (_req, res) => {
  const data = await exportDatabaseData();
  res.json(data);
});

backupRouter.post("/create", authorize("users:manage"), async (_req, res) => {
  try {
    const backup = await createEncryptedBackup();
    res.status(201).json({ backup });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Backup creation failed" });
  }
});

backupRouter.post("/verify/:filename", authorize("users:manage"), async (req, res) => {
  try {
    const result = verifyBackupRecovery(req.params.filename);
    res.json({ verification: result });
  } catch (e) {
    if (e instanceof BackupError) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Backup verification failed" });
  }
});
