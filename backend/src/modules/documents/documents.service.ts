import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../db/client.js";

export class DocumentValidationError extends Error {}

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export function ensureUploadDirExists() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export interface DocumentHeaderInfo {
  schoolName: string;
  schoolUrduName: string;
  boardRegistration: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
}

export const DEFAULT_SCHOOL_HEADER: DocumentHeaderInfo = {
  schoolName: "Workers Welfare Higher Secondary School (WWHSS)",
  schoolUrduName: "ورکرز ویلفیئر ہائر سیکنڈری سکول",
  boardRegistration: "BISE Registered | WWHSS Digital Campus",
  address: "Workers Welfare Complex, Industrial Area, Sector 5",
  phone: "+92 51 9200000",
  email: "info@wwhss.edu.pk",
};

export async function createDocumentRecord(
  input: {
    docType: string;
    studentProfileId?: string;
    staffProfileId?: string;
    academicYearId?: string;
    metadataJson?: Record<string, any>;
  },
  createdByUserId?: string
) {
  const docNumber = `DOC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  return prisma.$transaction(async (tx) => {
    const doc = await tx.documentRecord.create({
      data: {
        docType: input.docType,
        docNumber,
        studentProfileId: input.studentProfileId,
        staffProfileId: input.staffProfileId,
        academicYearId: input.academicYearId,
        metadataJson: input.metadataJson,
        createdByUserId,
      },
      include: {
        student: { include: { user: { select: { fullName: true, email: true } } } },
        staff: { include: { user: { select: { fullName: true, email: true } } } },
        academicYear: true,
      },
    });

    if (createdByUserId) {
      await tx.auditLog.create({
        data: {
          userId: createdByUserId,
          action: "document:create",
          resource: `document:${doc.id}`,
          metadata: { docNumber, docType: input.docType },
        },
      });
    }

    return doc;
  });
}

export async function listDocumentRecords(filters: {
  docType?: string;
  studentProfileId?: string;
  staffProfileId?: string;
  academicYearId?: string;
}) {
  return prisma.documentRecord.findMany({
    where: filters,
    include: {
      student: { include: { user: { select: { fullName: true, email: true } } } },
      staff: { include: { user: { select: { fullName: true, email: true } } } },
      academicYear: true,
      createdBy: { select: { fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function generatePrintableDocumentPayload(docType: string, referenceId: string) {
  const header = DEFAULT_SCHOOL_HEADER;
  const issueDate = new Date().toISOString().slice(0, 10);
  const docNumber = `WWHSS-${docType.toUpperCase()}-${Date.now().toString().slice(-6)}`;

  switch (docType) {
    case "result_card":
    case "report_card": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: {
          user: { select: { fullName: true, email: true } },
          class: true,
          section: true,
          fundingCategory: true,
          examResults: { include: { exam: true, subject: true } },
        },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);

      return {
        docType,
        docNumber,
        issueDate,
        header,
        title: "Official Student Performance Report Card / نتيجہ کارڈ",
        entity: {
          name: student.user.fullName,
          admissionNo: student.admissionNo,
          rollNumber: student.rollNumber || "N/A",
          className: student.class?.name || "N/A",
          sectionName: student.section?.name || "N/A",
          fundingCategory: student.fundingCategory?.name || "Standard",
        },
        records: student.examResults.map((r) => ({
          examName: r.exam.name,
          subjectName: r.subject.name,
          marksObtained: r.marksObtained.toNumber(),
          maxMarks: r.maxMarks.toNumber(),
          grade: r.grade || "N/A",
          remarks: r.remarks || "",
        })),
        signatures: [
          { title: "Class Teacher", name: "____________________" },
          { title: "Principal / Headmaster", name: "____________________" },
        ],
      };
    }

    case "fee_receipt": {
      const payment = await prisma.payment.findUnique({
        where: { id: referenceId },
        include: {
          invoice: {
            include: {
              feeStructure: true,
              student: { include: { user: { select: { fullName: true, email: true } }, class: true } },
            },
          },
          receivedByUser: { select: { fullName: true } },
        },
      });
      if (!payment) throw new DocumentValidationError(`Payment ${referenceId} not found`);

      return {
        docType: "fee_receipt",
        docNumber: `RCPT-${payment.id.slice(0, 8)}`,
        issueDate: payment.paidAt.toISOString().slice(0, 10),
        header,
        title: "Official Fee Payment Receipt / فيس وصولى رسيد",
        entity: {
          name: payment.invoice.student.user.fullName,
          admissionNo: payment.invoice.student.admissionNo,
          className: payment.invoice.student.class?.name || "N/A",
          invoiceName: payment.invoice.feeStructure.name,
        },
        records: [
          {
            description: payment.invoice.feeStructure.name,
            amountPaid: payment.amount.toNumber(),
            paymentMethod: payment.method.toUpperCase(),
            receivedBy: payment.receivedByUser?.fullName || "Accounts Dept",
          },
        ],
        signatures: [
          { title: "Accounts Officer", name: payment.receivedByUser?.fullName || "Authorized Signatory" },
        ],
      };
    }

    case "transfer_certificate": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: {
          user: { select: { fullName: true, email: true, phone: true } },
          class: true,
          section: true,
        },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);

      return {
        docType: "transfer_certificate",
        docNumber: `TC-${student.id.slice(0, 8)}`,
        issueDate,
        header,
        title: "School Leaving / Transfer Certificate (سکول چھوڑنے کا سرٹیفکیٹ)",
        entity: {
          name: student.user.fullName,
          fatherName: student.fatherName || "N/A",
          admissionNo: student.admissionNo,
          registrationNo: student.registrationNo || "N/A",
          dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : "N/A",
          admissionDate: student.admissionDate ? student.admissionDate.toISOString().slice(0, 10) : "N/A",
          lastClassAttended: student.class?.name || "N/A",
          status: student.status,
          withdrawalReason: student.withdrawalReason || "Personal Request",
        },
        statement: `This is to certify that ${student.user.fullName}, son/daughter of ${student.fatherName || "the guardian"}, was a bona fide student of this institution. All school dues have been cleared.`,
        signatures: [
          { title: "Exam Incharge", name: "____________________" },
          { title: "Principal", name: "____________________" },
        ],
      };
    }

    case "fee_statement": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: {
          user: { select: { fullName: true, email: true } },
          class: true,
          section: true,
          fundingCategory: true,
          feeInvoices: { include: { feeStructure: true, payments: true, feeWaivers: true } },
        },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);

      return {
        docType: "fee_statement",
        docNumber: `STMT-${student.id.slice(0, 8)}`,
        issueDate,
        header,
        title: "Student Fee Account Statement / فيس والى تفصيل",
        entity: {
          name: student.user.fullName,
          admissionNo: student.admissionNo,
          className: student.class?.name || "N/A",
          fundingCategory: student.fundingCategory?.name || "Standard",
        },
        records: student.feeInvoices.map((inv) => ({
          invoiceName: inv.feeStructure.name,
          dueDate: inv.dueDate.toISOString().slice(0, 10),
          amountDue: inv.amountDue.toNumber(),
          paid: inv.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0),
          waived: inv.feeWaivers.reduce((sum, w) => sum + w.amount.toNumber(), 0),
          status: inv.status.toUpperCase(),
        })),
        signatures: [{ title: "Accounts Officer", name: "____________________" }],
      };
    }

    case "attendance_report": {
      const student = await prisma.studentProfile.findUnique({
        where: { id: referenceId },
        include: {
          user: { select: { fullName: true } },
          class: true,
          section: true,
          attendanceRecords: { orderBy: { date: "desc" }, take: 30 },
        },
      });
      if (!student) throw new DocumentValidationError(`Student ${referenceId} not found`);

      return {
        docType: "attendance_report",
        docNumber: `ATT-${student.id.slice(0, 8)}`,
        issueDate,
        header,
        title: "Student Attendance Log & Report / حاضرى رپورٹ",
        entity: {
          name: student.user.fullName,
          admissionNo: student.admissionNo,
          className: student.class?.name || "N/A",
          sectionName: student.section?.name || "N/A",
        },
        records: student.attendanceRecords.map((a) => ({
          date: a.date.toISOString().slice(0, 10),
          status: a.status.toUpperCase(),
        })),
        signatures: [{ title: "Class Teacher", name: "____________________" }],
      };
    }

    default: {
      return {
        docType,
        docNumber,
        issueDate,
        header,
        title: `${docType.replace(/_/g, " ").toUpperCase()} DOCUMENT`,
        entity: { id: referenceId },
        records: [],
        signatures: [{ title: "Authorized Signatory", name: "____________________" }],
      };
    }
  }
}
