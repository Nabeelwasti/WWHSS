import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    studentProfile: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    quiz: { findUnique: vi.fn() },
    quizQuestion: { findMany: vi.fn() },
    timetableSlot: { findMany: vi.fn() },
    quizAttempt: { create: vi.fn() },
    assignment: { findUnique: vi.fn() },
    submission: { upsert: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import {
  verifyStudentCourseEnrollment,
  verifyStudentQuizEnrollment,
  getQuizForTaking,
  submitQuizAttempt,
  LmsValidationError,
  NotFoundError,
} from "../lms.service.js";

const mockStudentFind = prisma.studentProfile.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockCourseFind = prisma.course.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuizFind = prisma.quiz.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuestionsFind = prisma.quizQuestion.findMany as unknown as ReturnType<typeof vi.fn>;
const mockTimetableFind = prisma.timetableSlot.findMany as unknown as ReturnType<typeof vi.fn>;
const mockAttemptCreate = prisma.quizAttempt.create as unknown as ReturnType<typeof vi.fn>;

describe("TimetableSlot-based LMS & Quiz Enrollment Security", () => {
  beforeEach(() => {
    mockStudentFind.mockReset();
    mockCourseFind.mockReset();
    mockQuizFind.mockReset();
    mockQuestionsFind.mockReset();
    mockTimetableFind.mockReset();
    mockAttemptCreate.mockReset();

    mockAttemptCreate.mockImplementation(async ({ data }: { data: unknown }) => data);
  });

  it("REJECTS a student from a DIFFERENT class trying to access a course/quiz", async () => {
    mockStudentFind.mockResolvedValue({ id: "student-1", classId: "grade-9", sectionId: "sec-9a" });
    mockCourseFind.mockResolvedValue({ id: "course-10-physics", classId: "grade-10", subjectId: "subj-physics" });

    await expect(
      verifyStudentCourseEnrollment("student-1", "course-10-physics")
    ).rejects.toThrow(LmsValidationError);
  });

  it("REJECTS a student in the SAME class whose section is NOT scheduled for the subject in TimetableSlot", async () => {
    // Student is in Grade 10 Section B
    mockStudentFind.mockResolvedValue({ id: "student-10b", classId: "grade-10", sectionId: "sec-10b" });
    mockCourseFind.mockResolvedValue({ id: "course-10-physics", classId: "grade-10", subjectId: "subj-physics" });

    // TimetableSlot shows Physics is ONLY scheduled for Grade 10 Section A
    mockTimetableFind.mockResolvedValue([{ sectionId: "sec-10a" }]);

    await expect(
      verifyStudentCourseEnrollment("student-10b", "course-10-physics")
    ).rejects.toThrow(LmsValidationError);
  });

  it("ALLOWS a student whose section IS scheduled for the subject in TimetableSlot", async () => {
    mockStudentFind.mockResolvedValue({ id: "student-10a", classId: "grade-10", sectionId: "sec-10a" });
    mockCourseFind.mockResolvedValue({ id: "course-10-physics", classId: "grade-10", subjectId: "subj-physics" });
    mockTimetableFind.mockResolvedValue([{ sectionId: "sec-10a" }]);

    await expect(
      verifyStudentCourseEnrollment("student-10a", "course-10-physics")
    ).resolves.not.toThrow();
  });

  it("REJECTS taking a quiz for a non-enrolled section student", async () => {
    mockQuizFind.mockResolvedValue({ id: "quiz-1", courseId: "course-10-physics" });
    mockStudentFind.mockResolvedValue({ id: "student-10b", classId: "grade-10", sectionId: "sec-10b" });
    mockCourseFind.mockResolvedValue({ id: "course-10-physics", classId: "grade-10", subjectId: "subj-physics" });
    mockTimetableFind.mockResolvedValue([{ sectionId: "sec-10a" }]); // only section A scheduled

    await expect(
      getQuizForTaking("quiz-1", "student-10b")
    ).rejects.toThrow(LmsValidationError);
  });

  it("ALLOWS taking a quiz for an enrolled section student and strips correctIndex from questions", async () => {
    mockQuizFind.mockResolvedValue({
      id: "quiz-1",
      courseId: "course-10-physics",
      questions: [{ id: "q1", prompt: "Speed of light?", choices: ["300k", "100k"] }],
    });
    mockStudentFind.mockResolvedValue({ id: "student-10a", classId: "grade-10", sectionId: "sec-10a" });
    mockCourseFind.mockResolvedValue({ id: "course-10-physics", classId: "grade-10", subjectId: "subj-physics" });
    mockTimetableFind.mockResolvedValue([{ sectionId: "sec-10a" }]);

    const quiz = await getQuizForTaking("quiz-1", "student-10a");
    expect(quiz.id).toBe("quiz-1");
    expect(quiz.questions[0]).not.toHaveProperty("correctIndex");
  });

  it("REJECTS quiz submission for invalid question IDs or out-of-bounds choice indexes", async () => {
    mockQuizFind.mockResolvedValue({ id: "quiz-1", courseId: "course-10-physics" });
    mockStudentFind.mockResolvedValue({ id: "student-10a", classId: "grade-10", sectionId: "sec-10a" });
    mockCourseFind.mockResolvedValue({ id: "course-10-physics", classId: "grade-10", subjectId: "subj-physics" });
    mockTimetableFind.mockResolvedValue([{ sectionId: "sec-10a" }]);
    mockQuestionsFind.mockResolvedValue([{ id: "q1", choices: ["A", "B"], correctIndex: 0 }]);

    // Invalid choice index (2 out of bounds for choices length 2)
    await expect(
      submitQuizAttempt({ quizId: "quiz-1", studentProfileId: "student-10a", answers: { q1: 2 } })
    ).rejects.toThrow(LmsValidationError);

    // Invalid question ID
    await expect(
      submitQuizAttempt({ quizId: "quiz-1", studentProfileId: "student-10a", answers: { invalid_q: 0 } })
    ).rejects.toThrow(LmsValidationError);
  });

  it("THROWS NotFoundError for nonexistent quiz or course", async () => {
    mockQuizFind.mockResolvedValue(null);
    await expect(verifyStudentQuizEnrollment("student-1", "nonexistent-quiz")).rejects.toThrow(NotFoundError);
  });
});
