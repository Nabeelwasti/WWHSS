import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
import {
  createExam,
  listExams,
  configureExamSubject,
  listExamSubjects,
  recordExamResults,
  getStudentExamResults,
  getClassExamResults,
  getStudentReportCard,
  ExamValidationError,
} from "./exams.service.js";

export const examsRouter = Router();
examsRouter.use(authenticate);

const examSchema = z.object({
  name: z.string().min(1),
  academicYearId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
});
examsRouter.post("/", authorize("exams:manage"), async (req, res) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createExam(parsed.data));
  } catch (e) {
    if (e instanceof ExamValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

examsRouter.get("/", authorize("academics:view"), async (req, res) => {
  const academicYearId = typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;
  res.json({ exams: await listExams(academicYearId) });
});

const configureSubjectSchema = z.object({
  examId: z.string().uuid(),
  subjectId: z.string().uuid(),
  maxMarks: z.number().positive(),
});
examsRouter.post("/subjects", authorize("exams:manage"), async (req, res) => {
  const parsed = configureSubjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await configureExamSubject(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof ExamValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

examsRouter.get("/:examId/subjects", authorize("academics:view"), async (req, res) => {
  res.json({ examSubjects: await listExamSubjects(req.params.examId) });
});

const recordSchema = z.object({
  examId: z.string().uuid(),
  subjectId: z.string().uuid(),
  results: z.array(
    z.object({
      studentProfileId: z.string().uuid(),
      marksObtained: z.number().min(0),
      maxMarks: z.number().min(1),
      grade: z.string().optional(),
      remarks: z.string().optional(),
    })
  ).min(1),
});
examsRouter.post(
  "/results",
  authorize("grades:enter", async (req) => {
    const body = req.body || {};
    const { subjectId, results } = body;
    if (!subjectId || !Array.isArray(results) || results.length === 0) return {};

    const studentIds = results
      .map((r: { studentProfileId?: string }) => r?.studentProfileId)
      .filter((id): id is string => typeof id === "string" && Boolean(id));

    if (studentIds.length === 0) return {};

    const students = await prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: { classId: true, sectionId: true },
    });

    const classIds = new Set(students.map((s) => s.classId).filter(Boolean));
    const sectionIds = new Set(students.map((s) => s.sectionId).filter(Boolean));

    const classId = classIds.size === 1 ? Array.from(classIds)[0]! : undefined;
    const sectionId = sectionIds.size === 1 ? Array.from(sectionIds)[0]! : undefined;

    return { subjectId, classId, sectionId };
  }),
  async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const saved = await recordExamResults(parsed.data, req.userId);
      res.status(201).json({ saved: saved.length });
    } catch (e) {
      if (e instanceof ExamValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }
  }
);

examsRouter.get(
  "/results/student/:studentProfileId",
  authorize("exams:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    const results = await getStudentExamResults(req.params.studentProfileId, req.query.examId as string | undefined);
    res.json({ results });
  }
);

examsRouter.get(
  "/results/student/:studentProfileId/report-card",
  authorize("exams:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    const examId = req.query.examId as string;
    if (!examId) return res.status(400).json({ error: "examId query parameter is required" });
    try {
      const reportCard = await getStudentReportCard(req.params.studentProfileId, examId);
      res.json(reportCard);
    } catch (e) {
      if (e instanceof ExamValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }
  }
);

examsRouter.get(
  "/class-results",
  authorize("grades:enter", (req) => ({
    classId: req.query.classId as string,
    sectionId: req.query.sectionId as string,
    subjectId: req.query.subjectId as string,
  })),
  async (req, res) => {
    const examId = req.query.examId as string;
    const classId = req.query.classId as string;
    if (!examId || !classId) {
      return res.status(400).json({ error: "examId and classId parameters are required" });
    }
    const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : undefined;
    const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
    const results = await getClassExamResults(examId, classId, sectionId, subjectId);
    res.json({ results });
  }
);
