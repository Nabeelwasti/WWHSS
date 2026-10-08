CREATE TABLE "payment_intents" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "externalReference" TEXT,
  "checkoutUrl" TEXT,
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_intents_invoiceId_status_idx" ON "payment_intents"("invoiceId","status");
CREATE INDEX "payment_intents_provider_externalReference_idx" ON "payment_intents"("provider","externalReference");
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
