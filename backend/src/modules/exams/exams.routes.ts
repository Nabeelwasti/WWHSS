import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
import { createExam, listExams, recordExamResults, getStudentExamResults, ExamValidationError } from "./exams.service.js";

export const examsRouter = Router();
examsRouter.use(authenticate);

// Creating the exam itself (dates, name) is a school-wide structural
// decision — Admin/Principal only, unscoped.
const examSchema = z.object({
  name: z.string().min(1),
  academicYearId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
});
examsRouter.post("/", authorize("exams:manage"), async (req, res) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createExam(parsed.data));
});

examsRouter.get("/", authorize("exams:manage"), async (_req, res) => {
  res.json({ exams: await listExams() });
});

// Recording marks reuses "grades:enter" scoped to the real subject being
// graded — the same permission and pattern LMS submissions use, so a
// teacher's authority is defined once, not redefined per module.
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
  ),
});
examsRouter.post(
  "/results",
  authorize("grades:enter", async (req) => {
    const body = req.body || {};
    const { examId, subjectId, results } = body;
    if (!examId || !subjectId) return {};

    let classId: string | undefined;
    let sectionId: string | undefined;

    if (Array.isArray(results) && results.length > 0) {
      const firstStudentId = results[0]?.studentProfileId;
      if (firstStudentId && typeof firstStudentId === "string") {
        const student = await prisma.studentProfile.findUnique({
          where: { id: firstStudentId },
          select: { classId: true, sectionId: true },
        });
        if (student) {
          classId = student.classId ?? undefined;
          sectionId = student.sectionId ?? undefined;
        }
      }
    }

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

// A student's own report card, or a parent's linked child's — same
// self/guardian relationship check used everywhere else, not a new rule.
examsRouter.get(
  "/results/student/:studentProfileId",
  authorize("exams:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    const results = await getStudentExamResults(req.params.studentProfileId, req.query.examId as string | undefined);
    res.json({ results });
  }
);
