import { prisma } from "../../db/client.js";

export class FinanceValidationError extends Error {}

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

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.feeInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new FinanceValidationError("Invoice not found");

    if (invoice.status === "waived") {
      throw new FinanceValidationError("Cannot record payment for a waived invoice");
    }
    if (invoice.status === "paid") {
      throw new FinanceValidationError("Cannot record payment for an invoice that is already fully paid");
    }

    const previousPayments = await tx.payment.findMany({ where: { invoiceId: input.invoiceId } });
    const previousPaidTotal = previousPayments.reduce((sum, p) => sum + p.amount, 0);
    const roundedPreviousTotal = Math.round(previousPaidTotal * 100) / 100;
    const roundedAmountDue = Math.round(invoice.amountDue * 100) / 100;
    const remainingBalance = Math.round((roundedAmountDue - roundedPreviousTotal) * 100) / 100;

    const roundedInputAmount = Math.round(input.amount * 100) / 100;

    if (roundedInputAmount > remainingBalance + 0.001) {
      throw new FinanceValidationError(
        `Payment amount (${roundedInputAmount}) exceeds remaining balance (${remainingBalance})`
      );
    }

    const payment = await tx.payment.create({
      data: {
        invoiceId: input.invoiceId,
        amount: roundedInputAmount,
        method: input.method,
        receivedByUserId: input.receivedByUserId,
      },
    });

    const newTotalPaid = Math.round((roundedPreviousTotal + roundedInputAmount) * 100) / 100;

    if (newTotalPaid >= roundedAmountDue - 0.001) {
      await tx.feeInvoice.update({ where: { id: input.invoiceId }, data: { status: "paid" } });
    } else if (newTotalPaid > 0) {
      await tx.feeInvoice.update({ where: { id: input.invoiceId }, data: { status: "partial" } });
    }

    await tx.auditLog.create({
      data: {
        userId: input.receivedByUserId,
        action: "finance:payment",
        resource: `invoice:${input.invoiceId}`,
        metadata: { amount: roundedInputAmount, method: input.method },
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
