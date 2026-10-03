import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    feeStructure: { create: vi.fn(), findUnique: vi.fn() },
    feeInvoice: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    payment: { create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb({
        feeInvoice: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
        payment: { create: vi.fn(), findMany: vi.fn() },
        auditLog: { create: vi.fn() },
      })
    ),
  },
}));

import { prisma } from "../../../db/client.js";
import { recordPayment, createFeeStructure, FinanceValidationError } from "../finance.service.js";

describe("Finance Hardening and Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("REJECTS non-positive fee structure amounts", async () => {
    await expect(
      createFeeStructure({ classId: "c-1", academicYearId: "ay-1", name: "Tuition", amount: -100 })
    ).rejects.toThrow(FinanceValidationError);
  });

  it("REJECTS zero or negative payment amounts", async () => {
    await expect(
      recordPayment({ invoiceId: "inv-1", amount: 0, method: "cash", receivedByUserId: "u-1" })
    ).rejects.toThrow(FinanceValidationError);
  });

  it("REJECTS payments on waived invoices", async () => {
    const mockTx = {
      feeInvoice: { findUnique: vi.fn().mockResolvedValue({ id: "inv-1", status: "waived", amountDue: 1000 }) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    await expect(
      recordPayment({ invoiceId: "inv-1", amount: 100, method: "cash", receivedByUserId: "u-1" })
    ).rejects.toThrow(FinanceValidationError);
  });

  it("REJECTS overpayment attempts exceeding remaining invoice balance", async () => {
    const mockTx = {
      feeInvoice: { findUnique: vi.fn().mockResolvedValue({ id: "inv-1", status: "pending", amountDue: 500 }) },
      payment: { findMany: vi.fn().mockResolvedValue([{ amount: 400 }]) }, // $100 remaining
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    await expect(
      recordPayment({ invoiceId: "inv-1", amount: 200, method: "cash", receivedByUserId: "u-1" })
    ).rejects.toThrow(FinanceValidationError);
  });

  it("RECORDS valid payment cleanly and updates invoice status to paid when balance is settled", async () => {
    const mockPaymentCreate = vi.fn().mockResolvedValue({ id: "pay-1", amount: 100 });
    const mockInvoiceUpdate = vi.fn().mockResolvedValue({});
    const mockAuditCreate = vi.fn().mockResolvedValue({});

    const mockTx = {
      feeInvoice: {
        findUnique: vi.fn().mockResolvedValue({ id: "inv-1", status: "pending", amountDue: 500 }),
        update: mockInvoiceUpdate,
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([{ amount: 400 }]),
        create: mockPaymentCreate,
      },
      auditLog: { create: mockAuditCreate },
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    const result = await recordPayment({ invoiceId: "inv-1", amount: 100, method: "cash", receivedByUserId: "u-1" });

    expect(result).toHaveProperty("id", "pay-1");
    expect(mockInvoiceUpdate).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "paid" } });
    expect(mockAuditCreate).toHaveBeenCalled();
  });
});
