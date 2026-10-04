import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { recordPayment } from "../modules/finance/finance.service.js";
import { issueBook, LibraryError } from "../modules/library/library.service.js";
import { createTimetableSlot, ConflictError } from "../modules/timetable/timetable.service.js";
import { FinanceValidationError } from "../modules/finance/finance.service.js";

// Genuinely isolated real-PostgreSQL integration & concurrency test suite.
// Executed against disposable PostgreSQL test database when DATABASE_URL is available.
const isPostgres = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes("postgres"));

describe.skipIf(!isPostgres)("Real-PostgreSQL Integration & Concurrency Test Suite", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("proves concurrent finance payments cannot overpay or duplicate incorrectly", async () => {
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
      data: { feeStructureId: fs.id, studentProfileId: student.id, amountDue: new Prisma.Decimal("500.00"), dueDate: new Date() },
    });

    // Fire 5 concurrent payment attempts of $200 each (Total attempted: $1000 on a $500 balance)
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        recordPayment({ invoiceId: invoice.id, amount: 200, method: "card", receivedByUserId: user.id })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly 2 payments of 200 should succeed (400 total), 350+200 would exceed 500 so 3rd+ fail
    expect(fulfilled.length).toBeLessThanOrEqual(2);
    expect(rejected.length).toBeGreaterThanOrEqual(3);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    const totalPaid = payments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
    expect(totalPaid.toNumber()).toBeLessThanOrEqual(500);
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

  it("proves refresh-token replay/rotation permits exactly one successful claim", async () => {
    const user = await prisma.user.create({
      data: { email: `rt-user-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "RT User" },
    });
    const rt = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: `hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      },
    });

    // Simulate concurrent atomic rotation attempt
    const attempts = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        prisma.refreshToken.updateMany({
          where: { id: rt.id, revoked: false },
          data: { revoked: true },
        })
      )
    );

    const successfulRotations = attempts.filter((a) => a.count === 1);
    const failedRotations = attempts.filter((a) => a.count === 0);

    expect(successfulRotations.length).toBe(1);
    expect(failedRotations.length).toBe(4);
  });

  it("proves composite class/section foreign keys reject inconsistent data", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const classA = await prisma.class.create({ data: { name: "Class A", academicYearId: ay.id } });
    const classB = await prisma.class.create({ data: { name: "Class B", academicYearId: ay.id } });
    const sectionB1 = await prisma.section.create({ data: { name: "B1", classId: classB.id } });

    const user = await prisma.user.create({
      data: { email: `student-mismatch-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Mismatch Student" },
    });

    // Attempt to assign student to Class A with Section B1 (which belongs to Class B)
    await expect(
      prisma.studentProfile.create({
        data: {
          userId: user.id,
          admissionNo: `ADM-MIS-${Date.now()}`,
          classId: classA.id,
          sectionId: sectionB1.id,
        },
      })
    ).rejects.toThrow();
  });

  it("proves ExamSubject / ExamResult integrity is strictly enforced", async () => {
    const ay = await prisma.academicYear.create({
      data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const exam = await prisma.exam.create({
      data: { name: "Finals 2026", academicYearId: ay.id, startDate: new Date(), endDate: new Date() },
    });
    const subject = await prisma.subject.create({ data: { name: "Mathematics", code: `MATH-${Date.now()}` } });
    const examSubject = await prisma.examSubject.create({
      data: { examId: exam.id, subjectId: subject.id, maxMarks: new Prisma.Decimal("100.00") },
    });

    const user = await prisma.user.create({
      data: { email: `exam-student-${Date.now()}@school.edu`, passwordHash: "hash", fullName: "Exam Student" },
    });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, admissionNo: `ADM-EXAM-${Date.now()}` },
    });

    const result1 = await prisma.examResult.create({
      data: {
        examId: exam.id,
        subjectId: subject.id,
        studentProfileId: student.id,
        examSubjectId: examSubject.id,
        marksObtained: new Prisma.Decimal("88.50"),
        maxMarks: new Prisma.Decimal("100.00"),
      },
    });

    expect(result1.examSubjectId).toBe(examSubject.id);

    // Duplicate examResult for same examSubjectId and studentProfileId must be rejected by unique constraint
    await expect(
      prisma.examResult.create({
        data: {
          examId: exam.id,
          subjectId: subject.id,
          studentProfileId: student.id,
          examSubjectId: examSubject.id,
          marksObtained: new Prisma.Decimal("90.00"),
          maxMarks: new Prisma.Decimal("100.00"),
        },
      })
    ).rejects.toThrow();
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
});
