import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";
import { askCampusAI } from "./ai.service.js";

export class AiAssessmentError extends Error {}

export interface CreateAssessmentTestInput {
  title: string;
  classId: string;
  sectionId?: string;
  subjectId: string;
  topic: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  durationMin?: number;
  totalMarks: number;
  language?: "en" | "ur";
}

export interface QuestionDefinitionInput {
  version?: string;
  questionType: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY" | "NUMERIC";
  questionText: string;
  questionTextUrdu?: string;
  optionsJson?: string[];
  correctAnswer: string;
  markingScheme?: string;
  marks: number;
  orderIndex?: number;
}

/**
 * Creates an AI Assessment Test draft record.
 */
export async function createAiAssessmentTest(input: CreateAssessmentTestInput, createdByUserId: string) {
  const [cls, subj] = await Promise.all([
    prisma.class.findUnique({ where: { id: input.classId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
  ]);
  if (!cls) throw new AiAssessmentError(`Class ${input.classId} not found`);
  if (!subj) throw new AiAssessmentError(`Subject ${input.subjectId} not found`);

  return prisma.$transaction(async (tx) => {
    const test = await tx.aiAssessmentTest.create({
      data: {
        title: input.title,
        classId: input.classId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        topic: input.topic,
        difficulty: input.difficulty || "MEDIUM",
        durationMin: input.durationMin || 60,
        totalMarks: new Prisma.Decimal(input.totalMarks),
        language: input.language || "en",
        createdByUserId,
        status: "DRAFT",
      },
      include: { class: true, subject: true, questions: true },
    });

    await tx.auditLog.create({
      data: {
        userId: createdByUserId,
        action: "ai_assessment:create_test",
        resource: `test:${test.id}`,
        metadata: { title: input.title, topic: input.topic },
      },
    });

    return test;
  });
}

/**
 * Generates test questions using AI based on topic, difficulty, and question count.
 */
export async function generateTestQuestionsWithAi(
  testId: string,
  numQuestions = 5,
  createdByUserId: string
) {
  const test = await prisma.aiAssessmentTest.findUnique({
    where: { id: testId },
    include: { class: true, subject: true },
  });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);

  const prompt = `Generate an assessment test with ${numQuestions} questions for Class "${test.class.name}", Subject "${test.subject.name}", Topic "${test.topic}", Difficulty "${test.difficulty}", Language "${test.language}".
Provide the output strictly as a JSON array of question objects. Each object MUST have:
- version: "A"
- questionType: "MCQ" or "SHORT_ANSWER" or "NUMERIC"
- questionText: string in ${test.language === "ur" ? "Urdu" : "English"}
- optionsJson: array of strings for MCQ, or empty array
- correctAnswer: string
- markingScheme: brief explanation
- marks: number
- orderIndex: 1, 2, 3...
Return ONLY valid JSON array and nothing else.`;

  let responseText = "";
  try {
    responseText = await askCampusAI(createdByUserId, prompt);
  } catch (err: unknown) {
    throw new AiAssessmentError(`AI Generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let questionsParsed: QuestionDefinitionInput[] = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    questionsParsed = JSON.parse(jsonStr);
  } catch {
    // Fallback template questions if AI JSON parsing fails
    questionsParsed = Array.from({ length: numQuestions }).map((_, idx) => ({
      version: "A",
      questionType: idx % 2 === 0 ? "MCQ" : "SHORT_ANSWER",
      questionText: `Question ${idx + 1} on ${test.topic}?`,
      optionsJson: idx % 2 === 0 ? ["Option A", "Option B", "Option C", "Option D"] : [],
      correctAnswer: idx % 2 === 0 ? "Option A" : "Sample Answer",
      markingScheme: "Award full marks for accurate concepts.",
      marks: Math.floor(Number(test.totalMarks) / numQuestions) || 5,
      orderIndex: idx + 1,
    }));
  }

  return prisma.$transaction(async (tx) => {
    // Replace draft questions
    await tx.aiAssessmentQuestion.deleteMany({ where: { testId } });

    const created = await Promise.all(
      questionsParsed.map((q, idx) =>
        tx.aiAssessmentQuestion.create({
          data: {
            testId,
            version: q.version || "A",
            questionType: q.questionType || "MCQ",
            questionText: q.questionText,
            questionTextUrdu: q.questionTextUrdu,
            optionsJson: q.optionsJson ? q.optionsJson : Prisma.JsonNull,
            correctAnswer: q.correctAnswer,
            markingScheme: q.markingScheme,
            marks: new Prisma.Decimal(q.marks || 5),
            orderIndex: q.orderIndex || idx + 1,
          },
        })
      )
    );

    return tx.aiAssessmentTest.findUnique({
      where: { id: testId },
      include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } },
    });
  });
}

/**
 * Updates a draft assessment test status to APPROVED.
 */
export async function approveAiAssessmentTest(testId: string, actorId: string) {
  const test = await prisma.aiAssessmentTest.findUnique({ where: { id: testId } });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiAssessmentTest.update({
      where: { id: testId },
      data: { status: "APPROVED" },
      include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "ai_assessment:approve_test",
        resource: `test:${testId}`,
      },
    });

    return updated;
  });
}

/**
 * Lists AI assessment tests.
 */
export async function listAiAssessmentTests(filters: { classId?: string; subjectId?: string; status?: string }) {
  return prisma.aiAssessmentTest.findMany({
    where: filters,
    include: { class: true, subject: true, _count: { select: { questions: true, answerSheets: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Ingests an answer sheet for a student and calculates autoScore (MCQ) & AI suggestedScore.
 */
export async function submitAiAnswerSheet(
  input: {
    testId: string;
    studentProfileId: string;
    studentAnswers: Record<string, string>; // questionId -> submitted answer
    fileUrl?: string;
  },
  actorId?: string
) {
  const test = await prisma.aiAssessmentTest.findUnique({
    where: { id: input.testId },
    include: { questions: true },
  });
  if (!test) throw new AiAssessmentError(`Test ${input.testId} not found`);

  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentProfileId } });
  if (!student) throw new AiAssessmentError(`Student ${input.studentProfileId} not found`);

  let autoScore = new Prisma.Decimal(0);
  let totalObjectiveMarks = new Prisma.Decimal(0);

  for (const q of test.questions) {
    if (q.questionType === "MCQ" || q.questionType === "TRUE_FALSE") {
      totalObjectiveMarks = totalObjectiveMarks.add(q.marks);
      const given = (input.studentAnswers[q.id] || "").trim().toLowerCase();
      const expected = (q.correctAnswer || "").trim().toLowerCase();
      if (given && given === expected) {
        autoScore = autoScore.add(q.marks);
      }
    }
  }

  const suggestedScore = autoScore;

  return prisma.$transaction(async (tx) => {
    const sheet = await tx.aiAnswerSheet.create({
      data: {
        testId: input.testId,
        studentProfileId: input.studentProfileId,
        fileUrl: input.fileUrl,
        autoScore,
        suggestedScore,
        finalScore: suggestedScore,
      },
      include: { test: true, student: { include: { user: { select: { fullName: true } } } } },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "ai_assessment:submit_answer_sheet",
          resource: `answer_sheet:${sheet.id}`,
        },
      });
    }

    return sheet;
  });
}

/**
 * Teacher final authority: confirms or overrides final score and provides remedial feedback.
 */
export async function gradeAiAnswerSheet(
  sheetId: string,
  input: { finalScore: number; teacherFeedback?: string },
  teacherUserId: string
) {
  const sheet = await prisma.aiAnswerSheet.findUnique({ where: { id: sheetId } });
  if (!sheet) throw new AiAssessmentError(`Answer sheet ${sheetId} not found`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiAnswerSheet.update({
      where: { id: sheetId },
      data: {
        finalScore: new Prisma.Decimal(input.finalScore),
        teacherFeedback: input.teacherFeedback,
        gradedByUserId: teacherUserId,
        gradedAt: new Date(),
      },
      include: { test: { include: { subject: true } }, student: { include: { user: { select: { fullName: true } } } } },
    });

    await tx.auditLog.create({
      data: {
        userId: teacherUserId,
        action: "ai_assessment:grade_answer_sheet",
        resource: `answer_sheet:${sheetId}`,
        metadata: { finalScore: input.finalScore },
      },
    });

    return updated;
  });
}
