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

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));

  req.on("end", async () => {
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
