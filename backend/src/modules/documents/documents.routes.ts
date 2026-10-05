import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createDocumentRecord,
  listDocumentRecords,
  generatePrintableDocumentPayload,
  DocumentValidationError,
} from "./documents.service.js";

export const documentsRouter = Router();
documentsRouter.use(authenticate);

documentsRouter.get("/", authorize("academics:view"), async (req, res) => {
  const docType = typeof req.query.docType === "string" ? req.query.docType : undefined;
  const studentProfileId = typeof req.query.studentProfileId === "string" ? req.query.studentProfileId : undefined;
  const staffProfileId = typeof req.query.staffProfileId === "string" ? req.query.staffProfileId : undefined;
  const academicYearId = typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;

  const records = await listDocumentRecords({ docType, studentProfileId, staffProfileId, academicYearId });
  res.json({ documents: records });
});

const createDocSchema = z.object({
  docType: z.string().min(1),
  studentProfileId: z.string().uuid().optional(),
  staffProfileId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  metadataJson: z.record(z.any()).optional(),
});

documentsRouter.post("/", authorize("academics:view"), async (req, res) => {
  const parsed = createDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const doc = await createDocumentRecord(parsed.data, req.userId);
    res.status(201).json({ document: doc });
  } catch (e) {
    if (e instanceof DocumentValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

documentsRouter.get("/payload/:docType/:referenceId", authorize("academics:view"), async (req, res) => {
  try {
    const payload = await generatePrintableDocumentPayload(req.params.docType, req.params.referenceId);
    res.json({ payload });
  } catch (e) {
    if (e instanceof DocumentValidationError) return res.status(404).json({ error: e.message });
    throw e;
  }
});
