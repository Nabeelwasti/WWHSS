ALTER TABLE "payments" ADD COLUMN "paymentIntentId" TEXT;

CREATE UNIQUE INDEX "payments_paymentIntentId_key" ON "payments"("paymentIntentId");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_paymentIntentId_fkey"
FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
