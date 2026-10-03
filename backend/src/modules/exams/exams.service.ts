import { prisma } from "../../db/client.js";

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

// Recording results for a whole class at once — the real, common workflow
// (a teacher enters marks for their class after an exam), not one row at
// a time. Each result is upserted so re-entering a mark corrects it.
export async function recordExamResults(input: {
  examId: string;
  subjectId: string;
  results: { studentProfileId: string; marksObtained: number; maxMarks: number; grade?: string; remarks?: string }[];
}) {
  return Promise.all(
    input.results.map((r) =>
      prisma.examResult.upsert({
        where: {
          examId_studentProfileId_subjectId: {
            examId: input.examId,
            studentProfileId: r.studentProfileId,
            subjectId: input.subjectId,
          },
        },
        update: { marksObtained: r.marksObtained, maxMarks: r.maxMarks, grade: r.grade, remarks: r.remarks },
        create: {
          examId: input.examId,
          subjectId: input.subjectId,
          studentProfileId: r.studentProfileId,
          marksObtained: r.marksObtained,
          maxMarks: r.maxMarks,
          grade: r.grade,
          remarks: r.remarks,
        },
      })
    )
  );
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
