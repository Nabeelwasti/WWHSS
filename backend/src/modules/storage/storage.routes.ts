import { Router } from "express";
import fs from "node:fs";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  savePrivateFile,
  getPrivateFilePath,
  StorageValidationError,
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
        { originalFilename: filename, mimeType, buffer },
        req.userId!
      );
      res.status(201).json({ file: saved });
    } catch (e) {
      if (e instanceof StorageValidationError) return res.status(400).json({ error: e.message });
      res.status(500).json({ error: "File upload failed" });
    }
  });
});

storageRouter.get("/files/:filename", authorize("academics:view"), (req, res) => {
  try {
    const filePath = getPrivateFilePath(req.params.filename);
    res.sendFile(filePath);
  } catch (e) {
    if (e instanceof StorageValidationError) return res.status(404).json({ error: e.message });
    res.status(500).json({ error: "Could not retrieve file" });
  }
});
