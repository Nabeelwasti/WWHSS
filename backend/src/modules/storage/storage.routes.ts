import { Router, raw } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  savePrivateFile,
  getPrivateFileContent,
  deletePrivateFile,
  StorageValidationError,
  StorageAuthorizationError,
  StorageNotFoundError,
} from "./storage.service.js";

export const storageRouter = Router();
storageRouter.use(authenticate);

storageRouter.post(\n  "/upload",\n  authorize("academics:view"),\n  raw({ type: () => true, limit: "10mb" }),\n  async (req, res) => {\n    if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });\n\n    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);\n    const declaredLength = Number(req.headers["content-length"] || 0);\n    const maxUploadBytes = 10 * 1024 * 1024;\n    if (declaredLength > maxUploadBytes || body.length > maxUploadBytes) {\n      return res.status(413).json({ error: "File size exceeds maximum allowed size of 10MB" });\n    }\n    if (body.length === 0) return res.status(400).json({ error: "Empty upload payload" });\n\n    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();\n    const filename = String(req.headers["x-filename"] || ("upload_" + Date.now() + ".bin"));\n    const mimeType = String(req.headers["x-mimetype"] || contentType || "application/octet-stream").trim().toLowerCase();\n\n    try {\n      const saved = await savePrivateFile({\n        originalFilename: filename, mimeType, buffer: body,\n        studentProfileId: req.headers["x-student-profile-id"] as string | undefined,\n        staffProfileId: req.headers["x-staff-profile-id"] as string | undefined,\n        classId: req.headers["x-class-id"] as string | undefined,\n        sectionId: req.headers["x-section-id"] as string | undefined,\n        subjectId: req.headers["x-subject-id"] as string | undefined,\n      }, req.userId);\n      res.status(201).json({ file: saved });\n    } catch (e) {\n      if (e instanceof StorageAuthorizationError) return res.status(403).json({ error: e.message });\n      if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });\n      res.status(500).json({ error: "File upload failed" });\n    }\n  }\n);\nstorageRouter.get("/files/:filename", authorize("academics:view"), async (req, res) => {
  try {
    const fileData = await getPrivateFileContent(req.params.filename, req.userId!);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    if (fileData.filePath) {
      return res.sendFile(fileData.filePath);
    }
    if (fileData.buffer) {
      if (fileData.mimeType) res.setHeader("Content-Type", fileData.mimeType);
      return res.send(fileData.buffer);
    }
    res.status(404).json({ error: "File not found" });
  } catch (e) {
    if (e instanceof StorageNotFoundError) return res.status(404).json({ error: e.message });
    if (e instanceof StorageAuthorizationError) return res.status(403).json({ error: e.message });
    if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Could not retrieve file" });
  }
});

storageRouter.delete("/files/:filename", authorize("academics:view"), async (req, res) => {
  try {
    await deletePrivateFile(req.params.filename, req.userId!);
    res.status(204).send();
  } catch (e) {
    if (e instanceof StorageNotFoundError) return res.status(404).json({ error: e.message });
    if (e instanceof StorageAuthorizationError) return res.status(403).json({ error: e.message });
    if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Could not delete file" });
  }
});
