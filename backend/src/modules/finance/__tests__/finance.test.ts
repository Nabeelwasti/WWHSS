import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    feeStructure: { create: vi.fn(), findUnique: vi.fn() },
    feeInvoice: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    payment: { create: vi.fn(), findMany: vi.fn() },
    feeWaiver: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb({
        feeInvoice: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
        payment: { create: vi.fn(), findMany: vi.fn() },
        feeWaiver: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { create: vi.fn() },
      })
    ),
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/client.js";
import { recordPayment, createFeeStructure, calculateOutstandingBalance, generateInvoicesForClass, FinanceValidationError } from "../finance.service.js";

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
      feeWaiver: { findMany: vi.fn().mockResolvedValue([]) },
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    await expect(
      recordPayment({ invoiceId: "inv-1", amount: 100, method: "cash", receivedByUserId: "u-1" })
    ).rejects.toThrow(FinanceValidationError);
  });

  it("REJECTS overpayment attempts exceeding remaining invoice balance", async () => {
    const mockTx = {
      feeInvoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inv-1",
          status: "pending",
          amountDue: 500,
          payments: [{ amount: 400, status: "posted" }],
          feeWaivers: [],
        }),
        update: vi.fn(),
      },
      payment: { findMany: vi.fn().mockResolvedValue([{ amount: 400, status: "posted" }]), create: vi.fn() },
      feeWaiver: { findMany: vi.fn().mockResolvedValue([]) },
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
        findUnique: vi.fn().mockResolvedValue({
          id: "inv-1",
          status: "pending",
          amountDue: 500,
          payments: [{ amount: 400, status: "posted" }],
          feeWaivers: [],
        }),
        update: mockInvoiceUpdate,
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([{ amount: 400, status: "posted" }]),
        create: mockPaymentCreate,
      },
      feeWaiver: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { create: mockAuditCreate },
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    const result = await recordPayment({ invoiceId: "inv-1", amount: 100, method: "cash", receivedByUserId: "u-1" });

    expect(result).toHaveProperty("id", "pay-1");
    expect(mockInvoiceUpdate).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "paid" } });
    expect(mockAuditCreate).toHaveBeenCalled();
  });

  it("REJECTS payments on cancelled, void, or written-off invoices", async () => {
    for (const badStatus of ["cancelled", "void", "written_off", "refunded", "draft"]) {
      const mockTx = {
        feeInvoice: { findUnique: vi.fn().mockResolvedValue({ id: "inv-1", status: badStatus, amountDue: 1000 }) },
        payment: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        feeWaiver: { findMany: vi.fn().mockResolvedValue([]) },
      };
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

      await expect(
        recordPayment({ invoiceId: "inv-1", amount: 100, method: "cash", receivedByUserId: "u-1" })
      ).rejects.toThrow(FinanceValidationError);
    }
  });

  it("calculates outstanding balances consistently across reversals and waivers", () => {
    const result = calculateOutstandingBalance(
      1000,
      [
        { amount: 300, status: "posted", adjustments: [] },
        { amount: 200, status: "reversed", adjustments: [] }, // Ignored because reversed
        { amount: 100, status: "pending", adjustments: [] }, // Not settled; must not reduce the balance
        { amount: 400, status: "posted", adjustments: [{ amount: 100 }] }, // Net 300
      ],
      [{ amount: 200 }]
    );

    // Billed: 1000. Posted: 300 + 300 = 600. Pending/reversed payments are ignored. Waived: 200. Remaining: 200.
    expect(result.amountDue.toNumber()).toBe(1000);
    expect(result.paidTotal.toNumber()).toBe(600);
    expect(result.waivedTotal.toNumber()).toBe(200);
    expect(result.remainingBalance.toNumber()).toBe(200);
    expect(result.effectiveStatus).toBe("partial");
  });

  it("calculates desiredWaivedAmount and applies automatic funding waiver during generateInvoicesForClass", async () => {
    const mockWaiverCreate = vi.fn().mockResolvedValue({ id: "w-1" });
    const mockWaiverUpdate = vi.fn().mockResolvedValue({ id: "w-1" });
    const mockWaiverDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const mockInvoiceUpsert = vi.fn().mockResolvedValue({ id: "inv-1", amountDue: 1000, status: "issued" });

    (prisma.feeStructure.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "fs-1",
      classId: "c-1",
      amount: new Prisma.Decimal(1000),
      class: {
        students: [
          {
            id: "s-1",
            status: "ACTIVE",
            fundingRecords: [
              {
                studentProfileId: "s-1",
                feePolicy: "PARTIALLY_WAIVED",
                waiverPercentage: 40,
                fundingCategoryId: "FC-WORKERS",
                startDate: new Date("2026-01-01"),
                endDate: null,
              },
            ],
          },
        ],
      },
    });

    const mockTx = {
      feeInvoice: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: mockInvoiceUpsert,
      },
      feeWaiver: {
        findMany: vi.fn().mockResolvedValue([]),
        create: mockWaiverCreate,
        update: mockWaiverUpdate,
        deleteMany: mockWaiverDeleteMany,
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    const invoices = await generateInvoicesForClass(
      "fs-1",
      "2026-11-01",
      "admin-1",
      "2026-10-01",
      "2026-10-31"
    );

    expect(invoices).toHaveLength(1);
    expect(mockWaiverCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: "inv-1",
          studentProfileId: "s-1",
          reason: "Automatic Funding Waiver [Category:FC-WORKERS] (PARTIALLY_WAIVED)",
          approvedByUserId: "admin-1",
        }),
      })
    );
  });

  it("prunes duplicate automatic waivers during invoice regeneration", async () => {
    const mockWaiverUpdate = vi.fn().mockResolvedValue({ id: "w-1" });
    const mockWaiverDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const mockInvoiceUpsert = vi.fn().mockResolvedValue({ id: "inv-1", amountDue: 1000, status: "issued" });

    (prisma.feeStructure.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "fs-1",
      classId: "c-1",
      amount: new Prisma.Decimal(1000),
      class: {
        students: [
          {
            id: "s-1",
            status: "ACTIVE",
            fundingRecords: [
              {
                studentProfileId: "s-1",
                feePolicy: "FULLY_WAIVED",
                fundingCategoryId: "FC-FULL",
                startDate: new Date("2026-01-01"),
                endDate: null,
              },
            ],
          },
        ],
      },
    });

    const mockTx = {
      feeInvoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inv-1",
          payments: [],
          feeWaivers: [
            { id: "w-1", reason: "Automatic Funding Waiver [Category:FC-FULL] (FULLY_WAIVED)", amount: 1000 },
            { id: "w-duplicate", reason: "Automatic Funding Waiver [Category:FC-FULL] (FULLY_WAIVED)", amount: 1000 },
          ],
        }),
        upsert: mockInvoiceUpsert,
      },
      feeWaiver: {
        findMany: vi.fn().mockResolvedValue([
          { id: "w-1", reason: "Automatic Funding Waiver [Category:FC-FULL] (FULLY_WAIVED)", amount: 1000 },
          { id: "w-duplicate", reason: "Automatic Funding Waiver [Category:FC-FULL] (FULLY_WAIVED)", amount: 1000 },
        ]),
        create: vi.fn(),
        update: mockWaiverUpdate,
        deleteMany: mockWaiverDeleteMany,
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce((cb) => cb(mockTx));

    await generateInvoicesForClass(
      "fs-1",
      "2026-11-01",
      "admin-1",
      "2026-10-01",
      "2026-10-31"
    );

    expect(mockWaiverUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "w-1" },
        data: expect.objectContaining({
          reason: "Automatic Funding Waiver [Category:FC-FULL] (FULLY_WAIVED)",
        }),
      })
    );
    expect(mockWaiverDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["w-duplicate"] } },
    });
  });
});
