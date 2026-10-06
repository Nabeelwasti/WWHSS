import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
import {
  listClassesWithSections,
  listSubjects,
  getMyScopedClasses,
  listStudentsInSection,
  createAcademicYear,
  createClass,
  createSection,
  createSubject,
  enrollStudent,
  linkGuardian,
  getStudentEnrollmentHistory,
  changeStudentPlacement,
  AcademicsValidationError,
} from "./academics.service.js";

export const academicsRouter = Router();
academicsRouter.use(authenticate);

// ---------- READS ----------

academicsRouter.get("/classes", authorize("academics:view"), async (_req, res) => {
  res.json({ classes: await listClassesWithSections() });
});

academicsRouter.get("/subjects", authorize("academics:view"), async (_req, res) => {
  res.json({ subjects: await listSubjects() });
});

academicsRouter.get("/academic-years", authorize("academics:view"), async (_req, res) => {
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  res.json({ academicYears: years });
});

// A teacher's real roster for a section they're about to mark attendance
// for — scoped the same way marking itself is. The section's real classId
// is resolved first so both dimensions of scope are checked (a teacher
// scoped by classId only, with no sectionId on their role, would otherwise
// pass a section-only check for ANY section under that class — resolving
// classId here closes that gap rather than leaving it to be found later).
academicsRouter.get(
  "/sections/:sectionId/students",
  authorize("attendance:mark", async (req) => {
    const section = await prisma.section.findUnique({
      where: { id: req.params.sectionId },
      select: { classId: true },
    });
    return { classId: section?.classId, sectionId: req.params.sectionId };
  }),
  async (req, res) => {
    res.json({ students: await listStudentsInSection(req.params.sectionId) });
  }
);

academicsRouter.get("/my-classes", authenticate, async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const classes = await getMyScopedClasses(req.userId);
  res.json({ classes, scopeIsSchoolWide: classes === null });
});

// ---------- WRITES (require "academics:manage", school-wide by design —
// restructuring the school itself isn't something any scoped role should
// do, only Admin/Principal) ----------

const yearSchema = z.object({
  label: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
});
academicsRouter.post("/academic-years", authorize("academics:manage"), async (req, res) => {
  const parsed = yearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createAcademicYear(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const classSchema = z.object({ name: z.string().min(1), academicYearId: z.string().uuid() });
academicsRouter.post("/classes", authorize("academics:manage"), async (req, res) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createClass(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const sectionSchema = z.object({ name: z.string().min(1), classId: z.string().uuid() });
academicsRouter.post("/sections", authorize("academics:manage"), async (req, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createSection(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const subjectSchema = z.object({ name: z.string().min(1), code: z.string().optional() });
academicsRouter.post("/subjects", authorize("academics:manage"), async (req, res) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await createSubject(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

const enrollSchema = z.object({
  userId: z.string().uuid(),
  admissionNo: z.string().min(1),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  rollNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  admissionDate: z.string().optional(),
});
// Enrollment touches real student records, so it needs the same permission
// as viewing a full student profile — not just generic academics:manage.
academicsRouter.post("/enroll", authorize("student:view:full_profile"), async (req, res) => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await enrollStudent(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

academicsRouter.get("/students/:studentProfileId/enrollment-history", authorize("student:view:full_profile"), async (req, res) => {
  res.json({ history: await getStudentEnrollmentHistory(req.params.studentProfileId) });
});

const placementSchema = z.object({ studentProfileId: z.string().uuid(), classId: z.string().uuid(), sectionId: z.string().uuid().optional(), academicYearId: z.string().uuid(), startDate: z.string(), reason: z.string().optional(), status: z.string().optional() });
academicsRouter.post("/students/placement", authorize("student:view:full_profile"), async (req, res) => {
  const parsed = placementSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try { res.status(201).json(await changeStudentPlacement(parsed.data, req.userId)); } catch (e) { if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message }); throw e; }
});

const guardianSchema = z.object({
  parentUserId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
  relation: z.string().min(1),
});
academicsRouter.post("/link-guardian", authorize("student:view:full_profile"), async (req, res) => {
  const parsed = guardianSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await linkGuardian(parsed.data, req.userId));
  } catch (e) {
    if (e instanceof AcademicsValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});
