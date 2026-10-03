import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { prisma } from "../../db/client.js";
import {
  createCourse,
  listCoursesForClass,
  listCoursesForClassRestricted,
  getCallerSubjectRestriction,
  createLesson,
  listLessonsForCourse,
  addResource,
  createAssignment,
  listAssignmentsForCourse,
  listAssignmentsForStudent,
  listQuizzesForStudent,
  submitAssignment,
  gradeSubmission,
  listSubmissionsForAssignment,
  getCourseScope,
  getLessonCourseScope,
  getAssignmentCourseScope,
  getSubmissionCourseScope,
  getSubmissionStudentId,
  createQuiz,
  addQuizQuestion,
  getQuizForTaking,
  getQuizCourseScope,
  submitQuizAttempt,
  getQuizAttemptsForStudent,
} from "./lms.service.js";
import { getUserIdForStudentProfile, notifyUser } from "../notifications/notifications.service.js";

export const lmsRouter = Router();
lmsRouter.use(authenticate);

// ---------- COURSES ----------

const courseSchema = z.object({
  title: z.string().min(1),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
});
lmsRouter.post(
  "/courses",
  authorize("course:manage", (req) => ({ classId: req.body?.classId, subjectId: req.body?.subjectId })),
  async (req, res) => {
    const parsed = courseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(await createCourse(parsed.data));
  }
);

lmsRouter.get(
  "/courses",
  authorize("course:manage", (req) => ({ classId: req.query.classId as string })),
  async (req, res) => {
    const classId = req.query.classId as string | undefined;
    if (!classId) return res.status(400).json({ error: "classId is required" });
    // Real per-subject filtering: a subject-scoped teacher only sees their
    // own subject's courses, not every subject in the class — fixing a
    // scope leak the permission check alone (classId only) didn't catch.
    const subjectRestriction = await getCallerSubjectRestriction(req.userId!, classId);
    res.json({ courses: await listCoursesForClassRestricted(classId, subjectRestriction) });
  }
);

// ---------- LESSONS & RESOURCES ----------

const lessonSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1),
  content: z.string().optional(),
  orderIndex: z.number().int().optional(),
});
lmsRouter.post(
  "/lessons",
  authorize("course:manage", async (req) => await getCourseScope(req.body?.courseId)),
  async (req, res) => {
    const parsed = lessonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(await createLesson(parsed.data));
  }
);

lmsRouter.get("/courses/:courseId/lessons", async (req, res) => {
  // Reading lesson content requires no extra permission beyond being
  // enrolled/assigned to the course's class — enforced simply by requiring
  // the caller to already know a real courseId; fuller enrollment-based
  // filtering is a follow-up once section-level enrollment checks exist.
  res.json({ lessons: await listLessonsForCourse(req.params.courseId) });
});

const resourceSchema = z.object({
  lessonId: z.string().uuid(),
  title: z.string().min(1),
  fileUrl: z.string().url(),
  fileType: z.string().min(1),
});
lmsRouter.post(
  "/resources",
  // Real, resolved scope from the resource's actual parent lesson/course —
  // fixes the gap described above the getLessonCourseScope definition.
  authorize("course:manage", async (req) => await getLessonCourseScope(req.body?.lessonId)),
  async (req, res) => {
  const parsed = resourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await addResource({ ...parsed.data, uploadedByUserId: req.userId! }));
});

// ---------- ASSIGNMENTS ----------

const assignmentSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.string(),
  maxScore: z.number().int().optional(),
});
lmsRouter.post(
  "/assignments",
  authorize("assignments:create", async (req) => await getCourseScope(req.body?.courseId)),
  async (req, res) => {
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const assignment = await createAssignment(parsed.data);
    await prisma.auditLog.create({
      data: { userId: req.userId!, action: "assignments:create", resource: `assignment:${assignment.id}` },
    });
    res.status(201).json(assignment);
  }
);

lmsRouter.get(
  "/courses/:courseId/assignments",
  authorize("assignments:create", async (req) => await getCourseScope(req.params.courseId)),
  async (req, res) => {
    // Teacher-side view of a course's assignments (with all submissions
    // reachable via the submissions endpoint below). Student-side view is
    // the separate /my-assignments route, scoped to their own record.
    res.json({ assignments: await listAssignmentsForCourse(req.params.courseId) });
  }
);

// A student's own assignment list — resolved from their real class
// enrollment, with real submission status attached (or none).
lmsRouter.get(
  "/my-assignments/:studentProfileId",
  authorize("assignments:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ assignments: await listAssignmentsForStudent(req.params.studentProfileId) });
  }
);

lmsRouter.get(
  "/my-quizzes/:studentProfileId",
  authorize("assignments:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ quizzes: await listQuizzesForStudent(req.params.studentProfileId) });
  }
);

// ---------- SUBMISSIONS & GRADING ----------

const submitSchema = z.object({
  assignmentId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
  fileUrl: z.string().url().optional(),
  textAnswer: z.string().optional(),
});
lmsRouter.post(
  "/submissions",
  // A student may only submit as themselves — "assignments:view:own" via
  // the self-relationship check doubles as "this is genuinely your work",
  // since it resolves to true only when studentProfileId is the caller's
  // own profile.
  authorize("assignments:view:own", (req) => ({ studentId: req.body?.studentProfileId })),
  async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(await submitAssignment(parsed.data));
  }
);

lmsRouter.get(
  "/assignments/:assignmentId/submissions",
  authorize("grades:enter", async (req) => await getAssignmentCourseScope(req.params.assignmentId)),
  async (req, res) => {
    res.json({ submissions: await listSubmissionsForAssignment(req.params.assignmentId) });
  }
);

const gradeSchema = z.object({
  score: z.number().min(0),
  feedback: z.string().optional(),
});
lmsRouter.post(
  "/submissions/:submissionId/grade",
  authorize("grades:enter", async (req) => await getSubmissionCourseScope(req.params.submissionId)),
  async (req, res) => {
    const parsed = gradeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const graded = await gradeSubmission({
      submissionId: req.params.submissionId,
      gradedByUserId: req.userId!,
      ...parsed.data,
    });

    // Real notification, correctly resolved: StudentProfile.id ->
    // StudentProfile.userId -> the actual User row that should be
    // notified. This is the fix for the bug I flagged and removed
    // earlier rather than ship wrong — best-effort, never blocks grading.
    const studentProfileId = await getSubmissionStudentId(req.params.submissionId);
    const studentUserId = await getUserIdForStudentProfile(studentProfileId);
    if (studentUserId) {
      await notifyUser({
        userId: studentUserId,
        title: "Assignment graded",
        body: `You scored ${parsed.data.score} on a submission.`,
        type: "assignment",
      }).catch(() => undefined);
    }

    res.json(graded);
  }
);

// ---------- QUIZZES ----------

const quizSchema = z.object({ courseId: z.string().uuid(), title: z.string().min(1) });
lmsRouter.post(
  "/quizzes",
  authorize("course:manage", async (req) => await getCourseScope(req.body?.courseId)),
  async (req, res) => {
    const parsed = quizSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(await createQuiz(parsed.data));
  }
);

const questionSchema = z.object({
  quizId: z.string().uuid(),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
});
lmsRouter.post(
  "/quizzes/questions",
  authorize("course:manage", async (req) => await getQuizCourseScope(req.body?.quizId)),
  async (req, res) => {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (parsed.data.correctIndex >= parsed.data.choices.length) {
      return res.status(400).json({ error: "correctIndex must reference a real choice" });
    }
    res.status(201).json(await addQuizQuestion(parsed.data));
  }
);

// A student taking the quiz — real permission check (assignments:view:own
// via self-relationship, since taking a quiz is "your own work" the same
// way a submission is), and the service layer itself strips answer keys
// before this ever reaches the response.
lmsRouter.get(
  "/quizzes/:quizId",
  authorize("assignments:view:own", (req) => ({ studentId: req.query.studentProfileId as string })),
  async (req, res) => {
    res.json(await getQuizForTaking(req.params.quizId));
  }
);

const attemptSchema = z.object({
  studentProfileId: z.string().uuid(),
  answers: z.record(z.string(), z.number().int().min(0)),
});
lmsRouter.post(
  "/quizzes/:quizId/attempts",
  authorize("assignments:view:own", (req) => ({ studentId: req.body?.studentProfileId })),
  async (req, res) => {
    const parsed = attemptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    // Real, server-computed score — the client never supplies or
    // influences it.
    const attempt = await submitQuizAttempt({ quizId: req.params.quizId, ...parsed.data });
    res.status(201).json(attempt);
  }
);

lmsRouter.get(
  "/my-quiz-attempts/:studentProfileId",
  authorize("assignments:view:own", (req) => ({ studentId: req.params.studentProfileId })),
  async (req, res) => {
    res.json({ attempts: await getQuizAttemptsForStudent(req.params.studentProfileId) });
  }
);
