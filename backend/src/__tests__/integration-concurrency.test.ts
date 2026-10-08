import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";

function getIntegrationTestDbUrl(): string {
  const url = process.env.INTEGRATION_TEST_DB_URL;
  if (!url) {
    throw new Error(
      "INTEGRATION TEST CONFIGURATION ERROR: Integration & concurrency tests require a dedicated disposable test database specified via the INTEGRATION_TEST_DB_URL environment variable. Execution aborted."
    );
  }
  if (!url.includes("integration_test") && !url.includes("ci_wwhs_integration_test")) {
    throw new Error(
      `INTEGRATION TEST SAFETY ERROR: Target URL "${url}" does not match dedicated integration test database naming conventions (must contain 'integration_test'). Execution aborted to protect development/production databases.`
    );
  }
  return url;
}

let prisma: PrismaClient;
let recordPayment: typeof import("../modules/finance/finance.service.js").recordPayment;
let generateInvoicesForClass: typeof import("../modules/finance/finance.service.js").generateInvoicesForClass;
let createDocumentRecord: typeof import("../modules/documents/documents.service.js").createDocumentRecord;
let issueBook: typeof import("../modules/library/library.service.js").issueBook;
let createTimetableSlot: typeof import("../modules/timetable/timetable.service.js").createTimetableSlot;
let refresh: typeof import("../modules/identity/auth.service.js").refresh;
let reserveAiQuota: typeof import("../modules/ai/ai.service.js").reserveAiQuota;
let releaseAiQuota: typeof import("../modules/ai/ai.service.js").releaseAiQuota;
let verifyStudentCourseEnrollment: typeof import("../modules/lms/lms.service.js").verifyStudentCourseEnrollment;
let hashRefreshToken: typeof import("../modules/identity/tokens.js").hashRefreshToken;

describe("Real-PostgreSQL Integration & Concurrency Test Suite", () => {
  beforeAll(async () => {
    const testDbUrl = getIntegrationTestDbUrl();
    process.env.DATABASE_URL = testDbUrl;

    const dbModule = await import("../db/client.js");
    const financeModule = await import("../modules/finance/finance.service.js");
    const libraryModule = await import("../modules/library/library.service.js");
    const timetableModule = await import("../modules/timetable/timetable.service.js");
    const authModule = await import("../modules/identity/auth.service.js");
    const aiModule = await import("../modules/ai/ai.service.js");
    const tokenModule = await import("../modules/identity/tokens.js");

    prisma = dbModule.prisma;
    recordPayment = financeModule.recordPayment;
    generateInvoicesForClass = financeModule.generateInvoicesForClass;
    createDocumentRecord = (await import("../modules/documents/documents.service.js")).createDocumentRecord;
    issueBook = libraryModule.issueBook;
    createTimetableSlot = timetableModule.createTimetableSlot;
    refresh = authModule.refresh;
    reserveAiQuota = aiModule.reserveAiQuota;
    releaseAiQuota = aiModule.releaseAiQuota;
    verifyStudentCourseEnrollment = (await import("../modules/lms/lms.service.js")).verifyStudentCourseEnrollment;
    hashRefreshToken = tokenModule.hashRefreshToken;

    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("enforces active class, section, academic-year, and subject enrollment before LMS content access", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: `LMS-1791379402125`, startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30"), isActive: true },
    });
    const cls = await prisma.class.create({ data: { name: `LMS-1791379402125`, academicYearId: ay.id } });
    const section = await prisma.section.create({ data: { name: "A", classId: cls.id } });
    const subject = await prisma.subject.create({ data: { name: `LMS Subject 1791379402125` } });
    const course = await prisma.course.create({ data: { title: "Protected Course", classId: cls.id, subjectId: subject.id } });
    const user = await prisma.user.create({
      data: { email: `lms-1791379402125@school.edu`, passwordHash: "hash", fullName: "LMS Student" },
    });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `LMS-1791379402125`, classId: cls.id, sectionId: section.id, status: "ACTIVE" },
    });

    await expect(verifyStudentCourseEnrollment(student.id, course.id)).rejects.toThrow(/active enrollment record/i);

    await prisma.studentEnrollmentHistory.create({
      data: {
        studentProfileId: student.id,
        academicYearId: ay.id,
        classId: cls.id,
        sectionId: section.id,
        startDate: new Date("2026-09-01"),
      },
    });
    await expect(verifyStudentCourseEnrollment(student.id, course.id)).rejects.toThrow(/not enrolled in this course's subject/i);

    await prisma.timetableSlot.create({
      data: {
        classId: cls.id,
        sectionId: section.id,
        subjectId: subject.id,
        teacherId: user.id,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });

    await expect(verifyStudentCourseEnrollment(student.id, course.id)).resolves.toBeUndefined();

    await prisma.studentProfile.update({ where: { id: student.id }, data: { status: "WITHDRAWN" } });
    await expect(verifyStudentCourseEnrollment(student.id, course.id)).rejects.toThrow(/active class\/section enrollment/i);
  });

  it("proves concurrent finance payments cannot overpay and verifies exact payment count, amounts, invoice status and audit logs", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const cls = await prisma.class.create({ data: { name: "Grade 10-C", academicYearId: ay.id } });
    const user = await prisma.user.create({
      data: { email: `student-fin-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Fin Student" },
    });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `ADM-FIN-${Date.now()}` },
    });
    const fs = await prisma.feeStructure.create({
      data: { classId: cls.id, academicYearId: ay.id, name: "Term Fee", amount: new Prisma.Decimal("500.00") },
    });
    const invoice = await prisma.feeInvoice.create({
      data: {
        invoiceNumber: `INV-TEST-${Date.now()}`,
        feeStructureId: fs.id,
        studentProfileId: student.id,
        amountDue: new Prisma.Decimal("500.00"),
        billingPeriodStart: new Date("2026-09-01"),
        billingPeriodEnd: new Date("2026-09-30"),
        dueDate: new Date("2026-09-15"),
      },
    });

    // Fire 5 concurrent payment attempts of $200 each (Total attempted: $1000 on a $500 balance)
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        recordPayment({ invoiceId: invoice.id, amount: 200, method: "card", receivedByUserId: user.id })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly 2 payments of $200 succeed ($400 total), remaining $100 rejects subsequent $200 payment attempts
    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(3);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(2);

    const totalPaid = payments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
    expect(totalPaid.toNumber()).toBe(400);

    const updatedInvoice = await prisma.feeInvoice.findUnique({ where: { id: invoice.id } });
    expect(updatedInvoice?.status).toBe("partial");

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: user.id, action: "finance:payment", resource: `invoice:${invoice.id}` },
    });
    expect(auditLogs.length).toBe(2);
  });

  it("proves payment-intent reservation and signed webhook settlement are idempotent under concurrent delivery", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "integration-payment-webhook-secret-2026";
    const { app } = await import("../app.js");
    const { signAccessToken } = await import("../modules/identity/tokens.js");
    const { createServer } = await import("node:http");

    const permission = await prisma.permission.upsert({
      where: { key: "finance:manage" },
      update: {},
      create: { key: "finance:manage" },
    });
    const role = await prisma.role.create({ data: { key: `payment-role-${Date.now()}`, name: "Payment Integration Role" } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const user = await prisma.user.create({
      data: { email: `payment-route-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Payment Route User" },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const ay = await prisma.academicYear.create({
      data: { label: `PAY-${Date.now()}`, startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const cls = await prisma.class.create({ data: { name: `Payment Class ${Date.now()}`, academicYearId: ay.id } });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `PAY-ADM-${Date.now()}`, classId: cls.id },
    });
    const fs = await prisma.feeStructure.create({
      data: { classId: cls.id, academicYearId: ay.id, name: `Payment Fee ${Date.now()}`, amount: new Prisma.Decimal("300.00") },
    });
    const invoice = await prisma.feeInvoice.create({
      data: {
        invoiceNumber: `PAY-INV-${Date.now()}`,
        feeStructureId: fs.id,
        studentProfileId: student.id,
        amountDue: new Prisma.Decimal("300.00"),
        billingPeriodStart: new Date("2026-09-01"),
        billingPeriodEnd: new Date("2026-09-30"),
        dueDate: new Date("2026-09-30"),
      },
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Integration HTTP server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = signAccessToken({ sub: user.id, email: user.email, tokenVersion: user.tokenVersion });

    const post = async (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(baseUrl + path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
        body: JSON.stringify(body),
      });

    try {
      const intentResponses = await Promise.all([
        post("/api/payments/intents", { invoiceId: invoice.id, provider: "OTHER", amount: 200 }),
        post("/api/payments/intents", { invoiceId: invoice.id, provider: "OTHER", amount: 200 }),
      ]);
      expect(intentResponses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(intentResponses.filter((response) => response.status === 400)).toHaveLength(1);

      const firstIntentResponse = intentResponses.find((response) => response.status === 201);
      if (!firstIntentResponse) throw new Error("No payment intent was created");
      const firstIntent = (await firstIntentResponse.json() as { intent: { id: string } }).intent;

      const secondResponse = await post("/api/payments/intents", { invoiceId: invoice.id, provider: "OTHER", amount: 100 });
      expect(secondResponse.status).toBe(201);
      const secondIntent = (await secondResponse.json() as { intent: { id: string } }).intent;

      const webhook = async (intentId: string, amountStatus: string = "SUCCEEDED") => {
        const body = JSON.stringify({ intentId, status: amountStatus });
        const signature = crypto.createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET!).update(Buffer.from(body)).digest("hex");
        return post("/api/payments/webhooks/OTHER", JSON.parse(body), { "x-payment-signature": signature });
      };

      const duplicateDeliveries = await Promise.all([
        webhook(firstIntent.id),
        webhook(firstIntent.id),
      ]);
      expect(duplicateDeliveries.every((response) => response.status === 200)).toBe(true);

      const firstPayments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
      expect(firstPayments).toHaveLength(1);
      expect(firstPayments[0].paymentIntentId).toBe(firstIntent.id);

      const secondWebhook = await webhook(secondIntent.id);
      expect(secondWebhook.status).toBe(200);

      const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
      expect(payments).toHaveLength(2);
      expect(payments.map((payment) => payment.paymentIntentId).sort()).toEqual([firstIntent.id, secondIntent.id].sort());

      const settledInvoice = await prisma.feeInvoice.findUnique({ where: { id: invoice.id } });
      expect(settledInvoice?.status).toBe("paid");

      const replay = await webhook(firstIntent.id);
      expect(replay.status).toBe(200);
      expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("creates distinct recurring invoices for distinct billing periods and remains idempotent within one period", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: `Billing-1791383420328`, startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const cls = await prisma.class.create({ data: { name: `Billing-1791383420328`, academicYearId: ay.id } });
    const user = await prisma.user.create({
      data: { email: `billing-1791383420328@school.edu`, passwordHash: "hash", fullName: "Billing Student" },
    });
    await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `ADM-BILL-1791383420328`, classId: cls.id },
    });
    const fs = await prisma.feeStructure.create({
      data: { classId: cls.id, academicYearId: ay.id, name: "Monthly Tuition", amount: new Prisma.Decimal("2000.00") },
    });

    await generateInvoicesForClass(fs.id, "2026-09-10", user.id, "2026-09-01", "2026-09-30");
    await generateInvoicesForClass(fs.id, "2026-09-10", user.id, "2026-09-01", "2026-09-30");
    await generateInvoicesForClass(fs.id, "2026-10-10", user.id, "2026-10-01", "2026-10-31");

    const invoices = await prisma.feeInvoice.findMany({
      where: { feeStructureId: fs.id },
      orderBy: { billingPeriodStart: "asc" },
    });

    expect(invoices).toHaveLength(2);
    expect(invoices[0].billingPeriodStart.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(invoices[0].billingPeriodEnd.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(invoices[1].billingPeriodStart.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(invoices[1].billingPeriodEnd.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(invoices[0].invoiceNumber).not.toBe(invoices[1].invoiceNumber);
  });

  it("proves concurrent library issueBook calls allow exactly one successful issuance", async () => {
    const book = await prisma.book.create({ data: { title: "Concurrency Guide", author: "DeepMind" } });
    const copy = await prisma.bookCopy.create({ data: { bookId: book.id, barcode: `BC-${Date.now()}` } });
    const user = await prisma.user.create({
      data: { email: `reader-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Reader" },
    });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        issueBook({ bookCopyId: copy.id, userId: user.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);

    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy.id } });
    expect(updatedCopy?.available).toBe(false);
  });

  it("proves refresh-token rotation permits exactly one successful claim using production refresh() service", async () => {
    const user = await prisma.user.create({
      data: { email: `rt-user-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "RT User" },
    });
    const rawToken = `rt-raw-token-${Date.now()}-${Math.random()}`;
    const hash = hashRefreshToken(rawToken);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      },
    });

    // Concurrently exercise the production refresh() service 5 times with the exact same token
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() => refresh(rawToken))
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);

    // Assert original refresh token row is revoked exactly once
    const dbOriginalRow = await prisma.refreshToken.findFirst({ where: { tokenHash: hash } });
    expect(dbOriginalRow?.revoked).toBe(true);

    // Assert exactly ONE active replacement refresh token row exists for user
    const userTokens = await prisma.refreshToken.findMany({ where: { userId: user.id, revoked: false } });
    expect(userTokens.length).toBe(1);

    // Assert replay attempt with original token fails
    await expect(refresh(rawToken)).rejects.toThrow();
  });

  it("proves database integrity constraints independently reject inconsistent class/section/exam/subject relationships for UserRole, StudentProfile, AttendanceRecord, TimetableSlot, and ExamResult", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const classA = await prisma.class.create({ data: { name: "Class A", academicYearId: ay.id } });
    const classB = await prisma.class.create({ data: { name: "Class B", academicYearId: ay.id } });
    const sectionB1 = await prisma.section.create({ data: { name: "B1", classId: classB.id } });
    const role = await prisma.role.create({ data: { key: `role-${Date.now()}`, name: "Teacher Role" } });
    const subject = await prisma.subject.create({ data: { name: "Physics", code: `PHY-INT-${Date.now()}` } });

    const user = await prisma.user.create({
      data: { email: `integrity-user-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Integrity User" },
    });

    // 1. UserRole: Class A with Section B1 (which belongs to Class B) MUST be rejected by DB FK constraint
    await expect(
      prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          classId: classA.id,
          sectionId: sectionB1.id,
        },
      })
    ).rejects.toThrow();

    // 2. StudentProfile: Class A with Section B1 MUST be rejected by DB FK constraint
    await expect(
      prisma.studentProfile.create({
        data: {
          userId: user.id,
          admissionNo: `ADM-INT-${Date.now()}`,
          classId: classA.id,
          sectionId: sectionB1.id,
        },
      })
    ).rejects.toThrow();

    // 3. UserRole: sectionId populated without classId MUST be rejected by DB CHECK constraint
    await expect(
      prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          classId: null,
          sectionId: sectionB1.id,
        },
      })
    ).rejects.toThrow();

    // 4. StudentProfile: sectionId populated without classId MUST be rejected by DB CHECK constraint
    await expect(
      prisma.studentProfile.create({
        data: {
          userId: user.id,
          admissionNo: `ADM-NOCLASS-${Date.now()}`,
          classId: null,
          sectionId: sectionB1.id,
        },
      })
    ).rejects.toThrow();

    // 5. UserRole: NULL/NULL classId and sectionId MUST succeed (unscoped role)
    const nullRole = await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        classId: null,
        sectionId: null,
      },
    });
    expect(nullRole.id).toBeDefined();

    // 6. StudentProfile: NULL/NULL classId and sectionId MUST succeed
    const nullStudent = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        admissionNo: `ADM-NULL-${Date.now()}`,
        classId: null,
        sectionId: null,
      },
    });
    expect(nullStudent.id).toBeDefined();

    const validStudentUser = await prisma.user.create({
      data: { email: `valid-student-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Valid Student" },
    });

    const validStudent = await prisma.studentProfile.create({
      data: {
        userId: validStudentUser.id,
        admissionNo: `ADM-VALID-${Date.now()}`,
        classId: classB.id,
        sectionId: sectionB1.id,
      },
    });

    // 7. AttendanceRecord: Class A with Section B1 MUST be rejected by DB FK constraint
    await expect(
      prisma.attendanceRecord.create({
        data: {
          studentProfileId: validStudent.id,
          classId: classA.id,
          sectionId: sectionB1.id,
          date: new Date(),
          status: "present",
          markedByUserId: user.id,
        },
      })
    ).rejects.toThrow();

    // 8. TimetableSlot: Class A with Section B1 MUST be rejected by DB FK constraint
    await expect(
      prisma.timetableSlot.create({
        data: {
          classId: classA.id,
          sectionId: sectionB1.id,
          subjectId: subject.id,
          teacherId: user.id,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "10:45",
        },
      })
    ).rejects.toThrow();

    // 9. ExamResult: ExamSubject belongs to (exam, subjectA). Trying to create ExamResult with subjectB MUST be rejected
    const exam = await prisma.exam.create({
      data: { name: "Mid-Term", academicYearId: ay.id, startDate: new Date(), endDate: new Date() },
    });
    const subjectA = await prisma.subject.create({ data: { name: "Subject A", code: `SA-${Date.now()}` } });
    const subjectB = await prisma.subject.create({ data: { name: "Subject B", code: `SB-${Date.now()}` } });

    const examSubjectA = await prisma.examSubject.create({
      data: { examId: exam.id, subjectId: subjectA.id, maxMarks: new Prisma.Decimal("100.00") },
    });

    await expect(
      prisma.examResult.create({
        data: {
          examId: exam.id,
          studentProfileId: validStudent.id,
          subjectId: subjectB.id, // Mismatched subjectId with examSubjectA (which is for subjectA)
          examSubjectId: examSubjectA.id,
          marksObtained: new Prisma.Decimal("75.00"),
          maxMarks: new Prisma.Decimal("100.00"),
        },
      })
    ).rejects.toThrow();
  });

  it("proves PostgreSQL-backed AI daily quota reservation is atomic under concurrent requests", async () => {
    const user = await prisma.user.create({
      data: { email: `ai-quota-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "AI Quota User" },
    });
    const testDate = `2026-10-04-test-${Date.now()}`;

    // Fill quota up to maxDailyAiRequests - 1 so exactly 1 slot remains
    const envModule = await import("../config/env.js");
    const limit = envModule.env.maxDailyAiRequests;
    await prisma.aiUsageRecord.create({
      data: { userId: user.id, date: testDate, count: limit - 1 },
    });

    // Fire 5 concurrent quota reservation attempts when only 1 slot is remaining
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() => reserveAiQuota(user.id, testDate))
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);

    const record = await prisma.aiUsageRecord.findUnique({
      where: { userId_date: { userId: user.id, date: testDate } },
    });
    expect(record?.count).toBe(limit);

    // Verify releaseAiQuota safely decrements and restores slot without negative counts
    await releaseAiQuota(user.id, testDate);
    const releasedRecord = await prisma.aiUsageRecord.findUnique({
      where: { userId_date: { userId: user.id, date: testDate } },
    });
    expect(releasedRecord?.count).toBe(limit - 1);
  });

  it("proves AI request failure releases reserved quota exactly once and repeated releases do not produce negative quota", async () => {
    const user = await prisma.user.create({
      data: { email: `ai-fail-user-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "AI Fail User" },
    });
    const today = new Date().toISOString().slice(0, 10);

    const aiModule = await import("../modules/ai/ai.service.js");
    // askCampusAI with no provider throws AiConfigError and safely releases quota exactly once
    await expect(aiModule.askCampusAI(user.id, "Test question")).rejects.toThrow();

    const record = await prisma.aiUsageRecord.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    });
    expect(record ? record.count : 0).toBe(0);

    // Further release call does not result in negative quota
    await aiModule.releaseAiQuota(user.id, today);
    const releasedAgain = await prisma.aiUsageRecord.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    });
    expect(releasedAgain ? releasedAgain.count : 0).toBe(0);
  });

  it("proves Decimal monetary/marks calculations remain exact", async () => {
    const d1 = new Prisma.Decimal("100.50");
    const d2 = new Prisma.Decimal("33.10");
    const d3 = new Prisma.Decimal("33.20");
    const d4 = new Prisma.Decimal("34.20");

    const remainder = d1.sub(d2).sub(d3).sub(d4);
    expect(remainder.toString()).toBe("0");
    expect(remainder.equals(new Prisma.Decimal("0.00"))).toBe(true);
  });

  it("proves timetable concurrent conflicting writes are correctly prevented", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const cls = await prisma.class.create({ data: { name: "Grade 9-A", academicYearId: ay.id } });
    const section = await prisma.section.create({ data: { name: "A", classId: cls.id } });
    const subject = await prisma.subject.create({ data: { name: "Physics", code: `PHY-${Date.now()}` } });
    const teacher = await prisma.user.create({
      data: { email: `teacher-tt-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "TT Teacher" },
    });
    const room = await prisma.room.create({ data: { name: `Lab-${Date.now()}` } });

    const slotInput = {
      classId: cls.id,
      sectionId: section.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      roomId: room.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "09:45",
    };

    const results = await Promise.allSettled([
      createTimetableSlot(slotInput),
      createTimetableSlot(slotInput),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  it("proves invoice generation is idempotent for automatic funding waivers", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const cls = await prisma.class.create({ data: { name: `Funding Class ${Date.now()}`, academicYearId: ay.id } });
    const user = await prisma.user.create({
      data: { email: `funding-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Funding Student" },
    });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `ADM-FUND-${Date.now()}`, classId: cls.id },
    });
    const category = await prisma.fundingCategory.create({
      data: { name: `Welfare ${Date.now()}`, code: `WEL-${Date.now()}` },
    });
    await prisma.studentFundingRecord.create({
      data: {
        studentProfileId: student.id,
        fundingCategoryId: category.id,
        startDate: new Date("2026-09-01"),
        feePolicy: "FULLY_WAIVED",
      },
    });
    const fee = await prisma.feeStructure.create({
      data: { classId: cls.id, academicYearId: ay.id, name: "Tuition", amount: new Prisma.Decimal("1000.00") },
    });

    await generateInvoicesForClass(fee.id, "2026-10-31");
    await generateInvoicesForClass(fee.id, "2026-10-31");

    const invoice = await prisma.feeInvoice.findUnique({
      where: {
        feeStructureId_studentProfileId_billingPeriodStart_billingPeriodEnd: {
          feeStructureId: fee.id,
          studentProfileId: student.id,
          billingPeriodStart: new Date("2026-10-31"),
          billingPeriodEnd: new Date("2026-10-31"),
        },
      },
      include: { feeWaivers: true },
    });
    expect(invoice?.feeWaivers.filter((w) => w.reason.startsWith("Automatic Workers Welfare Funding Waiver (")).length).toBe(1);
    expect(invoice?.feeWaivers[0]?.amount.toString()).toBe("1000");
  });

  it("proves encrypted backup restore round-trips real relational records atomically", async () => {
    const backupModule = await import("../modules/backup/backup.service.js");
    const secret = "integration-backup-secret-2026";
    backupModule.setBackupProvider(new backupModule.MemoryBackupProvider());

    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const cls = await prisma.class.create({ data: { name: `Restore Class ${Date.now()}`, academicYearId: ay.id } });
    const section = await prisma.section.create({ data: { name: "A", classId: cls.id } });
    const role = await prisma.role.create({ data: { key: `restore-role-${Date.now()}`, name: `Restore Role ${Date.now()}` } });
    const user = await prisma.user.create({
      data: { email: `restore-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Before Restore" },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, classId: cls.id, sectionId: section.id } });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `ADM-RESTORE-${Date.now()}`, classId: cls.id, sectionId: section.id },
    });

    const backup = await backupModule.createEncryptedBackup(secret);
    await prisma.user.update({ where: { id: user.id }, data: { fullName: "Mutated After Backup" } });
    await prisma.studentProfile.delete({ where: { id: student.id } });

    const result = await backupModule.restoreFromBackup(backup.filename, secret, user.id);
    expect(result.success).toBe(true);

    const restoredUser = await prisma.user.findUnique({ where: { id: user.id } });
    const restoredStudent = await prisma.studentProfile.findUnique({ where: { id: student.id } });
    expect(restoredUser?.fullName).toBe("Before Restore");
    expect(restoredStudent?.classId).toBe(cls.id);
    expect(restoredStudent?.sectionId).toBe(section.id);
    expect(result.summary.users).toBeGreaterThanOrEqual(1);
    expect(result.summary.studentProfiles).toBeGreaterThanOrEqual(1);
  });

  it("proves official document numbering uses the persisted sequence without random IDs", async () => {
    const school = await prisma.schoolProfile.upsert({
      where: { id: "default" },
      update: { schoolName: "Integration School", address: "Test Address", phone: "000", email: "test@example.edu", currentAcademicYear: "2026-2027", documentPrefix: "TEST" },
      create: { id: "default", schoolName: "Integration School", address: "Test Address", phone: "000", email: "test@example.edu", currentAcademicYear: "2026-2027", documentPrefix: "TEST" },
    });
    const ay = await prisma.academicYear.create({
      data: { label: `2026-2027-${Date.now()}`, startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const first = await createDocumentRecord({ docType: "integration_certificate", academicYearId: ay.id });
    const second = await createDocumentRecord({ docType: "integration_certificate", academicYearId: ay.id });
    expect(first.docNumber).not.toBe(second.docNumber);
    expect(first.docNumber).toMatch(/^TEST-INTEGRATION_CERTIFICATE-/);
    expect(second.docNumber).toMatch(/^TEST-INTEGRATION_CERTIFICATE-/);
    expect(school.id).toBe("default");
  });

});
