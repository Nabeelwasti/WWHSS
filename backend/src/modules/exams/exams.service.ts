import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";

export class ExamValidationError extends Error {}

export async function createExam(input: { name: string; academicYearId: string; startDate: string; endDate: string }) {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ExamValidationError("Invalid start or end date format");
  }
  if (endDate < startDate) {
    throw new ExamValidationError("End date cannot be before start date");
  }
  const academicYear = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!academicYear) throw new ExamValidationError(`Academic year ${input.academicYearId} not found`);

  return prisma.exam.create({
    data: {
      name: input.name,
      academicYearId: input.academicYearId,
      startDate,
      endDate,
    },
    include: { academicYear: true },
  });
}

export async function listExams(academicYearId?: string) {
  return prisma.exam.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: { academicYear: true, examSubjects: { include: { subject: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function configureExamSubject(input: { examId: string; subjectId: string; maxMarks: number }, actorId?: string) {
  if (typeof input.maxMarks !== "number" || input.maxMarks <= 0) {
    throw new ExamValidationError("Maximum marks must be a positive number greater than zero");
  }

  const [exam, subject] = await Promise.all([
    prisma.exam.findUnique({ where: { id: input.examId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
  ]);

  if (!exam) throw new ExamValidationError(`Exam ${input.examId} not found`);
  if (!subject) throw new ExamValidationError(`Subject ${input.subjectId} not found`);

  const maxMarksDec = new Prisma.Decimal(input.maxMarks);

  return prisma.$transaction(async (tx) => {
    const examSubject = await tx.examSubject.upsert({
      where: { examId_subjectId: { examId: input.examId, subjectId: input.subjectId } },
      update: { maxMarks: maxMarksDec },
      create: { examId: input.examId, subjectId: input.subjectId, maxMarks: maxMarksDec },
      include: { exam: true, subject: true },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "exams:configure_subject",
          resource: `exam:${input.examId}:subject:${input.subjectId}`,
          metadata: { maxMarks: input.maxMarks },
        },
      });
    }

    return examSubject;
  });
}

export async function listExamSubjects(examId: string) {
  return prisma.examSubject.findMany({
    where: { examId },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });
}

export async function recordExamResults(
  input: {
    examId: string;
    subjectId: string;
    results: { studentProfileId: string; marksObtained: number; maxMarks: number; grade?: string; remarks?: string }[];
  },
  authenticatedUserId: string
) {
  if (!authenticatedUserId) {
    throw new ExamValidationError("Authenticated user identity required");
  }
  if (!Array.isArray(input.results) || input.results.length === 0) {
    throw new ExamValidationError("Batch submission requires at least one result entry");
  }

  const exam = await prisma.exam.findUnique({ where: { id: input.examId } });
  if (!exam) throw new ExamValidationError("Exam not found");

  const subject = await prisma.subject.findUnique({ where: { id: input.subjectId } });
  if (!subject) throw new ExamValidationError("Subject not found");

  const studentIds = input.results.map((r) => r.studentProfileId);
  const students = await prisma.studentProfile.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, classId: true, sectionId: true },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  let existingExamSubject = await prisma.examSubject.findUnique({
    where: { examId_subjectId: { examId: input.examId, subjectId: input.subjectId } },
  });

  const authoritativeMaxMarks = existingExamSubject
    ? existingExamSubject.maxMarks
    : input.results.length > 0
    ? new Prisma.Decimal(input.results[0].maxMarks)
    : new Prisma.Decimal(100);

  if (!existingExamSubject && input.results.length > 1) {
    const firstMax = input.results[0].maxMarks;
    for (const r of input.results) {
      if (r.maxMarks !== firstMax) {
        throw new ExamValidationError(`Inconsistent maxMarks values in batch submission for subject ${input.subjectId}`);
      }
    }
  }

  for (const r of input.results) {
    const student = studentMap.get(r.studentProfileId);
    if (!student) {
      throw new ExamValidationError(`Student profile ${r.studentProfileId} not found`);
    }
    if (!student.classId) {
      throw new ExamValidationError(`Student ${r.studentProfileId} is not enrolled in any class`);
    }
    if (typeof r.marksObtained !== "number" || typeof r.maxMarks !== "number") {
      throw new ExamValidationError("Marks must be numbers");
    }
    const marksObtainedDec = new Prisma.Decimal(r.marksObtained);
    const itemMaxDec = new Prisma.Decimal(r.maxMarks);

    if (existingExamSubject && !itemMaxDec.equals(existingExamSubject.maxMarks)) {
      throw new ExamValidationError(
        `Inconsistent maxMarks: Exam subject maxMarks is set to ${existingExamSubject.maxMarks} but received ${r.maxMarks}`
      );
    }
    if (itemMaxDec.lte(0)) {
      throw new ExamValidationError("Maximum marks must be greater than 0");
    }
    if (marksObtainedDec.lt(0) || marksObtainedDec.gt(authoritativeMaxMarks)) {
      throw new ExamValidationError(
        `Marks obtained (${r.marksObtained}) must be between 0 and maximum marks (${authoritativeMaxMarks.toString()})`
      );
    }
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId: authenticatedUserId },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });

  const isUnscopedAdmin = userRoles.some(
    (ur) =>
      !ur.classId &&
      !ur.sectionId &&
      !ur.subjectId &&
      ur.role.rolePermissions.some((rp) => rp.permission.key === "grades:enter" || rp.permission.key === "exams:manage")
  );

  if (!isUnscopedAdmin) {
    for (const r of input.results) {
      const student = studentMap.get(r.studentProfileId)!;
      const matchingRole = userRoles.find((ur) => {
        const grantsGrading = ur.role.rolePermissions.some((rp) => rp.permission.key === "grades:enter");
        if (!grantsGrading) return false;
        const classOk = !ur.classId || ur.classId === student.classId;
        const sectionOk = !ur.sectionId || ur.sectionId === student.sectionId;
        const subjectOk = !ur.subjectId || ur.subjectId === input.subjectId;
        return classOk && sectionOk && subjectOk;
      });

      if (!matchingRole) {
        throw new ExamValidationError(
          `User is not authorized to record ${subject.name} marks for student ${student.id} in class ${student.classId}`
        );
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const examSubject = await tx.examSubject.upsert({
      where: { examId_subjectId: { examId: input.examId, subjectId: input.subjectId } },
      update: { maxMarks: authoritativeMaxMarks },
      create: { examId: input.examId, subjectId: input.subjectId, maxMarks: authoritativeMaxMarks },
    });

    const upserts = await Promise.all(
      input.results.map((r) => {
        const calculatedGrade = r.grade || computePercentageGrade(r.marksObtained, Number(authoritativeMaxMarks));
        return tx.examResult.upsert({
          where: {
            examId_studentProfileId_subjectId: {
              examId: input.examId,
              studentProfileId: r.studentProfileId,
              subjectId: input.subjectId,
            },
          },
          update: {
            marksObtained: new Prisma.Decimal(r.marksObtained),
            maxMarks: authoritativeMaxMarks,
            grade: calculatedGrade,
            remarks: r.remarks,
            examSubjectId: examSubject.id,
          },
          create: {
            examId: input.examId,
            subjectId: input.subjectId,
            studentProfileId: r.studentProfileId,
            marksObtained: new Prisma.Decimal(r.marksObtained),
            maxMarks: authoritativeMaxMarks,
            grade: calculatedGrade,
            remarks: r.remarks,
            examSubjectId: examSubject.id,
          },
        });
      })
    );

    await tx.auditLog.create({
      data: {
        userId: authenticatedUserId,
        action: "exams:record_results",
        resource: `exam:${input.examId}:subject:${input.subjectId}`,
        metadata: { count: upserts.length },
      },
    });

    return upserts;
  });
}

function computePercentageGrade(obtained: number, max: number): string {
  if (!max || max <= 0) return "F";
  const pct = (obtained / max) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

export async function getStudentExamResults(studentProfileId: string, examId?: string) {
  return prisma.examResult.findMany({
    where: { studentProfileId, ...(examId ? { examId } : {}) },
    include: { exam: true, subject: true, examSubject: true },
    orderBy: { exam: { startDate: "desc" } },
  });
}

export async function getClassExamResults(examId: string, classId: string, sectionId?: string, subjectId?: string) {
  return prisma.examResult.findMany({
    where: {
      examId,
      ...(subjectId ? { subjectId } : {}),
      student: {
        classId,
        ...(sectionId ? { sectionId } : {}),
      },
    },
    include: {
      student: { include: { user: { select: { fullName: true, email: true } } } },
      subject: true,
      examSubject: true,
    },
    orderBy: [{ student: { rollNumber: "asc" } }, { subject: { name: "asc" } }],
  });
}

export async function getStudentReportCard(studentProfileId: string, examId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      class: true,
      section: true,
    },
  });
  if (!student) throw new ExamValidationError("Student not found");

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { academicYear: true },
  });
  if (!exam) throw new ExamValidationError("Exam not found");

  const results = await prisma.examResult.findMany({
    where: { studentProfileId, examId },
    include: { subject: true, examSubject: true },
    orderBy: { subject: { name: "asc" } },
  });

  let totalObtained = new Prisma.Decimal(0);
  let totalMax = new Prisma.Decimal(0);

  for (const r of results) {
    totalObtained = totalObtained.add(r.marksObtained);
    totalMax = totalMax.add(r.maxMarks);
  }

  const percentage = totalMax.gt(0) ? totalObtained.div(totalMax).mul(100).toFixed(2) : "0.00";
  const overallGrade = computePercentageGrade(Number(totalObtained), Number(totalMax));

  return {
    student,
    exam,
    results,
    summary: {
      totalObtained: totalObtained.toNumber(),
      totalMax: totalMax.toNumber(),
      percentage: Number(percentage),
      overallGrade,
    },
  };
}
