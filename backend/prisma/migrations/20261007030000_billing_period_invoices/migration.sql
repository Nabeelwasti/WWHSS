-- Preserve every existing invoice while changing identity from one invoice
-- forever to one invoice per fee structure/student/billing period.
ALTER TABLE "fee_invoices" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "fee_invoices" ADD COLUMN "billingPeriodStart" TIMESTAMP(3);
ALTER TABLE "fee_invoices" ADD COLUMN "billingPeriodEnd" TIMESTAMP(3);

UPDATE "fee_invoices"
SET
  "invoiceNumber" = 'INV-' || "id",
  "billingPeriodStart" = "dueDate",
  "billingPeriodEnd" = "dueDate"
WHERE "invoiceNumber" IS NULL
   OR "billingPeriodStart" IS NULL
   OR "billingPeriodEnd" IS NULL;

ALTER TABLE "fee_invoices" ALTER COLUMN "invoiceNumber" SET NOT NULL;
ALTER TABLE "fee_invoices" ALTER COLUMN "billingPeriodStart" SET NOT NULL;
ALTER TABLE "fee_invoices" ALTER COLUMN "billingPeriodEnd" SET NOT NULL;

DROP INDEX IF EXISTS "fee_invoices_feeStructureId_studentProfileId_key";
CREATE UNIQUE INDEX "fee_invoices_invoiceNumber_key" ON "fee_invoices"("invoiceNumber");
CREATE UNIQUE INDEX "fee_inv_bill_period_uq"
  ON "fee_invoices"("feeStructureId", "studentProfileId", "billingPeriodStart", "billingPeriodEnd");
CREATE INDEX "fee_inv_student_period_idx"
  ON "fee_invoices"("studentProfileId", "billingPeriodStart", "billingPeriodEnd");
CREATE INDEX "fee_inv_structure_period_idx"
  ON "fee_invoices"("feeStructureId", "billingPeriodStart", "billingPeriodEnd");
