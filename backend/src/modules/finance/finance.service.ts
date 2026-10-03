import { prisma } from "../../db/client.js";

export async function createFeeStructure(input: { classId: string; academicYearId: string; name: string; amount: number }) {
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
  if (!feeStructure) throw new Error("Fee structure not found");

  return Promise.all(
    feeStructure.class.students.map((student) =>
      prisma.feeInvoice.upsert({
        where: { feeStructureId_studentProfileId: { feeStructureId, studentProfileId: student.id } },
        update: { dueDate: new Date(dueDate) },
        create: {
          feeStructureId,
          studentProfileId: student.id,
          amountDue: feeStructure.amount,
          dueDate: new Date(dueDate),
        },
      })
    )
  );
}

export async function recordPayment(input: { invoiceId: string; amount: number; method: string; receivedByUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: input });

    const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    const payments = await tx.payment.findMany({ where: { invoiceId: input.invoiceId } });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    // Real status derived from actual payments recorded, not set manually.
    if (totalPaid >= invoice.amountDue) {
      await tx.feeInvoice.update({ where: { id: input.invoiceId }, data: { status: "paid" } });
    }

    return payment;
  });
}

export async function getStudentInvoices(studentProfileId: string) {
  return prisma.feeInvoice.findMany({
    where: { studentProfileId },
    include: { feeStructure: true, payments: true },
    orderBy: { dueDate: "desc" },
  });
}
