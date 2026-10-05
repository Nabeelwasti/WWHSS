import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createAiAssessmentTest,
  generateTestQuestionsWithAi,
  approveAiAssessmentTest,
  listAiAssessmentTests,
  submitAiAnswerSheet,
  gradeAiAnswerSheet,
  AiAssessmentError,
} from "./ai-assessment.service.js";

export const aiAssessmentRouter = Router();
aiAssessmentRouter.use(authenticate);

aiAssessmentRouter.get("/tests", authorize("academics:view"), async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  res.json({ tests: await listAiAssessmentTests({ classId, subjectId, status }) });
});

const createTestSchema = z.object({
  title: z.string().min(1),
  classId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  topic: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  durationMin: z.number().int().min(1).optional(),
  totalMarks: z.number().positive(),
  language: z.enum(["en", "ur"]).optional(),
});

aiAssessmentRouter.post("/tests", authorize("academics:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = createTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const test = await createAiAssessmentTest(parsed.data, req.userId);
    res.status(201).json({ test });
  } catch (e) {
    if (e instanceof AiAssessmentError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

aiAssessmentRouter.post("/tests/:testId/generate", authorize("academics:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const numQuestions = typeof req.body.numQuestions === "number" ? req.body.numQuestions : 5;

  try {
    const updated = await generateTestQuestionsWithAi(req.params.testId, numQuestions, req.userId);
    res.json({ test: updated });
  } catch (e) {
    if (e instanceof AiAssessmentError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

aiAssessmentRouter.post("/tests/:testId/approve", authorize("academics:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  try {
    const approved = await approveAiAssessmentTest(req.params.testId, req.userId);
    res.json({ test: approved });
  } catch (e) {
    if (e instanceof AiAssessmentError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const submitSheetSchema = z.object({
  testId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
  studentAnswers: z.record(z.string()),
  fileUrl: z.string().optional(),
});

aiAssessmentRouter.post("/answer-sheets", authorize("grades:enter"), async (req, res) => {
  const parsed = submitSheetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const sheet = await submitAiAnswerSheet(parsed.data, req.userId);
    res.status(201).json({ answerSheet: sheet });
  } catch (e) {
    if (e instanceof AiAssessmentError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const gradeSheetSchema = z.object({
  finalScore: z.number().min(0),
  teacherFeedback: z.string().optional(),
});

aiAssessmentRouter.post("/answer-sheets/:sheetId/grade", authorize("grades:enter"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = gradeSheetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const graded = await gradeAiAnswerSheet(req.params.sheetId, parsed.data, req.userId);
    res.json({ answerSheet: graded });
  } catch (e) {
    if (e instanceof AiAssessmentError) return res.status(400).json({ error: e.message });
    throw e;
  }
});
