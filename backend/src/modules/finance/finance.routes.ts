import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { createFeeStructure, generateInvoicesForClass, recordPayment, getStudentInvoices } from "./finance.service.js";

export const financeRouter = Router();
financeRouter.use(authenticate);

const structureSchema = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string().min(1),
  amount: z.number().positive(),
});
financeRouter.post("/fee-structures", authorize("finance:manage"), async (req, res) => {
  const parsed = structureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createFeeStructure(parsed.data));
});

const generateSchema = z.object({ feeStructureId: z.string().uuid(), dueDate: z.string() });
financeRouter.post("/generate-invoices", authorize("finance:manage"), async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const invoices = await generateInvoicesForClass(parsed.data.feeStructureId, parsed.data.dueDate);
  res.status(201).json({ generated: invoices.length });
});

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "bank_transfer", "card", "online"]),
});
financeRouter.post("/payments", authorize("finance:manage"), async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await recordPayment({ ...parsed.data, receivedByUserId: req.userId! }));
});

// A student's own invoices, or a linked parent's — real relationship
// check, same pattern as attendance/exams/grades.
financeRouter.get(
  "/student/:studentProfileId",
  authorize("finance:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ invoices: await getStudentInvoices(req.params.studentProfileId) });
  }
);
