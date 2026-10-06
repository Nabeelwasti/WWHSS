import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  savePrivateFile,
  getPrivateFileContent,
  StorageValidationError,
  StorageAuthorizationError,
  StorageNotFoundError,
} from "./storage.service.js";

export const storageRouter = Router();
storageRouter.use(authenticate);

storageRouter.post("/upload", authorize("academics:view"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });

  const contentType = req.headers["content-type"] || "";
  const filename = (req.headers["x-filename"] as string) || `upload_${Date.now()}.bin`;
  const mimeType = (req.headers["x-mimetype"] as string) || contentType || "application/octet-stream";

  const maxUploadBytes = 10 * 1024 * 1024;
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > maxUploadBytes) {
    return res.status(413).json({ error: "File size exceeds maximum allowed size of 10MB" });
  }
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  let rejected = false;
  req.on("data", (chunk: Buffer) => {
    receivedBytes += chunk.length;
    if (receivedBytes > maxUploadBytes) {
      rejected = true;
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("error", () => {
    if (!res.headersSent) res.status(413).json({ error: "Upload exceeded the 10MB request limit" });
  });

  req.on("end", async () => {
    if (rejected || receivedBytes > maxUploadBytes) {
      if (!res.headersSent) res.status(413).json({ error: "File size exceeds maximum allowed size of 10MB" });
      return;
    }
    try {
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        return res.status(400).json({ error: "Empty upload payload" });
      }
      const saved = await savePrivateFile(
        {
          originalFilename: filename,
          mimeType,
          buffer,
          studentProfileId: req.headers["x-student-profile-id"] as string | undefined,
          staffProfileId: req.headers["x-staff-profile-id"] as string | undefined,
          classId: req.headers["x-class-id"] as string | undefined,
          sectionId: req.headers["x-section-id"] as string | undefined,
          subjectId: req.headers["x-subject-id"] as string | undefined,
        },
        req.userId!
      );
      res.status(201).json({ file: saved });
    } catch (e) {
      if (e instanceof StorageAuthorizationError) return res.status(403).json({ error: e.message });
      if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });
      res.status(500).json({ error: "File upload failed" });
    }
  });
});

storageRouter.get("/files/:filename", authorize("academics:view"), async (req, res) => {
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
