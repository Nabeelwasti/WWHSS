import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";

export const paymentsRouter = Router();

const providers = ["MANUAL", "JAZZCASH", "EASYPAISA", "BANK", "CARD", "OTHER"] as const;
const createSchema = z.object({
  invoiceId: z.string().uuid(),
  provider: z.enum(providers),
  amount: z.number().positive().finite(),
  externalReference: z.string().trim().min(1).max(200).optional(),
  checkoutUrl: z.string().url().max(2048).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "expiresAt must be in the future" });
  }
  if (value.checkoutUrl) {
    try {
      const u = new URL(value.checkoutUrl);
      if (u.protocol !== "https:") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkoutUrl"], message: "checkoutUrl must use HTTPS scheme" });
      }
      const allowedHosts = (process.env.ALLOWED_CHECKOUT_HOSTS ?? "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      const corsHosts = (process.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((origin) => {
          try { return new URL(origin.trim()).hostname.toLowerCase(); } catch { return ""; }
        })
        .filter(Boolean);
      const trustedSuffixes = [
        ...allowedHosts,
        ...corsHosts,
        "stripe.com",
        "jazzcash.com.pk",
        "easypaisa.com.pk",
        "payfast.pk",
        "1link.net.pk",
        "checkout.com",
        "paypal.com",
      ];
      const host = u.hostname.toLowerCase();
      const isTrusted = trustedSuffixes.some((s) => host === s || host.endsWith(`.${s}`));
      if (!isTrusted) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkoutUrl"], message: `checkoutUrl host '${host}' is not an explicitly permitted trusted payment host` });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkoutUrl"], message: "Invalid checkoutUrl" });
    }
  }
});

const webhookSchema = z.object({
  intentId: z.string().uuid(),
  status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED"]),
  externalReference: z.string().trim().min(1).max(200).optional(),
});

function verifySignature(raw: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const actual = Buffer.from(signature.trim(), "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

function providerSecret(provider: string): string | undefined {
  // Require provider-specific secret or centralized env.paymentWebhookSecret without silent/insecure fallbacks
  const specific = process.env[`PAYMENT_WEBHOOK_SECRET_${provider}`];
  if (specific && specific.trim().length > 0) return specific.trim();
  const globalSec = process.env.PAYMENT_WEBHOOK_SECRET;
  if (globalSec && globalSec.trim().length > 0) return globalSec.trim();
  return undefined;
}

paymentsRouter.post("/intents", authenticate, authorize("finance:manage"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const intent = await prisma.$transaction(async (tx) => {
      // Serialize intent creation per invoice so concurrent requests cannot reserve
      // more than the remaining balance.
      await tx.$queryRaw`SELECT id FROM "fee_invoices" WHERE id = ${parsed.data.invoiceId} FOR UPDATE`;
      const invoice = await tx.feeInvoice.findUnique({
        where: { id: parsed.data.invoiceId },
        include: { payments: true, feeWaivers: true },
      });
      if (!invoice) throw new Error("Invoice not found");
      if (!["issued", "partial", "overdue", "pending"].includes(invoice.status)) {
        throw new Error(`Cannot create a payment intent for an invoice with status '${invoice.status}'`);
      }

      const paid = invoice.payments
        .filter((payment) => payment.status === "posted")
        .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const waived = invoice.feeWaivers.reduce((sum, waiver) => sum.add(waiver.amount), new Prisma.Decimal(0));
      const pending = await tx.paymentIntent.findMany({
        where: { invoiceId: invoice.id, status: "PENDING" },
        select: { amount: true },
      });
      const pendingAmount = pending.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
      const remaining = new Prisma.Decimal(invoice.amountDue).sub(waived).sub(paid).sub(pendingAmount);
      const amount = new Prisma.Decimal(parsed.data.amount);
      if (amount.gt(remaining)) throw new Error("Payment intent exceeds the remaining invoice balance");

      return tx.paymentIntent.create({
        data: {
          invoiceId: invoice.id,
          provider: parsed.data.provider,
          amount,
          externalReference: parsed.data.externalReference,
          checkoutUrl: parsed.data.checkoutUrl,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
          metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    });

    return res.status(201).json({ intent });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create payment intent" });
  }
});

const allowedWebhookProviders = new Set<string>(providers);

paymentsRouter.post("/webhooks/:provider", async (req, res) => {
  const provider = req.params.provider.toUpperCase();
  if (!allowedWebhookProviders.has(provider)) return res.status(404).json({ error: "Unsupported payment provider" });

  const secret = providerSecret(provider);
  if (!secret) return res.status(503).json({ error: "Payment webhook is not configured" });

  const signature = typeof req.headers["x-payment-signature"] === "string"
    ? req.headers["x-payment-signature"]
    : "";
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!raw) return res.status(400).json({ error: "Signed raw request body is required" });
  if (!signature || !verifySignature(raw, signature, secret)) {
    return res.status(401).json({ error: "Invalid payment signature" });
  }

  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.findUnique({ where: { id: parsed.data.intentId } });
      if (!intent || intent.provider !== provider) return null;

      await tx.$queryRaw`SELECT id FROM "fee_invoices" WHERE id = ${intent.invoiceId} FOR UPDATE`;

      const current = await tx.paymentIntent.findUnique({ where: { id: intent.id } });
      if (!current) return null;
      if (current.status !== "PENDING") return current;

      const isExpired = current.expiresAt && current.expiresAt.getTime() < Date.now();
      // If payment SUCCEEDED even though intent expired, reconcile the payment rather than cancelling it!
      if (isExpired && parsed.data.status !== "SUCCEEDED") {
        const cancelled = await tx.paymentIntent.update({
          where: { id: current.id },
          data: { status: "CANCELLED" },
        });
        return cancelled;
      }

      const claimed = await tx.paymentIntent.updateMany({
        where: { id: current.id, status: "PENDING" },
        data: {
          status: parsed.data.status,
          externalReference: parsed.data.externalReference || current.externalReference,
        },
      });
      if (claimed.count !== 1) return tx.paymentIntent.findUnique({ where: { id: current.id } });

      const updated = await tx.paymentIntent.findUnique({ where: { id: current.id } });
      if (!updated) throw new Error("Payment intent disappeared during webhook processing");

      if (parsed.data.status === "SUCCEEDED") {
        const invoice = await tx.feeInvoice.findUnique({
          where: { id: current.invoiceId },
          include: { payments: true, feeWaivers: true },
        });
        if (!invoice) throw new Error("Invoice not found for payment intent");
        if (!["issued", "partial", "overdue", "pending"].includes(invoice.status)) {
          throw new Error(`Provider reported success for a non-payable invoice (status '${invoice.status}'); manual reconciliation is required`);
        }

        const paid = invoice.payments
          .filter((payment) => payment.status !== "reversed")
          .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
        const waived = invoice.feeWaivers.reduce((sum, waiver) => sum.add(waiver.amount), new Prisma.Decimal(0));
        const remaining = new Prisma.Decimal(invoice.amountDue).sub(waived).sub(paid);
        if (updated.amount.gt(remaining)) {
          throw new Error("Payment would exceed the remaining invoice balance");
        }

        await tx.payment.create({
          data: {
            invoiceId: current.invoiceId,
            amount: updated.amount,
            method: "ONLINE:" + provider,
            status: "posted",
            paymentIntentId: current.id,
          },
        });

        const newPaid = paid.add(updated.amount);
        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: { status: newPaid.add(waived).gte(invoice.amountDue) ? "paid" : "partial" },
        });
        await tx.auditLog.create({
          data: {
            action: "finance:payment_webhook",
            resource: `payment_intent:${current.id}`,
            metadata: { provider, status: parsed.data.status, invoiceId: current.invoiceId, amount: updated.amount.toString() },
          },
        });
      }

      return updated;
    });

    if (!result) return res.status(404).json({ error: "Payment intent not found" });
    return res.json({ intent: result });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Webhook processing failed" });
  }
});
