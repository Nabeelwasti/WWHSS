import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";

export class FinanceValidationError extends Error {}

async function runSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 5
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err: any) {
      attempt++;
      const isSerializationFailure =
        err?.code === "P2034" ||
        (typeof err?.message === "string" &&
          (err.message.includes("serialization") ||
            err.message.includes("deadlock") ||
            err.message.includes("concurrent update")));
      if (isSerializationFailure && attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 10));
        continue;
      }
      throw err;
    }
  }
}

export async function createFeeStructure(input: { classId: string; academicYearId: string; name: string; amount: number }) {
  if (typeof input.amount !== "number" || input.amount <= 0) {
    throw new FinanceValidationError("Fee structure amount must be a positive number");
  }
  return prisma.feeStructure.create({ data: input });
}

// Generates one real invoice per student currently enrolled in the class —
// queries actual enrollment, never assumes a headcount or invents rows.
// Upserts on the real (feeStructureId, studentProfileId) unique constraint,
// so running this twice is safe: it corrects due dates rather than
// duplicating invoices.
export async function generateInvoicesForClass(feeStructureId: string, dueDate: string) {
  const feeStructure = await prisma.feeStructure.findUnique({
    where: { id: feeStructureId },
    include: { class: { include: { students: true } } },
  });
  if (!feeStructure) throw new FinanceValidationError("Fee structure not found");

  const parsedDueDate = new Date(dueDate);
  if (Number.isNaN(parsedDueDate.getTime())) throw new FinanceValidationError("Invalid due date");

  return prisma.$transaction(async (tx) => {
    const invoices = await Promise.all(
      feeStructure.class.students.map((student) =>
        tx.feeInvoice.upsert({
          where: { feeStructureId_studentProfileId: { feeStructureId, studentProfileId: student.id } },
          update: { dueDate: parsedDueDate },
          create: {
            feeStructureId,
            studentProfileId: student.id,
            amountDue: feeStructure.amount,
            dueDate: parsedDueDate,
          },
        })
      )
    );
    return invoices;
  });
}

export async function recordPayment(input: { invoiceId: string; amount: number; method: string; receivedByUserId: string }) {
  if (typeof input.amount !== "number" || input.amount <= 0) {
    throw new FinanceValidationError("Payment amount must be greater than zero");
  }

  const paymentAmount = new Prisma.Decimal(input.amount);

  return runSerializableTransaction(async (tx) => {
    const invoice = await tx.feeInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new FinanceValidationError("Invoice not found");

    if (invoice.status === "waived") {
      throw new FinanceValidationError("Cannot record payment for a waived invoice");
    }
    if (invoice.status === "paid") {
      throw new FinanceValidationError("Cannot record payment for an invoice that is already fully paid");
    }

    const previousPayments = await tx.payment.findMany({ where: { invoiceId: input.invoiceId } });
    const previousPaidTotal = previousPayments.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal(0)
    );
    const amountDue = new Prisma.Decimal(invoice.amountDue);
    const remainingBalance = amountDue.sub(previousPaidTotal);

    if (paymentAmount.gt(remainingBalance)) {
      throw new FinanceValidationError(
        `Payment amount (${paymentAmount.toNumber()}) exceeds remaining balance (${remainingBalance.toNumber()})`
      );
    }

    const payment = await tx.payment.create({
      data: {
        invoiceId: input.invoiceId,
        amount: paymentAmount,
        method: input.method,
        receivedByUserId: input.receivedByUserId,
      },
    });

    const newTotalPaid = previousPaidTotal.add(paymentAmount);

    if (newTotalPaid.gte(amountDue)) {
      await tx.feeInvoice.update({ where: { id: input.invoiceId }, data: { status: "paid" } });
    } else if (newTotalPaid.gt(new Prisma.Decimal(0))) {
      await tx.feeInvoice.update({ where: { id: input.invoiceId }, data: { status: "partial" } });
    }

    await tx.auditLog.create({
      data: {
        userId: input.receivedByUserId,
        action: "finance:payment",
        resource: `invoice:${input.invoiceId}`,
        metadata: { amount: paymentAmount.toNumber(), method: input.method },
      },
    });

    return payment;
  });
}


export async function getStudentInvoices(studentProfileId: string) {
  const invoices = await prisma.feeInvoice.findMany({
    where: { studentProfileId },
    include: { feeStructure: true, payments: true },
    orderBy: { dueDate: "desc" },
  });

  const now = new Date();
  for (const inv of invoices) {
    if (inv.status === "pending" && inv.dueDate < now) {
      inv.status = "overdue";
      await prisma.feeInvoice.update({ where: { id: inv.id }, data: { status: "overdue" } });
    }
  }

  return invoices;
}
