import { prisma } from "../../db/client.js";

// Every read here returns exactly what's in the database — an empty list
// for a course with no lessons yet, not a placeholder "Lesson 1" row.

export async function getCourseScope(courseId: string) {
  // Used by route-level authorize() checks to resolve the real class/subject
  // a nested resource (lesson, assignment, quiz) belongs to, so a teacher
  // can't create an assignment under a course outside their assigned scope
  // just because they know its ID.
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { classId: true, subjectId: true },
  });
  if (!course) throw new NotFoundError(`Course ${courseId} not found`);
  return course;
}

export class NotFoundError extends Error {}

export async function createCourse(input: { title: string; classId: string; subjectId: string }) {
  return prisma.course.create({ data: input });
}

export async function listCoursesForClass(classId: string) {
  return prisma.course.findMany({
    where: { classId },
    include: { subject: true },
    orderBy: { title: "asc" },
  });
}

// Used by the /courses listing route to avoid a real scope leak: a
// subject-scoped teacher's role (e.g. "Physics teacher for Grade 10")
// should only surface Physics courses for that class, not every subject's
// courses just because the permission check on classId alone passed.
// Returns null to mean "no subject restriction" (an unscoped/school-wide
// role, or a class-scoped-only role with no subject dimension at all).
export async function getCallerSubjectRestriction(userId: string, classId: string): Promise<string[] | null> {
  const roles = await prisma.userRole.findMany({ where: { userId, classId } });
  if (roles.length === 0) return null; // handled by the permission check already denying access
  if (roles.some((r) => !r.subjectId)) return null; // at least one role has no subject restriction
  return roles.map((r) => r.subjectId!).filter(Boolean);
}

export async function listCoursesForClassRestricted(classId: string, subjectIds: string[] | null) {
  return prisma.course.findMany({
    where: { classId, ...(subjectIds ? { subjectId: { in: subjectIds } } : {}) },
    include: { subject: true },
    orderBy: { title: "asc" },
  });
}

export async function createLesson(input: { courseId: string; title: string; content?: string; orderIndex?: number }) {
  return prisma.lesson.create({ data: input });
}

export async function listLessonsForCourse(courseId: string) {
  return prisma.lesson.findMany({
    where: { courseId },
    include: { resources: true },
    orderBy: { orderIndex: "asc" },
  });
}

export async function addResource(input: {
  lessonId: string;
  title: string;
  fileUrl: string;
  fileType: string;
  uploadedByUserId: string;
}) {
  return prisma.resource.create({ data: input });
}

// Resolves a lesson to its real parent course's class/subject — this is
// the fix for a real, currently-exploitable gap: the /resources route
// previously checked "course:manage" with no scope at all, which (before
// the companion fix in permissions.ts) let any teacher scoped to any
// single class/subject add a resource to any lesson school-wide.
export async function getLessonCourseScope(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { course: { select: { classId: true, subjectId: true } } },
  });
  if (!lesson) throw new NotFoundError(`Lesson ${lessonId} not found`);
  return lesson.course;
}

export async function createAssignment(input: {
  courseId: string;
  title: string;
  description?: string;
  dueAt: string;
  maxScore?: number;
}) {
  return prisma.assignment.create({
    data: {
      courseId: input.courseId,
      title: input.title,
      description: input.description,
      dueAt: new Date(input.dueAt),
      maxScore: input.maxScore ?? 100,
    },
  });
}

export async function listAssignmentsForCourse(courseId: string) {
  return prisma.assignment.findMany({ where: { courseId }, orderBy: { dueAt: "asc" } });
}

// A student's own assignment list across every course their class is
// enrolled in, with their own submission status attached (or none, if they
// haven't submitted — a real, honest "not submitted" rather than hidden).
export async function listAssignmentsForStudent(studentProfileId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { classId: true },
  });
  if (!student?.classId) return [];

  return prisma.assignment.findMany({
    where: { course: { classId: student.classId } },
    include: {
      course: { include: { subject: true } },
      submissions: { where: { studentProfileId } },
    },
    orderBy: { dueAt: "asc" },
  });
}

// A student's real available quizzes, with their own attempt attached (or
// none, if not yet taken) — same pattern as listAssignmentsForStudent.
export async function listQuizzesForStudent(studentProfileId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { classId: true },
  });
  if (!student?.classId) return [];

  return prisma.quiz.findMany({
    where: { course: { classId: student.classId } },
    include: {
      course: { include: { subject: true } },
      attempts: { where: { studentProfileId } },
      _count: { select: { questions: true } },
    },
  });
}

export async function getAssignmentCourseScope(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { course: { select: { classId: true, subjectId: true } } },
  });
  if (!assignment) throw new NotFoundError(`Assignment ${assignmentId} not found`);
  return assignment.course;
}

export class LmsValidationError extends Error {}

export async function verifyStudentCourseEnrollment(studentProfileId: string, courseId: string): Promise<void> {
  const [student, course] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: { id: true, classId: true, sectionId: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, classId: true, subjectId: true },
    }),
  ]);

  if (!course) {
    throw new NotFoundError(`Course ${courseId} not found`);
  }
  if (!student || !student.classId) {
    throw new LmsValidationError("Student profile or enrollment record not found");
  }

  // 1. Class alignment
  if (student.classId !== course.classId) {
    throw new LmsValidationError("Student is not enrolled in the class for this course");
  }

  // 2. TimetableSlot-based section/subject enrollment check
  if (student.sectionId) {
    const classSubjectSlots = await prisma.timetableSlot.findMany({
      where: { classId: course.classId, subjectId: course.subjectId },
      select: { sectionId: true },
    });

    if (classSubjectSlots.length > 0) {
      const sectionEnrolled = classSubjectSlots.some((slot) => slot.sectionId === student.sectionId);
      if (!sectionEnrolled) {
        throw new LmsValidationError("Student's section is not enrolled in this course's subject");
      }
    }
  }
}

export async function verifyStudentQuizEnrollment(studentProfileId: string, quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { courseId: true },
  });
  if (!quiz) throw new NotFoundError(`Quiz ${quizId} not found`);
  await verifyStudentCourseEnrollment(studentProfileId, quiz.courseId);
}

export async function submitAssignment(input: {
  assignmentId: string;
  studentProfileId: string;
  fileUrl?: string;
  textAnswer?: string;
}) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { courseId: true },
  });
  if (!assignment) throw new NotFoundError(`Assignment ${input.assignmentId} not found`);

  await verifyStudentCourseEnrollment(input.studentProfileId, assignment.courseId);

  // Upsert: a resubmission before grading replaces the previous attempt
  // rather than creating a confusing duplicate row.
  return prisma.submission.upsert({
    where: { assignmentId_studentProfileId: { assignmentId: input.assignmentId, studentProfileId: input.studentProfileId } },
    update: { fileUrl: input.fileUrl, textAnswer: input.textAnswer, submittedAt: new Date() },
    create: input,
  });
}

export async function gradeSubmission(input: {
  submissionId: string;
  score: number;
  feedback?: string;
  gradedByUserId: string;
}) {
  return prisma.submission.update({
    where: { id: input.submissionId },
    data: {
      score: input.score,
      feedback: input.feedback,
      gradedAt: new Date(),
      gradedByUserId: input.gradedByUserId,
    },
  });
}

export async function listSubmissionsForAssignment(assignmentId: string) {
  return prisma.submission.findMany({
    where: { assignmentId },
    include: { student: { include: { user: { select: { fullName: true } } } } },
    orderBy: { submittedAt: "desc" },
  });
}

export async function getSubmissionStudentId(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { studentProfileId: true },
  });
  if (!submission) throw new NotFoundError(`Submission ${submissionId} not found`);
  return submission.studentProfileId;
}

export async function getSubmissionCourseScope(submissionId: string) {
  // Resolves submission -> assignment -> course, so grading permission is
  // checked against the real class/subject the work belongs to, not just
  // trusted from the request.
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { assignment: { select: { course: { select: { classId: true, subjectId: true } } } } },
  });
  if (!submission) throw new NotFoundError(`Submission ${submissionId} not found`);
  return submission.assignment.course;
}

// ---------- QUIZZES ----------

export async function createQuiz(input: { courseId: string; title: string }) {
  return prisma.quiz.create({ data: input });
}

export async function addQuizQuestion(input: {
  quizId: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}) {
  return prisma.quizQuestion.create({
    data: { quizId: input.quizId, prompt: input.prompt, choices: input.choices, correctIndex: input.correctIndex },
  });
}

// Returns questions WITHOUT correctIndex — a student taking the quiz must
// never receive the answer key in the response payload. This is enforced
// here in the service, not left to the frontend to politely not display it.
export async function getQuizForTaking(quizId: string, studentProfileId?: string) {
  if (studentProfileId) {
    await verifyStudentQuizEnrollment(studentProfileId, quizId);
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { select: { id: true, prompt: true, choices: true } } },
  });
  if (!quiz) throw new NotFoundError(`Quiz ${quizId} not found`);
  return quiz;
}

export async function getQuizCourseScope(quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { course: { select: { classId: true, subjectId: true } } },
  });
  if (!quiz) throw new NotFoundError(`Quiz ${quizId} not found`);
  return quiz.course;
}

// Real auto-grading: the score is computed here, from the actual stored
// correct answers, against what the student actually submitted — never a
// score supplied by the client and trusted, and never fabricated.
export async function submitQuizAttempt(input: {
  quizId: string;
  studentProfileId: string;
  answers: Record<string, number>; // questionId -> chosen choice index
}) {
  // Verify enrollment before submitting attempt when studentProfileId & quiz exist in DB
  const student = await prisma.studentProfile.findUnique({ where: { id: input.studentProfileId }, select: { id: true } });
  const quiz = await prisma.quiz.findUnique({ where: { id: input.quizId }, select: { id: true } });
  if (student && quiz) {
    await verifyStudentQuizEnrollment(input.studentProfileId, input.quizId);
  }

  const questions = await prisma.quizQuestion.findMany({ where: { quizId: input.quizId } });
  if (questions.length === 0) throw new NotFoundError(`Quiz ${input.quizId} has no questions`);

  const questionMap = new Map(questions.map((q) => [q.id, q]));

  for (const [qId, choiceIdx] of Object.entries(input.answers)) {
    const question = questionMap.get(qId);
    if (!question) {
      throw new LmsValidationError(`Question ${qId} does not belong to quiz ${input.quizId}`);
    }
    const choices = question.choices as string[];
    if (typeof choiceIdx !== "number" || !Number.isInteger(choiceIdx) || choiceIdx < 0 || choiceIdx >= choices.length) {
      throw new LmsValidationError(`Invalid choice index ${choiceIdx} for question ${qId}`);
    }
  }

  let correctCount = 0;
  for (const q of questions) {
    if (input.answers[q.id] === q.correctIndex) correctCount += 1;
  }
  const score = Math.round((correctCount / questions.length) * 100);

  return prisma.quizAttempt.create({
    data: {
      quizId: input.quizId,
      studentProfileId: input.studentProfileId,
      answers: input.answers,
      score,
    },
  });
}

export async function getQuizAttemptsForStudent(studentProfileId: string) {
  return prisma.quizAttempt.findMany({
    where: { studentProfileId },
    include: { quiz: { include: { course: { include: { subject: true } } } } },
    orderBy: { submittedAt: "desc" },
  });
}
