import { describe, it, expect, vi, beforeEach } from "vitest";

// Real test of quiz auto-grading: the score must come from comparing the
// student's actual answers against the actual stored correct answers —
// never a client-supplied or hardcoded score.
vi.mock("../../../db/client.js", () => ({
  prisma: {
    quizQuestion: { findMany: vi.fn() },
    quizAttempt: { create: vi.fn() },
  },
}));

import { prisma } from "../../../db/client.js";
import { submitQuizAttempt, NotFoundError } from "../lms.service.js";

const mockedFindMany = prisma.quizQuestion.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = prisma.quizAttempt.create as unknown as ReturnType<typeof vi.fn>;

describe("submitQuizAttempt (auto-grading)", () => {
  beforeEach(() => {
    mockedFindMany.mockReset();
    mockedCreate.mockReset();
    mockedCreate.mockImplementation(async ({ data }: { data: unknown }) => data);
  });

  it("scores 100 when every answer matches the real correct index", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "q1", correctIndex: 2 },
      { id: "q2", correctIndex: 0 },
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
      { id: "q1", correctIndex: 2 },
      { id: "q2", correctIndex: 0 },
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
      { id: "q1", correctIndex: 1 },
      { id: "q2", correctIndex: 1 },
      { id: "q3", correctIndex: 1 },
      { id: "q4", correctIndex: 1 },
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
      { id: "q1", correctIndex: 1 },
      { id: "q2", correctIndex: 1 },
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
