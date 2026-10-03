import { describe, it, expect, vi, beforeEach } from "vitest";

// Real test of quiz auto-grading: the score must come from comparing the
// student's actual answers against the actual stored correct answers —
// never a client-supplied or hardcoded score.
vi.mock("../../../db/client.js", () => ({
  prisma: {
    quizQuestion: { findMany: vi.fn() },
    quizAttempt: { create: vi.fn() },
    studentProfile: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    quiz: { findUnique: vi.fn() },
    timetableSlot: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { submitQuizAttempt, NotFoundError } from "../lms.service.js";

const mockedFindMany = prisma.quizQuestion.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = prisma.quizAttempt.create as unknown as ReturnType<typeof vi.fn>;
const mockStudentFind = prisma.studentProfile.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockCourseFind = prisma.course.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuizFind = prisma.quiz.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockTimetableFind = prisma.timetableSlot.findMany as unknown as ReturnType<typeof vi.fn>;

describe("submitQuizAttempt (auto-grading)", () => {
  beforeEach(() => {
    mockedFindMany.mockReset();
    mockedCreate.mockReset();
    mockStudentFind.mockReset();
    mockCourseFind.mockReset();
    mockQuizFind.mockReset();
    mockTimetableFind.mockReset();

    mockedCreate.mockImplementation(async ({ data }: { data: unknown }) => data);

    // Setup valid student enrollment for existing auto-grading unit tests
    mockStudentFind.mockResolvedValue({ id: "student-1", classId: "grade-10", sectionId: "sec-10a" });
    mockCourseFind.mockResolvedValue({ id: "course-1", classId: "grade-10", subjectId: "subj-1" });
    mockQuizFind.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "empty-quiz" || where.id === "quiz-1") {
        return { id: where.id, courseId: "course-1" };
      }
      return null;
    });
    mockTimetableFind.mockResolvedValue([{ sectionId: "sec-10a" }]);
  });

  it("scores 100 when every answer matches the real correct index", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "q1", correctIndex: 2, choices: ["A", "B", "C", "D"] },
      { id: "q2", correctIndex: 0, choices: ["A", "B", "C", "D"] },
    ]);

    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      studentProfileId: "student-1",
      answers: { q1: 2, q2: 0 },
    });

    expect(result.score).toBe(100);
  });

  it("scores 0 when every answer is wrong — never a passing score by default", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "q1", correctIndex: 2, choices: ["A", "B", "C", "D"] },
      { id: "q2", correctIndex: 0, choices: ["A", "B", "C", "D"] },
    ]);

    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      studentProfileId: "student-1",
      answers: { q1: 0, q2: 3 },
    });

    expect(result.score).toBe(0);
  });

  it("computes a real partial score from a mix of right and wrong answers", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "q1", correctIndex: 1, choices: ["A", "B", "C", "D"] },
      { id: "q2", correctIndex: 1, choices: ["A", "B", "C", "D"] },
      { id: "q3", correctIndex: 1, choices: ["A", "B", "C", "D"] },
      { id: "q4", correctIndex: 1, choices: ["A", "B", "C", "D"] },
    ]);

    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      studentProfileId: "student-1",
      answers: { q1: 1, q2: 1, q3: 0, q4: 0 }, // 2 of 4 correct = 50
    });

    expect(result.score).toBe(50);
  });

  it("treats a missing answer for a question as wrong, not as skipped/ignored", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "q1", correctIndex: 1, choices: ["A", "B", "C", "D"] },
      { id: "q2", correctIndex: 1, choices: ["A", "B", "C", "D"] },
    ]);

    const result = await submitQuizAttempt({
      quizId: "quiz-1",
      studentProfileId: "student-1",
      answers: { q1: 1 }, // q2 never answered
    });

    expect(result.score).toBe(50);
  });

  it("refuses to grade a quiz that has no real questions, rather than returning a fake score", async () => {
    mockedFindMany.mockResolvedValue([]);

    await expect(
      submitQuizAttempt({ quizId: "empty-quiz", studentProfileId: "student-1", answers: {} })
    ).rejects.toThrow(NotFoundError);
  });
});
