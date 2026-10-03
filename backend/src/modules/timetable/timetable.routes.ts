import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createTimetableSlot,
  listTimetableForClass,
  listTimetableForTeacher,
  createRoom,
  listRooms,
  canViewClassTimetable,
  ConflictError,
} from "./timetable.service.js";

export const timetableRouter = Router();
timetableRouter.use(authenticate);

const slotSchema = z
  .object({
    classId: z.string().uuid(),
    sectionId: z.string().uuid(),
    subjectId: z.string().uuid(),
    teacherId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  // Real data-integrity check missing before this fix: nothing stopped a
  // slot with startTime after endTime (e.g. 15:00–09:00) from being saved,
  // which would also confuse the overlap math the conflict detector relies
  // on. Zero-padded "HH:MM" strings compare correctly with a plain string
  // comparison, so this needs no extra date parsing.
  .refine((data) => data.startTime < data.endTime, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });
timetableRouter.post(
  "/slots",
  authorize("timetable:manage", (req) => ({ classId: req.body?.classId, sectionId: req.body?.sectionId })),
  async (req, res) => {
    const parsed = slotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      res.status(201).json(await createTimetableSlot(parsed.data));
    } catch (e) {
      // A real, specific conflict message — not a generic 500 — so the
      // person scheduling knows exactly what collided and can fix it.
      if (e instanceof ConflictError) return res.status(409).json({ error: e.message });
      throw e;
    }
  }
);

// Deliberately NOT using the generic authorize() helper here — see the
// comment on canViewClassTimetable for why the generic scoped-permission
// check has a real gap for naturally-unscoped roles like "student".
timetableRouter.get("/class", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const { classId, sectionId } = req.query as { classId?: string; sectionId?: string };
  if (!classId || !sectionId) return res.status(400).json({ error: "classId and sectionId are required" });

  const allowed = await canViewClassTimetable(req.userId, classId, sectionId);
  if (!allowed) return res.status(403).json({ error: "Forbidden: you may only view your own class's timetable" });

  res.json({ slots: await listTimetableForClass(classId, sectionId) });
});

// A teacher's own schedule — no extra scope check needed beyond
// authentication, since this only ever returns slots where THEY are the
// assigned teacher (enforced by the query itself, not by trusting input).
timetableRouter.get("/my-schedule", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  res.json({ slots: await listTimetableForTeacher(req.userId) });
});

timetableRouter.post("/rooms", authorize("timetable:manage"), async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createRoom(parsed.data.name));
});

timetableRouter.get("/rooms", authorize("timetable:manage"), async (_req, res) => {
  res.json({ rooms: await listRooms() });
});
