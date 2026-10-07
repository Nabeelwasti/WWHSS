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

  if (input.sectionId) {
    const section = await prisma.section.findUnique({ where: { id: input.sectionId } });
    if (!section) throw new AiAssessmentError(`Section ${input.sectionId} not found`);
    if (section.classId !== input.classId) throw new AiAssessmentError("The selected section does not belong to the selected class");
  }
  if (!Number.isFinite(input.totalMarks) || input.totalMarks <= 0 || input.totalMarks > 10000) {
    throw new AiAssessmentError("Total marks must be greater than zero and no more than 10,000");
  }

  return prisma.$transaction(async (tx) => {
    const test = await tx.aiAssessmentTest.create({
      data: {
        title: input.title.trim(),
        classId: input.classId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        topic: input.topic.trim(),
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

function parseAndValidateGeneratedQuestions(responseText: string, expectedCount: number, totalMarks: Prisma.Decimal): QuestionDefinitionInput[] {
  let parsed: unknown;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
  } catch {
    throw new AiAssessmentError("AI returned invalid JSON. No assessment questions were created.");
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new AiAssessmentError(`AI returned ${Array.isArray(parsed) ? parsed.length : 0} questions; exactly ${expectedCount} are required.`);
  }

  const allowedTypes = new Set(["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY", "NUMERIC"]);
  const questions = parsed.map((raw, idx) => {
    if (!raw || typeof raw !== "object") throw new AiAssessmentError(`Question ${idx + 1} is not a valid object.`);
    const q = raw as Record<string, unknown>;
    const questionType = q.questionType;
    const questionText = q.questionText;
    const correctAnswer = q.correctAnswer;
    const marks = q.marks;
    const orderIndex = q.orderIndex;
    if (typeof questionType !== "string" || !allowedTypes.has(questionType)) throw new AiAssessmentError(`Question ${idx + 1} has an unsupported question type.`);
    if (typeof questionText !== "string" || questionText.trim().length < 3 || questionText.length > 5000) throw new AiAssessmentError(`Question ${idx + 1} has invalid question text.`);
    if (typeof correctAnswer !== "string" || !correctAnswer.trim() || correctAnswer.length > 2000) throw new AiAssessmentError(`Question ${idx + 1} has an invalid correct answer.`);
    if (typeof marks !== "number" || !Number.isFinite(marks) || marks <= 0 || marks > 1000) throw new AiAssessmentError(`Question ${idx + 1} has invalid marks.`);
    if (typeof orderIndex !== "number" || !Number.isInteger(orderIndex) || orderIndex !== idx + 1) throw new AiAssessmentError("Question orderIndex values must be consecutive starting at 1.");

    const options = Array.isArray(q.optionsJson) ? q.optionsJson : [];
    if (questionType === "MCQ") {
      if (options.length < 2 || options.length > 6 || options.some((o) => typeof o !== "string" || !o.trim())) throw new AiAssessmentError(`MCQ question ${idx + 1} must have 2 to 6 non-empty options.`);
      const normalized = options.map((o) => String(o).trim().toLowerCase());
      if (new Set(normalized).size !== normalized.length) throw new AiAssessmentError(`MCQ question ${idx + 1} contains duplicate options.`);
      if (!normalized.includes(correctAnswer.trim().toLowerCase())) throw new AiAssessmentError(`MCQ question ${idx + 1} has a correct answer that is not one of its options.`);
    } else if (questionType === "TRUE_FALSE") {
      if (!["true", "false"].includes(correctAnswer.trim().toLowerCase())) throw new AiAssessmentError(`TRUE_FALSE question ${idx + 1} must have true or false as its correct answer.`);
    } else if (options.length > 0) {
      throw new AiAssessmentError(`Question ${idx + 1} of type ${questionType} must not contain MCQ options.`);
    }
    return {
      version: typeof q.version === "string" && q.version.trim() ? q.version.trim() : "A",
      questionType: questionType as QuestionDefinitionInput["questionType"],
      questionText: questionText.trim(),
      questionTextUrdu: typeof q.questionTextUrdu === "string" ? q.questionTextUrdu.trim() : undefined,
      optionsJson: options.map(String),
      correctAnswer: correctAnswer.trim(),
      markingScheme: typeof q.markingScheme === "string" ? q.markingScheme.trim() : undefined,
      marks,
      orderIndex,
    };
  });
  const total = questions.reduce((sum, q) => sum + q.marks, 0);
  if (Math.abs(total - totalMarks.toNumber()) > 0.001) throw new AiAssessmentError(`Generated question marks total ${total}, but the assessment requires ${totalMarks.toNumber()}.`);
  return questions;
}

export async function generateTestQuestionsWithAi(testId: string, numQuestions = 5, createdByUserId: string) {
  if (!Number.isInteger(numQuestions) || numQuestions < 1 || numQuestions > 50) throw new AiAssessmentError("Question count must be an integer between 1 and 50.");
  const test = await prisma.aiAssessmentTest.findUnique({ where: { id: testId }, include: { class: true, subject: true } });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);

  const prompt = `Generate exactly ${numQuestions} assessment questions for Class "${test.class.name}", Subject "${test.subject.name}", Topic "${test.topic}", Difficulty "${test.difficulty}", Language "${test.language}". Total marks MUST equal exactly ${test.totalMarks.toString()}.
Return ONLY a JSON array. Each object MUST contain version, questionType, questionText, optionsJson, correctAnswer, markingScheme, marks, orderIndex.
Allowed types: MCQ, TRUE_FALSE, SHORT_ANSWER, ESSAY, NUMERIC. MCQ needs 2-6 unique options with correctAnswer matching one option. TRUE_FALSE correctAnswer must be true or false. Other types must use optionsJson: []. orderIndex must be consecutive starting at 1. Do not return markdown, commentary, placeholders, sample questions, or invented metadata.`;

  let lastError = "Unknown AI generation error";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const responseText = await askCampusAI(createdByUserId, attempt === 1 ? prompt : `${prompt}\nPrevious output failed validation because: ${lastError}\nReturn a corrected JSON array only.`);
      try {
        const questionsParsed = parseAndValidateGeneratedQuestions(responseText, numQuestions, test.totalMarks);
        return prisma.$transaction(async (tx) => {
          await tx.aiAssessmentQuestion.deleteMany({ where: { testId } });
          await Promise.all(questionsParsed.map((q) => tx.aiAssessmentQuestion.create({
            data: {
              testId,
              version: q.version || "A",
              questionType: q.questionType,
              questionText: q.questionText,
              questionTextUrdu: q.questionTextUrdu,
              optionsJson: q.optionsJson ?? Prisma.JsonNull,
              correctAnswer: q.correctAnswer,
              markingScheme: q.markingScheme,
              marks: new Prisma.Decimal(q.marks),
              orderIndex: q.orderIndex!,
            },
          })));
          await tx.aiAssessmentTest.update({ where: { id: testId }, data: { status: "GENERATED" } });
          return tx.aiAssessmentTest.findUnique({ where: { id: testId }, include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } } });
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new AiAssessmentError(`AI generation failed validation after 2 attempts: ${lastError}`);
}

export async function approveAiAssessmentTest(testId: string, actorId: string) {
  const test = await prisma.aiAssessmentTest.findUnique({ where: { id: testId }, include: { questions: true } });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);
  if (test.status === "APPROVED") return test;
  if (test.questions.length === 0) throw new AiAssessmentError("An assessment cannot be approved without questions.");
  const totalQuestionMarks = test.questions.reduce((sum, q) => sum + q.marks.toNumber(), 0);
  if (Math.abs(totalQuestionMarks - test.totalMarks.toNumber()) > 0.001) throw new AiAssessmentError("Question marks do not equal the assessment total marks.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiAssessmentTest.update({
      where: { id: testId },
      data: { status: "APPROVED" },
      include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } },
    });
    await tx.auditLog.create({ data: { userId: actorId, action: "ai_assessment:approve_test", resource: `test:${testId}` } });
    return updated;
  });
}

export async function publishAiAssessmentTest(testId: string, actorId: string) {
  const test = await prisma.aiAssessmentTest.findUnique({ where: { id: testId }, include: { questions: true } });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);
  if (test.status === "PUBLISHED") return test;
  if (test.status !== "APPROVED") throw new AiAssessmentError("Only an approved assessment can be published.");
  if (!test.questions.length) throw new AiAssessmentError("An assessment cannot be published without questions.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiAssessmentTest.update({ where: { id: testId }, data: { status: "PUBLISHED" }, include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } } });
    await tx.auditLog.create({ data: { userId: actorId, action: "ai_assessment:publish_test", resource: `test:${testId}` } });
    return updated;
  });
}

export async function lockAiAssessmentTest(testId: string, actorId: string) {
  const test = await prisma.aiAssessmentTest.findUnique({ where: { id: testId } });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);
  if (test.status === "LOCKED") return test;
  if (test.status !== "PUBLISHED") throw new AiAssessmentError("Only a published assessment can be locked.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiAssessmentTest.update({ where: { id: testId }, data: { status: "LOCKED" }, include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } } });
    await tx.auditLog.create({ data: { userId: actorId, action: "ai_assessment:lock_test", resource: `test:${testId}` } });
    return updated;
  });
}

export async function getAiAssessmentAnswerKey(testId: string) {
  const test = await prisma.aiAssessmentTest.findUnique({ where: { id: testId }, include: { class: true, subject: true, questions: { orderBy: { orderIndex: "asc" } } } });
  if (!test) throw new AiAssessmentError(`Assessment Test ${testId} not found`);
  if (!["APPROVED", "PUBLISHED", "LOCKED"].includes(test.status)) throw new AiAssessmentError("The answer key is only available after teacher approval.");
  return {
    id: test.id, title: test.title, class: test.class.name, subject: test.subject.name, totalMarks: test.totalMarks.toNumber(),
    durationMin: test.durationMin, language: test.language, status: test.status,
    questions: test.questions.map((q) => ({ id: q.id, version: q.version, orderIndex: q.orderIndex, questionType: q.questionType, correctAnswer: q.correctAnswer, markingScheme: q.markingScheme, marks: q.marks.toNumber() })),
  };
}

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

  if (!["APPROVED", "PUBLISHED"].includes(test.status)) throw new AiAssessmentError("Only an approved or published assessment can accept answer sheets.");
  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentProfileId }, select: { id: true, userId: true, classId: true, sectionId: true } });
  if (!student) throw new AiAssessmentError(`Student ${input.studentProfileId} not found`);
  if (student.classId !== test.classId || (test.sectionId && student.sectionId !== test.sectionId)) throw new AiAssessmentError("The student is not enrolled in this assessment's class/section.");
  for (const questionId of Object.keys(input.studentAnswers)) {
    if (!test.questions.some((q) => q.id === questionId)) throw new AiAssessmentError(`Answer supplied for unknown question ${questionId}.`);
  }

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
        finalScore: null,
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
  const sheet = await prisma.aiAnswerSheet.findUnique({ where: { id: sheetId }, include: { test: true } });
  if (!sheet) throw new AiAssessmentError(`Answer sheet ${sheetId} not found`);
  if (input.finalScore > sheet.test.totalMarks.toNumber()) throw new AiAssessmentError(`Final score cannot exceed the assessment total of ${sheet.test.totalMarks.toNumber()}.`);

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
