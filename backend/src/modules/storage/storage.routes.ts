import { Router, raw } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
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

storageRouter.post(
  "/upload",
  authorize("storage:upload", async (req) => {
    let classId = typeof req.headers["x-class-id"] === "string" ? req.headers["x-class-id"] : undefined;
    let sectionId = typeof req.headers["x-section-id"] === "string" ? req.headers["x-section-id"] : undefined;
    const subjectId = typeof req.headers["x-subject-id"] === "string" ? req.headers["x-subject-id"] : undefined;
    const studentProfileId = typeof req.headers["x-student-profile-id"] === "string" ? req.headers["x-student-profile-id"] : undefined;
    if (studentProfileId) {
      const student = await prisma.studentProfile.findUnique({ where: { id: studentProfileId }, select: { classId: true, sectionId: true } });
      if (student) {
        classId = classId ?? student.classId ?? undefined;
        sectionId = sectionId ?? student.sectionId ?? undefined;
      }
    }
    if (sectionId && !classId) {
      const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { classId: true } });
      classId = section?.classId;
    }
    return { classId, sectionId, subjectId };
  }),
  raw({ type: () => true, limit: "10mb" }),
  async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const declaredLength = Number(req.headers["content-length"] || 0);
    const maxUploadBytes = 10 * 1024 * 1024;
    if (declaredLength > maxUploadBytes || body.length > maxUploadBytes) {
      return res.status(413).json({ error: "File size exceeds maximum allowed size of 10MB" });
    }
    if (body.length === 0) return res.status(400).json({ error: "Empty upload payload" });

    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const filename = String(req.headers["x-filename"] || ("upload_" + Date.now() + ".bin"));
    const mimeType = String(req.headers["x-mimetype"] || contentType || "application/octet-stream").trim().toLowerCase();

    try {
      const saved = await savePrivateFile({
        originalFilename: filename, mimeType, buffer: body,
        studentProfileId: req.headers["x-student-profile-id"] as string | undefined,
        staffProfileId: req.headers["x-staff-profile-id"] as string | undefined,
        classId: req.headers["x-class-id"] as string | undefined,
        sectionId: req.headers["x-section-id"] as string | undefined,
        subjectId: req.headers["x-subject-id"] as string | undefined,
      }, req.userId);
      res.status(201).json({ file: saved });
    } catch (e) {
      if (e instanceof StorageAuthorizationError) return res.status(403).json({ error: e.message });
      if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });
      res.status(500).json({ error: "File upload failed" });
    }
  }
);
storageRouter.get("/files/:filename", async (req, res) => {
  try {
    const fileData = await getPrivateFileContent(req.params.filename, req.userId!);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const safeDownloadName = (fileData as { originalName?: string }).originalName?.replace(/[^A-Za-z0-9._-]/g, "_") || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName}"`);
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

storageRouter.head("/files/:filename", async (req, res) => {
  try {
    const fileData = await getPrivateFileContent(req.params.filename, req.userId!);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const safeDownloadName = (fileData as { originalName?: string }).originalName?.replace(/[^A-Za-z0-9._-]/g, "_") || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName}"`);
    if (fileData.mimeType) res.setHeader("Content-Type", fileData.mimeType);
    if (fileData.buffer) res.setHeader("Content-Length", String(fileData.buffer.length));
    return res.status(200).end();
  } catch (e) {
    if (e instanceof StorageNotFoundError) return res.status(404).json({ error: e.message });
    if (e instanceof StorageAuthorizationError) return res.status(403).json({ error: e.message });
    if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });
    return res.status(500).json({ error: "Could not retrieve file" });
  }
});
storageRouter.delete("/files/:filename", async (req, res) => {
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
