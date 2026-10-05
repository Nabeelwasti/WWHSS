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
    } catch (err: unknown) {
      attempt++;
      const isSerializationFailure =
        (err as Record<string, unknown>)?.code === "P2034" ||
        (typeof (err as Record<string, unknown>)?.message === "string" &&
          ((err as Error).message.includes("serialization") ||
            (err as Error).message.includes("deadlock") ||
            (err as Error).message.includes("concurrent update")));
      if (isSerializationFailure && attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 10));
        continue;
      }
      throw err;
    }
  }
}

// ---------- FUNDING CATEGORIES ----------

export async function listFundingCategories() {
  return prisma.fundingCategory.findMany({ orderBy: { name: "asc" } });
}

export async function createFundingCategory(
  input: { name: string; code: string; description?: string; isDefault?: boolean },
  actorId?: string
) {
  const existingCode = await prisma.fundingCategory.findUnique({ where: { code: input.code } });
  if (existingCode) throw new FinanceValidationError(`Funding category code ${input.code} already exists`);

  const existingName = await prisma.fundingCategory.findUnique({ where: { name: input.name } });
  if (existingName) throw new FinanceValidationError(`Funding category name ${input.name} already exists`);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.fundingCategory.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    const cat = await tx.fundingCategory.create({
      data: {
        name: input.name,
        code: input.code,
        description: input.description,
        isDefault: Boolean(input.isDefault),
      },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "finance:create_funding_category",
          resource: `funding_category:${cat.id}`,
          metadata: { name: input.name, code: input.code },
        },
      });
    }

    return cat;
  });
}

// ---------- STUDENT FUNDING RECORDS ----------

export async function assignStudentFundingRecord(
  input: {
    studentProfileId: string;
    fundingCategoryId: string;
    programName?: string;
    startDate: string;
    endDate?: string;
    evidenceRef?: string;
    approvalAuthority?: string;
    feePolicy?: "FULLY_WAIVED" | "PARTIALLY_WAIVED" | "STANDARD" | "CUSTOM";
    waiverPercentage?: number;
    customFeeAmount?: number;
    notes?: string;
  },
  actorId?: string
) {
  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentProfileId } });
  if (!student) throw new FinanceValidationError(`Student profile ${input.studentProfileId} not found`);

  const category = await prisma.fundingCategory.findUnique({ where: { id: input.fundingCategoryId } });
  if (!category) throw new FinanceValidationError(`Funding category ${input.fundingCategoryId} not found`);

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) throw new FinanceValidationError("Invalid start date");

  const endDate = input.endDate ? new Date(input.endDate) : undefined;
  if (endDate && Number.isNaN(endDate.getTime())) throw new FinanceValidationError("Invalid end date");

  const feePolicy = input.feePolicy || "FULLY_WAIVED";

  return prisma.$transaction(async (tx) => {
    const record = await tx.studentFundingRecord.create({
      data: {
        studentProfileId: input.studentProfileId,
        fundingCategoryId: input.fundingCategoryId,
        programName: input.programName,
        startDate,
        endDate,
        evidenceRef: input.evidenceRef,
        approvalAuthority: input.approvalAuthority,
        feePolicy,
        waiverPercentage: input.waiverPercentage !== undefined ? new Prisma.Decimal(input.waiverPercentage) : undefined,
        customFeeAmount: input.customFeeAmount !== undefined ? new Prisma.Decimal(input.customFeeAmount) : undefined,
        notes: input.notes,
      },
      include: { fundingCategory: true, student: true },
    });

    await tx.studentProfile.update({
      where: { id: input.studentProfileId },
      data: { fundingCategoryId: input.fundingCategoryId },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "finance:assign_funding",
          resource: `student:${input.studentProfileId}:funding:${record.id}`,
          metadata: { feePolicy, fundingCategory: category.name },
        },
      });
    }

    return record;
  });
}

export async function getStudentFundingHistory(studentProfileId: string) {
  return prisma.studentFundingRecord.findMany({
    where: { studentProfileId },
    include: { fundingCategory: true },
    orderBy: { createdAt: "desc" },
  });
}

// ---------- FEE STRUCTURES & INVOICE GENERATION ----------

export async function createFeeStructure(
  input: { classId: string; academicYearId: string; name: string; amount: number; fundingCategoryId?: string; feeType?: string },
  actorId?: string
) {
  if (typeof input.amount !== "number" || input.amount <= 0) {
    throw new FinanceValidationError("Fee structure amount must be a positive number");
  }

  const [cls, year] = await Promise.all([
    prisma.class.findUnique({ where: { id: input.classId } }),
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
  ]);

  if (!cls) throw new FinanceValidationError(`Class ${input.classId} not found`);
  if (!year) throw new FinanceValidationError(`Academic year ${input.academicYearId} not found`);
  if (cls.academicYearId !== input.academicYearId) {
    throw new FinanceValidationError(`Class ${input.classId} does not belong to specified academic year ${input.academicYearId}`);
  }

  return prisma.$transaction(async (tx) => {
    const fs = await tx.feeStructure.create({
      data: {
        classId: input.classId,
        academicYearId: input.academicYearId,
        name: input.name,
        amount: new Prisma.Decimal(input.amount),
        fundingCategoryId: input.fundingCategoryId,
        feeType: input.feeType || "TUITION",
      },
      include: { class: true, academicYear: true, fundingCategory: true },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "finance:create_fee_structure",
          resource: `fee_structure:${fs.id}`,
          metadata: { classId: input.classId, academicYearId: input.academicYearId, amount: input.amount },
        },
      });
    }

    return fs;
  });
}

export async function listFeeStructures(classId?: string, academicYearId?: string) {
  return prisma.feeStructure.findMany({
    where: {
      ...(classId ? { classId } : {}),
      ...(academicYearId ? { academicYearId } : {}),
    },
    include: { class: true, academicYear: true, fundingCategory: true },
    orderBy: { name: "asc" },
  });
}

export async function generateInvoicesForClass(feeStructureId: string, dueDate: string, actorId?: string) {
  const feeStructure = await prisma.feeStructure.findUnique({
    where: { id: feeStructureId },
    include: { class: { include: { students: { include: { fundingRecords: { orderBy: { createdAt: "desc" }, take: 1 } } } } } },
  });
  if (!feeStructure) throw new FinanceValidationError("Fee structure not found");

  const parsedDueDate = new Date(dueDate);
  if (Number.isNaN(parsedDueDate.getTime())) throw new FinanceValidationError("Invalid due date");

  const baseAmount = feeStructure.amount;

  return prisma.$transaction(async (tx) => {
    const invoices = await Promise.all(
      feeStructure.class.students.map(async (student) => {
        const activeFunding = student.fundingRecords[0];
        let calculatedAmountDue = baseAmount;
        let initialStatus = "pending";

        if (activeFunding) {
          if (activeFunding.feePolicy === "FULLY_WAIVED") {
            calculatedAmountDue = new Prisma.Decimal(0);
            initialStatus = "waived";
          } else if (activeFunding.feePolicy === "PARTIALLY_WAIVED" && activeFunding.waiverPercentage) {
            const discountPct = new Prisma.Decimal(100).sub(activeFunding.waiverPercentage).div(100);
            calculatedAmountDue = baseAmount.mul(discountPct);
          } else if (activeFunding.feePolicy === "CUSTOM" && activeFunding.customFeeAmount) {
            calculatedAmountDue = activeFunding.customFeeAmount;
          }
        }

        const invoice = await tx.feeInvoice.upsert({
          where: { feeStructureId_studentProfileId: { feeStructureId, studentProfileId: student.id } },
          update: { dueDate: parsedDueDate },
          create: {
            feeStructureId,
            studentProfileId: student.id,
            amountDue: calculatedAmountDue,
            dueDate: parsedDueDate,
            status: initialStatus,
          },
        });

        // Automatically create a record in fee_waivers if funding fully or partially waived the fee
        if (activeFunding && (activeFunding.feePolicy === "FULLY_WAIVED" || activeFunding.feePolicy === "PARTIALLY_WAIVED")) {
          const waivedAmount = baseAmount.sub(calculatedAmountDue);
          if (waivedAmount.gt(0)) {
            await tx.feeWaiver.create({
              data: {
                invoiceId: invoice.id,
                studentProfileId: student.id,
                amount: waivedAmount,
                reason: `Automatic Workers Welfare Funding Waiver (${activeFunding.feePolicy})`,
                approvedByUserId: actorId,
              },
            });
          }
        }

        return invoice;
      })
    );

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "finance:generate_invoices",
          resource: `fee_structure:${feeStructureId}`,
          metadata: { generated: invoices.length, dueDate },
        },
      });
    }

    return invoices;
  });
}

// ---------- PAYMENTS & WAIVERS ----------

export async function applyFeeWaiver(
  input: { invoiceId: string; studentProfileId: string; amount: number; reason: string },
  actorId?: string
) {
  if (typeof input.amount !== "number" || input.amount <= 0) {
    throw new FinanceValidationError("Waiver amount must be greater than zero");
  }

  const waiverAmount = new Prisma.Decimal(input.amount);

  return runSerializableTransaction(async (tx) => {
    const invoice = await tx.feeInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new FinanceValidationError("Invoice not found");
    if (invoice.studentProfileId !== input.studentProfileId) {
      throw new FinanceValidationError("Invoice does not belong to specified student");
    }

    const previousPayments = await tx.payment.findMany({ where: { invoiceId: input.invoiceId } });
    const paidTotal = previousPayments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
    const previousWaivers = await tx.feeWaiver.findMany({ where: { invoiceId: input.invoiceId } });
    const waivedTotal = previousWaivers.reduce((sum, w) => sum.add(w.amount), new Prisma.Decimal(0));

    const remainingToWaive = invoice.amountDue.sub(paidTotal).sub(waivedTotal);

    if (waiverAmount.gt(remainingToWaive)) {
      throw new FinanceValidationError(
        `Waiver amount (${waiverAmount.toNumber()}) exceeds remaining un-waived balance (${remainingToWaive.toNumber()})`
      );
    }

    const waiver = await tx.feeWaiver.create({
      data: {
        invoiceId: input.invoiceId,
        studentProfileId: input.studentProfileId,
        amount: waiverAmount,
        reason: input.reason,
        approvedByUserId: actorId,
      },
    });

    const newWaivedTotal = waivedTotal.add(waiverAmount);
    if (paidTotal.add(newWaivedTotal).gte(invoice.amountDue)) {
      await tx.feeInvoice.update({
        where: { id: input.invoiceId },
        data: { status: paidTotal.gt(0) ? "paid" : "waived" },
      });
    }

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "finance:apply_waiver",
          resource: `invoice:${input.invoiceId}:waiver:${waiver.id}`,
          metadata: { amount: waiverAmount.toNumber(), reason: input.reason },
        },
      });
    }

    return waiver;
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
    const previousPaidTotal = previousPayments.reduce((sum, p) => sum.add(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0));
    const waivers = await tx.feeWaiver.findMany({ where: { invoiceId: input.invoiceId } });
    const waivedTotal = waivers.reduce((sum, w) => sum.add(new Prisma.Decimal(w.amount)), new Prisma.Decimal(0));

    const effectiveAmountDue = new Prisma.Decimal(invoice.amountDue).sub(waivedTotal);
    const remainingBalance = effectiveAmountDue.sub(previousPaidTotal);

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

    if (newTotalPaid.gte(effectiveAmountDue)) {
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

// ---------- STATEMENTS & REPORTS ----------

export async function getStudentInvoices(studentProfileId: string) {
  const invoices = await prisma.feeInvoice.findMany({
    where: { studentProfileId },
    include: { feeStructure: true, payments: true, feeWaivers: true },
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

export async function getStudentFeeStatement(studentProfileId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      class: true,
      section: true,
      fundingCategory: true,
    },
  });
  if (!student) throw new FinanceValidationError(`Student profile ${studentProfileId} not found`);

  const invoices = await getStudentInvoices(studentProfileId);

  let totalBilled = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  let totalWaived = new Prisma.Decimal(0);

  for (const inv of invoices) {
    totalBilled = totalBilled.add(inv.amountDue);
    const paid = inv.payments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
    const waived = inv.feeWaivers.reduce((sum, w) => sum.add(w.amount), new Prisma.Decimal(0));
    totalPaid = totalPaid.add(paid);
    totalWaived = totalWaived.add(waived);
  }

  const outstandingBalance = totalBilled.sub(totalPaid).sub(totalWaived);

  return {
    student,
    invoices,
    summary: {
      totalBilled: totalBilled.toNumber(),
      totalPaid: totalPaid.toNumber(),
      totalWaived: totalWaived.toNumber(),
      outstandingBalance: outstandingBalance.toNumber(),
    },
  };
}

export async function getPaymentReceipt(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        include: {
          feeStructure: true,
          student: {
            include: {
              user: { select: { fullName: true, email: true, phone: true } },
              class: true,
              section: true,
            },
          },
        },
      },
      receivedByUser: { select: { fullName: true, email: true } },
    },
  });
  if (!payment) throw new FinanceValidationError(`Payment ${paymentId} not found`);
  return payment;
}

export async function getFinancialSummaryReport() {
  const [invoices, payments, waivers, fundingCategories] = await Promise.all([
    prisma.feeInvoice.findMany({ include: { student: { include: { fundingCategory: true } } } }),
    prisma.payment.findMany(),
    prisma.feeWaiver.findMany(),
    prisma.fundingCategory.findMany(),
  ]);

  let totalBilled = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  let totalWaived = new Prisma.Decimal(0);

  let fundedBilled = new Prisma.Decimal(0);
  let fundedPaid = new Prisma.Decimal(0);
  let fundedWaived = new Prisma.Decimal(0);

  let privateBilled = new Prisma.Decimal(0);
  let privatePaid = new Prisma.Decimal(0);
  let privateWaived = new Prisma.Decimal(0);

  for (const inv of invoices) {
    totalBilled = totalBilled.add(inv.amountDue);
    const isFunded = Boolean(inv.student.fundingCategoryId);
    if (isFunded) {
      fundedBilled = fundedBilled.add(inv.amountDue);
    } else {
      privateBilled = privateBilled.add(inv.amountDue);
    }
  }

  for (const p of payments) {
    totalPaid = totalPaid.add(p.amount);
  }

  for (const w of waivers) {
    totalWaived = totalWaived.add(w.amount);
  }

  return {
    overall: {
      totalBilled: totalBilled.toNumber(),
      totalPaid: totalPaid.toNumber(),
      totalWaived: totalWaived.toNumber(),
      outstanding: totalBilled.sub(totalPaid).sub(totalWaived).toNumber(),
    },
    breakdown: {
      fundedBilled: fundedBilled.toNumber(),
      privateBilled: privateBilled.toNumber(),
    },
    fundingCategories,
  };
}
