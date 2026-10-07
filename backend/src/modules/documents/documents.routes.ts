import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { prisma } from "../../db/client.js";
import { userHasPermission } from "../identity/permissions.js";
import { createDocumentRecord, listDocumentRecords, generatePrintableDocumentPayload, DocumentValidationError } from "./documents.service.js";
import { renderDocumentCsv, renderDocumentHtml, renderDocumentPdf } from "./document-files.js";

export const documentsRouter = Router();
documentsRouter.use(authenticate);

const createDocSchema = z.object({ docType: z.string().min(1), referenceId: z.string().uuid().optional(), studentProfileId: z.string().uuid().optional(), staffProfileId: z.string().uuid().optional(), academicYearId: z.string().uuid().optional(), metadataJson: z.record(z.any()).optional() });

async function resolveDocumentScope(docType: string, referenceId: string) {
  if ([
    "result_card", "report_card", "transfer_certificate", "fee_statement", "attendance_report", "timetable",
    "transcript", "academic_history", "progress_report", "admission_document", "letter",
    "funding_report", "financial_summary", "library_card", "loan_report",
  ].includes(docType)) {
    const student = await prisma.studentProfile.findUnique({ where: { id: referenceId }, select: { id: true, classId: true, sectionId: true } });
    if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
    return { studentId: student.id, classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined };
  }
  if (docType === "class_sheet") {
    return { classId: referenceId };
  }
  if (["teacher_timetable", "room_schedule", "exam_schedule", "notice", "event_schedule", "invoice"].includes(docType)) {
    return {};
  }
  if (docType === "fee_receipt") {
    const payment = await prisma.payment.findUnique({ where: { id: referenceId }, select: { invoice: { select: { studentProfileId: true, student: { select: { classId: true, sectionId: true } } } } } });
    if (!payment) throw new DocumentValidationError(`Payment ${referenceId} not found`);
    return { studentId: payment.invoice.studentProfileId, classId: payment.invoice.student.classId ?? undefined, sectionId: payment.invoice.student.sectionId ?? undefined };
  }
  const record = await prisma.documentRecord.findFirst({ where: { docType, referenceId }, select: { studentProfileId: true, staffProfileId: true } });
  if (!record) throw new DocumentValidationError(`Document reference ${referenceId} not found`);
  if (record.studentProfileId) {
    const student = await prisma.studentProfile.findUnique({ where: { id: record.studentProfileId }, select: { classId: true, sectionId: true } });
    return { studentId: record.studentProfileId, classId: student?.classId ?? undefined, sectionId: student?.sectionId ?? undefined };
  }
  if (record.staffProfileId) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: record.staffProfileId }, select: { departmentId: true } });
    return { departmentId: staff?.departmentId ?? undefined };
  }
  return {};
}

async function requireDocumentPermission(userId: string, permissionKey: "documents:view" | "documents:create" | "documents:print", scope: { studentId?: string; classId?: string; sectionId?: string; departmentId?: string }) {
  if (await userHasPermission(userId, permissionKey, scope)) return;
  if (scope.studentId && await userHasPermission(userId, "documents:view:own", { studentId: scope.studentId })) return;
  throw new Error(`Forbidden: requires ${permissionKey}`);
}

const DOCUMENT_TYPES = [
  "result_card", "report_card", "transcript", "progress_report", "academic_history",
  "exam_schedule", "timetable", "attendance_report", "admission_document", "transfer_certificate",
  "notice", "letter", "invoice", "fee_receipt", "fee_statement", "funding_report", "financial_summary",
  "library_card", "loan_report", "class_sheet", "teacher_timetable", "room_schedule", "event_schedule",
] as const;

documentsRouter.get("/types", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  if (!(await userHasPermission(req.userId, "documents:view"))) return res.status(403).json({ error: "Forbidden" });
  res.json({ documentTypes: DOCUMENT_TYPES });
});

documentsRouter.get("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const docType = typeof req.query.docType === "string" ? req.query.docType : undefined;
  const studentProfileId = typeof req.query.studentProfileId === "string" ? req.query.studentProfileId : undefined;
  const staffProfileId = typeof req.query.staffProfileId === "string" ? req.query.staffProfileId : undefined;
  const academicYearId = typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;
  if (studentProfileId) {
    const student = await prisma.studentProfile.findUnique({ where: { id: studentProfileId }, select: { classId: true, sectionId: true } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const allowed = await userHasPermission(req.userId, "documents:view", { studentId: studentProfileId, classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined });
    const own = await userHasPermission(req.userId, "documents:view:own", { studentId: studentProfileId });
    if (!allowed && !own) return res.status(403).json({ error: "Forbidden" });
  } else if (staffProfileId) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffProfileId }, select: { departmentId: true } });
    if (!staff) return res.status(404).json({ error: "Staff profile not found" });
    if (!(await userHasPermission(req.userId, "documents:view", { departmentId: staff.departmentId ?? undefined }))) return res.status(403).json({ error: "Forbidden" });
  } else if (!(await userHasPermission(req.userId, "documents:view"))) return res.status(403).json({ error: "A document scope is required for this request" });
  const records = await listDocumentRecords({ docType, studentProfileId, staffProfileId, academicYearId });
  res.json({ documents: records });
});

documentsRouter.post("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = createDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.studentProfileId) {
    const student = await prisma.studentProfile.findUnique({ where: { id: parsed.data.studentProfileId }, select: { classId: true, sectionId: true } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    if (!(await userHasPermission(req.userId, "documents:create", { classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined, studentId: parsed.data.studentProfileId }))) return res.status(403).json({ error: "Forbidden" });
  } else if (parsed.data.staffProfileId) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: parsed.data.staffProfileId }, select: { departmentId: true } });
    if (!staff) return res.status(404).json({ error: "Staff profile not found" });
    if (!(await userHasPermission(req.userId, "documents:create", { departmentId: staff.departmentId ?? undefined }))) return res.status(403).json({ error: "Forbidden" });
  } else if (!(await userHasPermission(req.userId, "documents:create"))) return res.status(403).json({ error: "A document scope is required for this request" });
  try { const doc = await createDocumentRecord(parsed.data, req.userId); res.status(201).json({ document: doc }); } catch (e) { if (e instanceof DocumentValidationError) return res.status(400).json({ error: e.message }); throw e; }
});

documentsRouter.get("/payload/:docType/:referenceId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  try { const scope = await resolveDocumentScope(req.params.docType, req.params.referenceId); try { await requireDocumentPermission(req.userId, "documents:print", scope); } catch { return res.status(403).json({ error: "Forbidden: document is outside your permitted scope" }); } const payload = await generatePrintableDocumentPayload(req.params.docType, req.params.referenceId); res.json({ payload }); } catch (e) { if (e instanceof DocumentValidationError) return res.status(404).json({ error: e.message }); throw e; }
});

documentsRouter.get("/file/:format/:docType/:referenceId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const format = z.enum(["pdf", "html", "csv"]).safeParse(req.params.format);
  if (!format.success) return res.status(400).json({ error: "Unsupported document format" });
  try {
    const scope = await resolveDocumentScope(req.params.docType, req.params.referenceId);
    try { await requireDocumentPermission(req.userId, "documents:print", scope); } catch { return res.status(403).json({ error: "Forbidden: document is outside your permitted scope" }); }
    const payload = await generatePrintableDocumentPayload(req.params.docType, req.params.referenceId);
    const title = `${req.params.docType.replace(/[_-]+/g, " ")} — WWHS Digital Campus`;
    const output = format.data === "pdf" ? renderDocumentPdf(payload, title) : format.data === "html" ? renderDocumentHtml(payload, title) : renderDocumentCsv(payload);
    const mime = format.data === "pdf" ? "application/pdf" : format.data === "html" ? "text/html; charset=utf-8" : "text/csv; charset=utf-8";
    res.setHeader("Content-Type", mime); res.setHeader("Content-Length", output.byteLength); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Content-Disposition", `attachment; filename="${req.params.docType}-${req.params.referenceId}.${format.data}"`); res.send(output);
  } catch (e) { if (e instanceof DocumentValidationError) return res.status(404).json({ error: e.message }); throw e; }
});
