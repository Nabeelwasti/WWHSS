import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createFeeStructure,
  listFeeStructures,
  generateInvoicesForClass,
  recordPayment,
  getStudentInvoices,
  getStudentFeeStatement,
  getPaymentReceipt,
  listFundingCategories,
  createFundingCategory,
  assignStudentFundingRecord,
  getStudentFundingHistory,
  applyFeeWaiver,
  getFinancialSummaryReport,
  listFinanceInvoices,
  adjustPayment,
  refreshInvoiceStatus,
  FinanceValidationError,
} from "./finance.service.js";

export const financeRouter = Router();
financeRouter.use(authenticate);

// Finance read models deliberately use finance permissions instead of granting accountants broad academic-administration access.
financeRouter.get("/options", authorize("finance:view"), async (_req, res) => {
  const [classes, academicYears] = await Promise.all([
    prisma.class.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.academicYear.findMany({ select: { id: true, label: true, isActive: true }, orderBy: { startDate: "desc" } }),
  ]);
  res.json({ classes, academicYears });
});

financeRouter.get("/students/search", authorize("finance:view"), async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 100;
  if (query.length > 200) return res.status(400).json({ error: "Search query must be 200 characters or fewer." });
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) return res.status(400).json({ error: "Limit must be between 1 and 100." });
  const where: Prisma.StudentProfileWhereInput = query ? {
    OR: [
      { user: { fullName: { contains: query, mode: "insensitive" } } },
      { admissionNo: { contains: query, mode: "insensitive" } },
      { rollNumber: { contains: query, mode: "insensitive" } },
      { registrationNo: { contains: query, mode: "insensitive" } },
      { fatherName: { contains: query, mode: "insensitive" } },
      { guardianName: { contains: query, mode: "insensitive" } },
      { guardianPhone: { contains: query, mode: "insensitive" } },
      { user: { phone: { contains: query, mode: "insensitive" } } },
    ],
  } : {};
  const students = await prisma.studentProfile.findMany({
    where,
    select: {
      id: true, admissionNo: true, rollNumber: true,
      user: { select: { fullName: true, phone: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: { user: { fullName: "asc" } },
    take: rawLimit,
  });
  res.json({ students });
});

// ---------- FUNDING CATEGORIES & RECORDS ----------

financeRouter.get("/funding-categories", authorize("finance:view"), async (_req, res) => {
  res.json({ categories: await listFundingCategories() });
});

const fundingCategorySchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});
financeRouter.post("/funding-categories", authorize("finance:manage"), async (req, res) => {
  const parsed = fundingCategorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createFundingCategory(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const assignFundingSchema = z.object({
  studentProfileId: z.string().uuid(),
  fundingCategoryId: z.string().uuid(),
  programName: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  evidenceRef: z.string().optional(),
  approvalAuthority: z.string().optional(),
  feePolicy: z.enum(["FULLY_WAIVED", "PARTIALLY_WAIVED", "STANDARD", "CUSTOM"]).optional(),
  waiverPercentage: z.number().min(0).max(100).optional(),
  customFeeAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});
financeRouter.post("/funding-records", authorize("finance:manage"), async (req, res) => {
  const parsed = assignFundingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await assignStudentFundingRecord(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

financeRouter.get(
  "/funding-records/student/:studentProfileId",
  authorize("finance:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ records: await getStudentFundingHistory(req.params.studentProfileId) });
  }
);

// ---------- FEE STRUCTURES & INVOICE GENERATION ----------

financeRouter.get("/fee-structures", authorize("finance:view"), async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
  const academicYearId = typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;
  res.json({ feeStructures: await listFeeStructures(classId, academicYearId) });
});

const structureSchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string().min(1),
  amount: z.number().positive(),
  fundingCategoryId: z.string().uuid().optional(),
  feeType: z.string().optional(),
});
financeRouter.post("/fee-structures", authorize("finance:manage"), async (req, res) => {
  const parsed = structureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createFeeStructure(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const generateSchema = z.object({
  feeStructureId: z.string().uuid(),
  dueDate: z.string(),
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
}).superRefine((value, ctx) => {
  if ((value.billingPeriodStart && !value.billingPeriodEnd) || (!value.billingPeriodStart && value.billingPeriodEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["billingPeriodStart"], message: "billingPeriodStart and billingPeriodEnd must be supplied together" });
  }
});
financeRouter.post("/generate-invoices", authorize("finance:manage"), async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const invoices = await generateInvoicesForClass(
      parsed.data.feeStructureId,
      parsed.data.dueDate,
      req.userId,
      parsed.data.billingPeriodStart,
      parsed.data.billingPeriodEnd
    );
    res.status(201).json({ generated: invoices.length });
  } catch (e) {
    if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

// Finance-wide invoice search is restricted to finance managers; student/guardian views use the scoped routes below.
financeRouter.get("/invoices", authorize("finance:manage"), async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const studentProfileId = typeof req.query.studentProfileId === "string" ? req.query.studentProfileId : undefined;
  const page = typeof req.query.page === "string" ? Number.parseInt(req.query.page, 10) : undefined;
  const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
  if (status && !["draft", "issued", "partial", "paid", "overdue", "waived", "cancelled", "void", "written_off", "refunded", "pending"].includes(status)) {
    return res.status(400).json({ error: "Unsupported invoice status filter." });
  }
  if (studentProfileId && !z.string().uuid().safeParse(studentProfileId).success) {
    return res.status(400).json({ error: "Invalid student profile ID." });
  }
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) return res.status(400).json({ error: "Page must be a positive integer." });
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return res.status(400).json({ error: "Limit must be between 1 and 100." });
  res.json(await listFinanceInvoices({ query, status, studentProfileId, page, limit }));
});

// ---------- PAYMENTS & WAIVERS ----------

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "bank_transfer", "card", "online"]),
});
financeRouter.post("/payments", authorize("finance:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await recordPayment({ ...parsed.data, receivedByUserId: req.userId }));
  } catch (e) {
    if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const waiverSchema = z.object({
  invoiceId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(1),
});
financeRouter.post("/waivers", authorize("finance:manage"), async (req, res) => {
  const parsed = waiverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await applyFeeWaiver(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const adjustmentSchema = z.object({ paymentId: z.string().uuid(), kind: z.enum(["REFUND", "REVERSAL", "ADJUSTMENT"]), amount: z.number().positive(), reason: z.string().min(3), reference: z.string().optional() });
financeRouter.post("/payments/adjust", authorize("finance:manage"), async (req, res) => {
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try { res.status(201).json(await adjustPayment({ ...parsed.data, adjustedByUserId: req.userId! })); }
  catch (e) { if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message }); throw e; }
});

financeRouter.post("/invoices/:invoiceId/refresh-status", authorize("finance:manage"), async (req, res) => {
  try { res.json(await refreshInvoiceStatus(req.params.invoiceId, req.userId)); }
  catch (e) { if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message }); throw e; }
});

// ---------- STUDENT STATEMENTS & RECEIPTS ----------

financeRouter.get(
  "/student/:studentProfileId",
  authorize("finance:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ invoices: await getStudentInvoices(req.params.studentProfileId) });
  }
);

financeRouter.get(
  "/student/:studentProfileId/statement",
  authorize("finance:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    try {
      res.json(await getStudentFeeStatement(req.params.studentProfileId));
    } catch (e) {
      if (e instanceof FinanceValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }
  }
);

financeRouter.get(
  "/payments/:paymentId/receipt",
  authorize("finance:view:own", async (req) => {
    const payment = await getPaymentReceipt(req.params.paymentId);
    return { studentId: payment.invoice.studentProfileId };
  }),
  async (req, res) => {
    try {
      res.json({ receipt: await getPaymentReceipt(req.params.paymentId) });
    } catch (e) {
      if (e instanceof FinanceValidationError) return res.status(404).json({ error: e.message });
      throw e;
    }
  }
);

financeRouter.get("/reports/summary", authorize("finance:manage"), async (_req, res) => {
  res.json(await getFinancialSummaryReport());
});
