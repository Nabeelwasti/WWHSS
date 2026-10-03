import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  markAttendance,
  getStudentAttendance,
  getClassAttendanceForDate,
  getStudentEngagementSummary,
  AttendanceValidationError,
} from "./attendance.service.js";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

const markSchema = z.object({
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  date: z.string(), // ISO date, e.g. "2026-09-24"
  records: z
    .array(
      z.object({
        studentProfileId: z.string().uuid(),
        status: z.enum(["present", "absent", "late", "excused"]),
      })
    )
    .min(1)
    .max(200), // a class larger than this is a mistake or an abuse, not a real roster
});

// Real, permission-checked write: only a user holding "attendance:mark"
// scoped to this exact class/section may call this successfully.
attendanceRouter.post(
  "/mark",
  authorize("attendance:mark", (req) => ({
    classId: req.body?.classId,
    sectionId: req.body?.sectionId,
  })),
  async (req, res) => {
    const parsed = markSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const saved = await markAttendance({ ...parsed.data, markedByUserId: req.userId! });
      res.status(201).json({ saved: saved.length });
    } catch (e) {
      if (e instanceof AttendanceValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }
  }
);

// A student viewing their own record, or a parent viewing a linked
// child's — resolved by the relationship checks in permissions.ts.
attendanceRouter.get(
  "/student/:studentProfileId",
  authorize("attendance:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    const records = await getStudentAttendance(req.params.studentProfileId);
    res.json({ studentProfileId: req.params.studentProfileId, records });
  }
);

// Positive-framing summary (streaks, rate) for the same self/guardian
// audience — computed from the real records above, never invented.
attendanceRouter.get(
  "/student/:studentProfileId/summary",
  authorize("attendance:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ summary: await getStudentEngagementSummary(req.params.studentProfileId) });
  }
);

const classQuerySchema = z.object({
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  date: z.string(),
});

// A class/subject teacher's whole-class view, scoped the same way marking is.
attendanceRouter.get(
  "/class",
  authorize("attendance:view:class", (req) => ({
    classId: req.query.classId as string,
    sectionId: req.query.sectionId as string,
  })),
  async (req, res) => {
    const parsed = classQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const records = await getClassAttendanceForDate(parsed.data.classId, parsed.data.sectionId, parsed.data.date);
    res.json({ records });
  }
);
