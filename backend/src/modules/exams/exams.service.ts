import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";

export async function createExam(input: { name: string; academicYearId: string; startDate: string; endDate: string }) {
  return prisma.exam.create({
    data: {
      name: input.name,
      academicYearId: input.academicYearId,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    },
  });
}

export async function listExams() {
  return prisma.exam.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } });
}

export class ExamValidationError extends Error {}

// Recording results for a whole class at once — the real, common workflow
// (a teacher enters marks for their class after an exam), not one row at
// a time. Each result is upserted so re-entering a mark corrects it.
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
    const maxMarksDec = new Prisma.Decimal(r.maxMarks);

    if (maxMarksDec.lte(0)) {
      throw new ExamValidationError("Maximum marks must be greater than 0");
    }
    if (marksObtainedDec.lt(0) || marksObtainedDec.gt(maxMarksDec)) {
      throw new ExamValidationError(
        `Marks obtained (${r.marksObtained}) must be between 0 and maximum marks (${r.maxMarks})`
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
    const maxMarksForSubject = input.results.length > 0 ? new Prisma.Decimal(input.results[0].maxMarks) : new Prisma.Decimal(100);
    const examSubject = await tx.examSubject.upsert({
      where: { examId_subjectId: { examId: input.examId, subjectId: input.subjectId } },
      update: { maxMarks: maxMarksForSubject },
      create: { examId: input.examId, subjectId: input.subjectId, maxMarks: maxMarksForSubject },
    });

    const upserts = await Promise.all(
      input.results.map((r) =>
        tx.examResult.upsert({
          where: {
            examId_studentProfileId_subjectId: {
              examId: input.examId,
              studentProfileId: r.studentProfileId,
              subjectId: input.subjectId,
            },
          },
          update: {
            marksObtained: new Prisma.Decimal(r.marksObtained),
            maxMarks: new Prisma.Decimal(r.maxMarks),
            grade: r.grade,
            remarks: r.remarks,
            examSubjectId: examSubject.id,
          },
          create: {
            examId: input.examId,
            subjectId: input.subjectId,
            studentProfileId: r.studentProfileId,
            marksObtained: new Prisma.Decimal(r.marksObtained),
            maxMarks: new Prisma.Decimal(r.maxMarks),
            grade: r.grade,
            remarks: r.remarks,
            examSubjectId: examSubject.id,
          },
        })
      )
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

// A student's real report card — every subject's result for one exam,
// or empty if nothing has been entered yet (never a fabricated grade).
export async function getStudentExamResults(studentProfileId: string, examId?: string) {
  return prisma.examResult.findMany({
    where: { studentProfileId, ...(examId ? { examId } : {}) },
    include: { exam: true, subject: true },
    orderBy: { exam: { startDate: "desc" } },
  });
}
