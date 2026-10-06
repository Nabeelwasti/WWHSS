import { prisma } from "../../db/client.js";

export class ParentPortalError extends Error {}

async function assertChild(parentId: string, studentProfileId: string) {
  const link = await prisma.parentStudentLink.findFirst({ where: { parentId, studentId: studentProfileId } });
  if (!link) throw new ParentPortalError("You are not authorized to access this student");
}

export async function listParentChildren(parentId: string) {
  return prisma.parentStudentLink.findMany({
    where: { parentId },
    include: { student: { include: { user: { select: { fullName: true, email: true, phone: true } }, class: true, section: true, fundingCategory: true } } },
    orderBy: { student: { user: { fullName: "asc" } } },
  });
}

export async function getParentChildDashboard(parentId: string, studentProfileId: string) {
  await assertChild(parentId, studentProfileId);
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { fullName: true, email: true, phone: true } }, class: true, section: true, fundingCategory: true },
  });
  if (!student) throw new ParentPortalError("Student not found");
  const [attendance, exams, invoices, timetable, notices, assignments, loans, notifications, documents] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { studentProfileId }, orderBy: { date: "desc" }, take: 30 }),
    prisma.examResult.findMany({ where: { studentProfileId }, include: { exam: true, subject: true }, orderBy: { exam: { startDate: "desc" } }, take: 50 }),
    prisma.feeInvoice.findMany({ where: { studentProfileId }, include: { feeStructure: true, payments: { include: { adjustments: true } }, feeWaivers: true }, orderBy: { dueDate: "desc" } }),
    prisma.timetableSlot.findMany({ where: { classId: student.classId ?? undefined, sectionId: student.sectionId ?? undefined }, include: { subject: true, teacher: { select: { fullName: true } }, room: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.notice.findMany({ where: { audience: { in: ["public", "parents"] } }, orderBy: { publishedAt: "desc" }, take: 20 }),
    prisma.assignment.findMany({
      where: { course: { classId: student.classId ?? undefined } },
      include: { course: { include: { subject: true } }, submissions: { where: { studentProfileId }, take: 1 } },
      orderBy: { dueAt: "asc" }, take: 50,
    }),
    prisma.bookLoan.findMany({
      where: { userId: student.userId },
      include: { bookCopy: { include: { book: true } } },
      orderBy: { issuedAt: "desc" }, take: 30,
    }),
    prisma.notification.findMany({ where: { userId: parentId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.documentRecord.findMany({
      where: { studentProfileId },
      orderBy: { createdAt: "desc" }, take: 50,
    }),
  ]);
  return { student, attendance, exams, invoices, timetable, notices, assignments, loans, notifications, documents };
}
