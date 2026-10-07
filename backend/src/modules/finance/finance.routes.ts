import { Router } from "express";
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
  adjustPayment,
  refreshInvoiceStatus,
  FinanceValidationError,
} from "./finance.service.js";

export const financeRouter = Router();
financeRouter.use(authenticate);

// ---------- FUNDING CATEGORIES & RECORDS ----------

financeRouter.get("/funding-categories", authorize("academics:view"), async (_req, res) => {
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

financeRouter.get("/fee-structures", authorize("academics:view"), async (req, res) => {
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
