import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
import { userHasPermission } from "../identity/permissions.js";
import {
  createDocumentRecord,
  listDocumentRecords,
  generatePrintableDocumentPayload,
  DocumentValidationError,
} from "./documents.service.js";

export const documentsRouter = Router();
documentsRouter.use(authenticate);

const createDocSchema = z.object({
  docType: z.string().min(1),
  referenceId: z.string().uuid().optional(),
  studentProfileId: z.string().uuid().optional(),
  staffProfileId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  metadataJson: z.record(z.any()).optional(),
});

async function resolveDocumentScope(docType: string, referenceId: string) {
  if (["result_card", "report_card", "transfer_certificate", "fee_statement", "attendance_report"].includes(docType)) {
    const student = await prisma.studentProfile.findUnique({
      where: { id: referenceId },
      select: { id: true, classId: true, sectionId: true },
    });
    if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
    return { studentId: student.id, classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined };
  }

  if (docType === "fee_receipt") {
    const payment = await prisma.payment.findUnique({
      where: { id: referenceId },
      select: { invoice: { select: { studentProfileId: true, student: { select: { classId: true, sectionId: true } } } } },
    });
    if (!payment) throw new DocumentValidationError(`Payment ${referenceId} not found`);
    return {
      studentId: payment.invoice.studentProfileId,
      classId: payment.invoice.student.classId ?? undefined,
      sectionId: payment.invoice.student.sectionId ?? undefined,
    };
  }

  const record = await prisma.documentRecord.findFirst({
    where: { docType, referenceId },
    select: { studentProfileId: true, staffProfileId: true },
  });
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

documentsRouter.get("/", authorize("documents:view"), async (req, res) => {
  const docType = typeof req.query.docType === "string" ? req.query.docType : undefined;
  const studentProfileId = typeof req.query.studentProfileId === "string" ? req.query.studentProfileId : undefined;
  const staffProfileId = typeof req.query.staffProfileId === "string" ? req.query.staffProfileId : undefined;
  const academicYearId = typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;

  if (studentProfileId && req.userId) {
    const student = await prisma.studentProfile.findUnique({ where: { id: studentProfileId }, select: { classId: true, sectionId: true } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const allowed = await userHasPermission(req.userId, "documents:view", { studentId: studentProfileId, classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined });
    if (!allowed && !(await userHasPermission(req.userId, "documents:view:own", { studentId: studentProfileId }))) return res.status(403).json({ error: "Forbidden" });
  } else if (staffProfileId && req.userId) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffProfileId }, select: { departmentId: true } });
    if (!staff) return res.status(404).json({ error: "Staff profile not found" });
    if (!(await userHasPermission(req.userId, "documents:view", { departmentId: staff.departmentId ?? undefined }))) return res.status(403).json({ error: "Forbidden" });
  }

  const records = await listDocumentRecords({ docType, studentProfileId, staffProfileId, academicYearId });
  res.json({ documents: records });
});

documentsRouter.post("/", authorize("documents:create"), async (req, res) => {
  const parsed = createDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (req.userId && parsed.data.studentProfileId) {
    const student = await prisma.studentProfile.findUnique({ where: { id: parsed.data.studentProfileId }, select: { classId: true, sectionId: true } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    if (!(await userHasPermission(req.userId, "documents:create", { classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined, studentId: parsed.data.studentProfileId }))) return res.status(403).json({ error: "Forbidden" });
  }

  if (req.userId && parsed.data.staffProfileId) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: parsed.data.staffProfileId }, select: { departmentId: true } });
    if (!staff) return res.status(404).json({ error: "Staff profile not found" });
    if (!(await userHasPermission(req.userId, "documents:create", { departmentId: staff.departmentId ?? undefined }))) return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const doc = await createDocumentRecord(parsed.data, req.userId);
    res.status(201).json({ document: doc });
  } catch (e) {
    if (e instanceof DocumentValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

documentsRouter.get("/payload/:docType/:referenceId", authenticate, async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  try {
    const scope = await resolveDocumentScope(req.params.docType, req.params.referenceId);
    try {
      await requireDocumentPermission(req.userId, "documents:print", scope);
    } catch {
      return res.status(403).json({ error: "Forbidden: document is outside your permitted scope" });
    }
    const payload = await generatePrintableDocumentPayload(req.params.docType, req.params.referenceId);
    res.json({ payload });
  } catch (e) {
    if (e instanceof DocumentValidationError) return res.status(404).json({ error: e.message });
    throw e;
  }
});
