import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../db/client.js";

export class DocumentValidationError extends Error {}
type DocumentMetadata = { [key: string]: string | number | boolean | null | DocumentMetadata | DocumentMetadata[] };
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
export function ensureUploadDirExists() { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); }

export interface DocumentHeaderInfo { schoolName: string; schoolUrduName: string; boardRegistration: string; address: string; phone: string; email: string; logoUrl?: string; }

async function getSchoolHeader(): Promise<DocumentHeaderInfo> {
  const profile = await prisma.schoolProfile.findUnique({ where: { id: "default" } });
  if (!profile) throw new DocumentValidationError("School profile is not configured. Configure it before generating official documents.");
  return { schoolName: profile.schoolName, schoolUrduName: profile.schoolUrduName || profile.schoolName, boardRegistration: profile.boardRegistration || "", address: profile.address, phone: profile.phone, email: profile.email, logoUrl: profile.logoUrl || undefined };
}

async function getAcademicYearLabel(id?: string) {
  if (id) return (await prisma.academicYear.findUnique({ where: { id }, select: { label: true } }))?.label;
  return (await prisma.schoolProfile.findUnique({ where: { id: "default" }, select: { currentAcademicYear: true } }))?.currentAcademicYear || new Date().getUTCFullYear().toString();
}

async function allocateDocumentNumber(docType: string, academicYear: string, campus = "MAIN") {
  const profile = await prisma.schoolProfile.findUnique({ where: { id: "default" }, select: { documentPrefix: true } });
  const prefix = (profile?.documentPrefix || "DOC").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "DOC";
  const normalizedType = docType.replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase().slice(0, 32) || "DOCUMENT";
  const normalizedYear = academicYear.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "CURRENT";
  const normalizedCampus = campus.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "MAIN";
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.documentSequence.findUnique({ where: { docType_academicYear_campus: { docType: normalizedType, academicYear: normalizedYear, campus: normalizedCampus } } });
    if (!existing) {
      try {
        await prisma.documentSequence.create({ data: { docType: normalizedType, academicYear: normalizedYear, campus: normalizedCampus, nextVal: 2 } });
        return `${prefix}-${normalizedType}-${normalizedYear}-000001`;
      } catch (error: unknown) { if ((error as { code?: string }).code === "P2002") continue; throw error; }
    }
    const updated = await prisma.documentSequence.update({ where: { id: existing.id }, data: { nextVal: { increment: 1 } } });
    return `${prefix}-${normalizedType}-${normalizedYear}-${String(updated.nextVal - 1).padStart(6, "0")}`;
  }
  throw new DocumentValidationError("Could not allocate a unique document number after concurrent retries.");
}

async function getOrCreateDocumentNumber(docType: string, referenceId: string, academicYearId?: string) {
  const existing = await prisma.documentRecord.findFirst({ where: { docType, referenceId }, select: { docNumber: true } });
  if (existing) return existing.docNumber;
  const academicYearLabel = await getAcademicYearLabel(academicYearId);
  if (!academicYearLabel) throw new DocumentValidationError("Academic year is required for document numbering.");
  const docNumber = await allocateDocumentNumber(docType, academicYearLabel);
  try { await prisma.documentRecord.create({ data: { docType, docNumber, referenceId, academicYearId } }); return docNumber; }
  catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      const raced = await prisma.documentRecord.findFirst({ where: { docType, referenceId }, select: { docNumber: true } });
      if (raced) return raced.docNumber;
    }
    throw error;
  }
}

export async function createDocumentRecord(input: { docType: string; referenceId?: string; studentProfileId?: string; staffProfileId?: string; academicYearId?: string; metadataJson?: DocumentMetadata }, createdByUserId?: string) {
  const academicYearLabel = await getAcademicYearLabel(input.academicYearId);
  if (!academicYearLabel) throw new DocumentValidationError("Academic year is required for document numbering.");
  const referenceId = input.referenceId || input.studentProfileId || input.staffProfileId || crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.documentRecord.findFirst({ where: { docType: input.docType, referenceId } });
    const docNumber = existing?.docNumber || await allocateDocumentNumber(input.docType, academicYearLabel);
    const doc = existing || await tx.documentRecord.create({ data: { docType: input.docType, docNumber, referenceId, studentProfileId: input.studentProfileId, staffProfileId: input.staffProfileId, academicYearId: input.academicYearId, metadataJson: input.metadataJson, createdByUserId }, include: { student: { include: { user: { select: { fullName: true, email: true } } } }, staff: { include: { user: { select: { fullName: true, email: true } } } }, academicYear: true } });
    if (createdByUserId && !existing) await tx.auditLog.create({ data: { userId: createdByUserId, action: "document:create", resource: `document:${doc.id}`, metadata: { docNumber, docType: input.docType } } });
    return doc;
  });
}

export async function listDocumentRecords(filters: { docType?: string; studentProfileId?: string; staffProfileId?: string; academicYearId?: string }) {
  return prisma.documentRecord.findMany({ where: filters, include: { student: { include: { user: { select: { fullName: true, email: true } } } }, staff: { include: { user: { select: { fullName: true, email: true } } } }, academicYear: true, createdBy: { select: { fullName: true, email: true } } }, orderBy: { createdAt: "desc" } });
}

async function getStudentOutstandingBalance(studentProfileId: string) {
  const invoices = await prisma.feeInvoice.findMany({ where: { studentProfileId }, include: { payments: { include: { adjustments: true } }, feeWaivers: true } });
  let billed = 0, paid = 0, waived = 0;
  for (const invoice of invoices) {
    if (["cancelled", "void"].includes(invoice.status)) continue;
    billed += invoice.amountDue.toNumber();
    waived += invoice.feeWaivers.reduce((s, w) => s + w.amount.toNumber(), 0);
    paid += invoice.payments.filter((p) => p.status !== "reversed").reduce((s, p) => s + Math.max(0, p.amount.toNumber() - p.adjustments.reduce((a, x) => a + x.amount.toNumber(), 0)), 0);
  }
  return { totalBilled: billed, totalPaid: paid, totalWaived: waived, outstanding: Math.max(0, billed - paid - waived) };
}

export async function generatePrintableDocumentPayload(docType: string, referenceId: string) {
  const header = await getSchoolHeader();
  const issueDate = new Date().toISOString().slice(0, 10);
  switch (docType) {
    case "result_card":
    case "report_card": {
      const student = await prisma.studentProfile.findUnique({ where: { id: referenceId }, include: { user: { select: { fullName: true, email: true } }, class: true, section: true, fundingCategory: true, examResults: { include: { exam: true, subject: true } } } });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, referenceId), issueDate, header, title: "Official Student Performance Report Card / نتیجہ کارڈ", entity: { name: student.user.fullName, admissionNo: student.admissionNo, rollNumber: student.rollNumber || "N/A", className: student.class?.name || "N/A", sectionName: student.section?.name || "N/A", fundingCategory: student.fundingCategory?.name || "Standard" }, records: student.examResults.map((r) => ({ examName: r.exam.name, subjectName: r.subject.name, marksObtained: r.marksObtained.toNumber(), maxMarks: r.maxMarks.toNumber(), grade: r.grade || "N/A", remarks: r.remarks || "" })), signatures: [{ title: "Class Teacher", name: null, status: "PENDING_SIGNATURE" }, { title: "Principal / Headmaster", name: null, status: "PENDING_SIGNATURE" }] };
    }
    case "fee_receipt": {
      const payment = await prisma.payment.findUnique({ where: { id: referenceId }, include: { invoice: { include: { feeStructure: true, student: { include: { user: { select: { fullName: true, email: true } }, class: true } } } }, receivedByUser: { select: { fullName: true } } } });
      if (!payment) throw new DocumentValidationError(`Payment ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber("fee_receipt", payment.id, payment.invoice.feeStructure.academicYearId), issueDate: payment.paidAt.toISOString().slice(0, 10), header, title: "Official Fee Payment Receipt / فيس وصولى رسيد", entity: { name: payment.invoice.student.user.fullName, admissionNo: payment.invoice.student.admissionNo, className: payment.invoice.student.class?.name || "N/A", invoiceName: payment.invoice.feeStructure.name }, records: [{ description: payment.invoice.feeStructure.name, amountPaid: payment.amount.toNumber(), paymentMethod: payment.method.toUpperCase(), receivedBy: payment.receivedByUser?.fullName || "Accounts Dept" }], signatures: [{ title: "Accounts Officer", name: payment.receivedByUser?.fullName || "Authorized Signatory" }] };
    }
    case "transfer_certificate": {
      const student = await prisma.studentProfile.findUnique({ where: { id: referenceId }, include: { user: { select: { fullName: true, email: true, phone: true } }, class: true, section: true } });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      const balance = await getStudentOutstandingBalance(student.id);
      const duesStatement = balance.outstanding === 0 ? "The student's school dues have been cleared as of the issue date." : `The student's school account has an outstanding balance of ${balance.outstanding.toFixed(2)} as of the issue date.`;
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header, title: "School Leaving / Transfer Certificate (سکول چھوڑنے کا سرٹیفکیٹ)", entity: { name: student.user.fullName, fatherName: student.fatherName || "N/A", admissionNo: student.admissionNo, registrationNo: student.registrationNo || "N/A", dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) || "N/A", admissionDate: student.admissionDate?.toISOString().slice(0, 10) || "N/A", lastClassAttended: student.class?.name || "N/A", status: student.status, withdrawalReason: student.withdrawalReason || "Personal Request" }, financialStatus: balance, statement: `This is to certify that ${student.user.fullName}, son/daughter of ${student.fatherName || "the guardian"}, was a bona fide student of this institution. ${duesStatement}`, signatures: [{ title: "Exam Incharge", name: null, status: "PENDING_SIGNATURE" }, { title: "Principal", name: null, status: "PENDING_SIGNATURE" }] };
    }
    case "fee_statement": {
      const student = await prisma.studentProfile.findUnique({ where: { id: referenceId }, include: { user: { select: { fullName: true, email: true } }, class: true, section: true, fundingCategory: true, feeInvoices: { include: { feeStructure: true, payments: { include: { adjustments: true } }, feeWaivers: true } } } });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header, title: "Student Fee Account Statement / فيس والى تفصيل", entity: { name: student.user.fullName, admissionNo: student.admissionNo, className: student.class?.name || "N/A", fundingCategory: student.fundingCategory?.name || "Standard" }, records: student.feeInvoices.map((inv) => ({ invoiceName: inv.feeStructure.name, dueDate: inv.dueDate.toISOString().slice(0, 10), amountDue: inv.amountDue.toNumber(), paid: inv.payments.filter((p) => p.status !== "reversed").reduce((s, p) => s + p.amount.toNumber() - p.adjustments.reduce((a, x) => a + x.amount.toNumber(), 0), 0), waived: inv.feeWaivers.reduce((s, w) => s + w.amount.toNumber(), 0), status: inv.status.toUpperCase() })), signatures: [{ title: "Accounts Officer", name: null, status: "PENDING_SIGNATURE" }] };
    }
    case "attendance_report": {
      const student = await prisma.studentProfile.findUnique({ where: { id: referenceId }, include: { user: { select: { fullName: true } }, class: true, section: true, attendanceRecords: { orderBy: { date: "desc" }, take: 30 } } });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header, title: "Student Attendance Log & Report / حاضرى رپورٹ", entity: { name: student.user.fullName, admissionNo: student.admissionNo, className: student.class?.name || "N/A", sectionName: student.section?.name || "N/A" }, records: student.attendanceRecords.map((a) => ({ date: a.date.toISOString().slice(0, 10), status: a.status.toUpperCase() })), signatures: [{ title: "Class Teacher", name: null, status: "PENDING_SIGNATURE" }] };
    }
    case "transcript":
    case "academic_history":
    case "progress_report": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: {
          user: { select: { fullName: true, email: true } },
          class: true,
          section: true,
          examResults: { include: { exam: true, subject: true }, orderBy: { exam: { startDate: "asc" } } },
        },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      return {
        docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header,
        title: docType === "transcript" ? "Official Academic Transcript / تعلیمی ٹرانسکرپٹ" : docType === "progress_report" ? "Academic Progress Report / تعلیمی پیش رفت رپورٹ" : "Academic History / تعلیمی تاریخ",
        entity: { name: student.user.fullName, admissionNo: student.admissionNo, registrationNo: student.registrationNo || "N/A", className: student.class?.name || "N/A", sectionName: student.section?.name || "N/A" },
        records: student.examResults.map((r) => ({ exam: r.exam.name, examStatus: r.exam.status, subject: r.subject.name, marksObtained: r.marksObtained.toNumber(), maxMarks: r.maxMarks.toNumber(), grade: r.grade || "N/A", remarks: r.remarks || "" })),
      };
    }
    case "admission_document":
    case "letter": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: { user: { select: { fullName: true, email: true, phone: true } }, class: true, section: true },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      return {
        docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header,
        title: docType === "admission_document" ? "Official Admission Record / داخلہ دستاویز" : "Official School Letter / سرکاری خط",
        entity: { name: student.user.fullName, email: student.user.email, phone: student.user.phone || "N/A", fatherName: student.fatherName || "N/A", admissionNo: student.admissionNo, registrationNo: student.registrationNo || "N/A", dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) || "N/A", admissionDate: student.admissionDate?.toISOString().slice(0, 10) || "N/A", className: student.class?.name || "N/A", sectionName: student.section?.name || "N/A", status: student.status },
        statement: `This official school record is issued for ${student.user.fullName} against admission ${student.admissionNo} on ${issueDate}.`,
        signatures: [{ title: "Principal", name: null, status: "PENDING_SIGNATURE" }],
      };
    }
    case "invoice": {
      const invoice = await prisma.feeInvoice.findUnique({
        where: { id: referenceId },
        include: { feeStructure: true, student: { include: { user: { select: { fullName: true, email: true } }, class: true, section: true } }, payments: { include: { adjustments: true } }, feeWaivers: true },
      });
      if (!invoice) throw new DocumentValidationError(`Invoice ${referenceId} not found`);
      const paid = invoice.payments.filter((p) => p.status !== "reversed").reduce((s, p) => s + p.amount.toNumber() - p.adjustments.reduce((a, x) => a + x.amount.toNumber(), 0), 0);
      const waived = invoice.feeWaivers.reduce((s, w) => s + w.amount.toNumber(), 0);
      return {
        docType, docNumber: await getOrCreateDocumentNumber("invoice", invoice.id, invoice.feeStructure.academicYearId), issueDate,
        header, title: "Official Fee Invoice / فیس انوائس",
        entity: { name: invoice.student.user.fullName, admissionNo: invoice.student.admissionNo, className: invoice.student.class?.name || "N/A", sectionName: invoice.student.section?.name || "N/A", feeStructure: invoice.feeStructure.name },
        records: [{ amountDue: invoice.amountDue.toNumber(), paid, waived, outstanding: Math.max(0, invoice.amountDue.toNumber() - paid - waived), dueDate: invoice.dueDate.toISOString().slice(0, 10), status: invoice.status }],
      };
    }
    case "funding_report":
    case "financial_summary": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: { user: { select: { fullName: true, email: true } }, class: true, fundingCategory: true },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      const balance = await getStudentOutstandingBalance(student.id);
      return {
        docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header,
        title: docType === "funding_report" ? "Student Funding / Welfare Report / فلاحی رپورٹ" : "Student Financial Summary / مالی خلاصہ",
        entity: { name: student.user.fullName, admissionNo: student.admissionNo, className: student.class?.name || "N/A", fundingCategory: student.fundingCategory?.name || "Standard" },
        financialStatus: balance,
        statement: docType === "funding_report" ? "Funding category and fee-waiver/payment state are shown from authoritative school records." : "Financial figures are calculated from invoices, waivers, payments and adjustments.",
      };
    }
    case "library_card":
    case "loan_report": {
      const student = await prisma.studentProfile.findUnique({ where: { id: referenceId }, include: { user: { select: { fullName: true, email: true } } } });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);
      const loans = await prisma.bookLoan.findMany({ where: { userId: student.userId }, include: { bookCopy: { include: { book: true } } }, orderBy: { issuedAt: "desc" } });
      return {
        docType, docNumber: await getOrCreateDocumentNumber(docType, student.id), issueDate, header,
        title: docType === "library_card" ? "Library Card / لائبریری کارڈ" : "Library Loan Report / لائبریری قرض رپورٹ",
        entity: { name: student.user.fullName, admissionNo: student.admissionNo },
        records: loans.map((loan) => ({ book: loan.bookCopy.book.title, author: loan.bookCopy.book.author, barcode: loan.bookCopy.barcode, issuedAt: loan.issuedAt.toISOString().slice(0, 10), dueAt: loan.dueAt.toISOString().slice(0, 10), returnedAt: loan.returnedAt?.toISOString().slice(0, 10) || "OPEN", fineAmount: loan.fineAmount?.toNumber() || 0 })),
      };
    }
    case "class_sheet": {
      const students = await prisma.studentProfile.findMany({ where: { classId: referenceId }, include: { user: { select: { fullName: true } }, section: true }, orderBy: { admissionNo: "asc" } });
      if (!students.length) throw new DocumentValidationError(`Class ${referenceId} has no students`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, referenceId), issueDate, header, title: "Class Student Sheet / جماعت طلبہ فہرست", records: students.map((s) => ({ name: s.user.fullName, admissionNo: s.admissionNo, rollNumber: s.rollNumber || "N/A", section: s.section?.name || "N/A", status: s.status })) };
    }
    case "teacher_timetable": {
      const slots = await prisma.timetableSlot.findMany({ where: { teacherId: referenceId }, include: { class: true, section: true, subject: true, room: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
      if (!slots.length) throw new DocumentValidationError(`Teacher ${referenceId} has no timetable slots`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, referenceId), issueDate, header, title: "Teacher Timetable / استاد ٹائم ٹیبل", records: slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, class: s.class.name, section: s.section.name, subject: s.subject.name, room: s.room?.name || "N/A" })) };
    }
    case "room_schedule": {
      const slots = await prisma.timetableSlot.findMany({ where: { roomId: referenceId }, include: { class: true, section: true, subject: true, teacher: { select: { fullName: true } } }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
      if (!slots.length) throw new DocumentValidationError(`Room ${referenceId} has no timetable slots`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, referenceId), issueDate, header, title: "Room Schedule / کمرہ شیڈول", records: slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, class: s.class.name, section: s.section.name, subject: s.subject.name, teacher: s.teacher.fullName })) };
    }
    case "exam_schedule": {
      const exam = await prisma.exam.findUnique({ where: { id: referenceId }, include: { academicYear: true, examSubjects: { include: { subject: true } } } });
      if (!exam) throw new DocumentValidationError(`Exam ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, exam.id, exam.academicYearId), issueDate, header, title: "Examination Schedule / امتحانی شیڈول", entity: { exam: exam.name, academicYear: exam.academicYear.label, status: exam.status, startDate: exam.startDate.toISOString().slice(0, 10), endDate: exam.endDate.toISOString().slice(0, 10) }, records: exam.examSubjects.map((s) => ({ subject: s.subject.name, maxMarks: s.maxMarks.toNumber() })) };
    }
    case "notice": {
      const notice = await prisma.notice.findUnique({ where: { id: referenceId }, include: { publishedByUser: { select: { fullName: true } } } });
      if (!notice) throw new DocumentValidationError(`Notice ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, notice.id), issueDate, header, title: notice.title, audience: notice.audience, content: notice.body, publishedAt: notice.publishedAt.toISOString(), publishedBy: notice.publishedByUser.fullName };
    }
    case "event_schedule": {
      const event = await prisma.eventItem.findUnique({ where: { id: referenceId } });
      if (!event) throw new DocumentValidationError(`Event ${referenceId} not found`);
      return { docType, docNumber: await getOrCreateDocumentNumber(docType, event.id), issueDate, header, title: event.title, description: event.description || "", startAt: event.startAt.toISOString(), endAt: event.endAt?.toISOString() || "", location: event.location || "N/A" };
    }
    default: throw new DocumentValidationError("Unsupported document type: " + docType);
  }
}
