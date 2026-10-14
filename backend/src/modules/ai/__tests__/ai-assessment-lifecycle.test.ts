import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initialSheetFindUnique: vi.fn(),
  transaction: vi.fn(),
  lockQuery: vi.fn(),
  transactionSheetFindUnique: vi.fn(),
  sheetUpdate: vi.fn(),
  auditCreate: vi.fn(),
  assessmentFindUnique: vi.fn(),
  askCampusAI: vi.fn(),
}));

vi.mock("../../../db/client.js", () => ({
  prisma: {
    aiAnswerSheet: { findUnique: mocks.initialSheetFindUnique },
    aiAssessmentTest: { findUnique: mocks.assessmentFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../ai.service.js", () => ({ askCampusAI: mocks.askCampusAI }));

import { Prisma } from "@prisma/client";
import { approveAiAssessmentTest, generateTestQuestionsWithAi, gradeAiAnswerSheet, lockAiAssessmentTest, publishAiAssessmentTest, AiAssessmentError } from "../ai-assessment.service.js";

describe("AI assessment lifecycle concurrency guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initialSheetFindUnique.mockResolvedValue({ id: "sheet-1", testId: "test-1" });
    mocks.transaction.mockImplementation((callback: (tx: any) => any) => callback({
      $queryRaw: mocks.lockQuery,
      aiAnswerSheet: {
        findUnique: mocks.transactionSheetFindUnique,
        update: mocks.sheetUpdate,
      },
      auditLog: { create: mocks.auditCreate },
    }));
    mocks.transactionSheetFindUnique.mockResolvedValue({
      id: "sheet-1",
      testId: "test-1",
      test: { totalMarks: { toNumber: () => 100 } },
    });
    mocks.sheetUpdate.mockResolvedValue({ id: "sheet-1", finalScore: 85 });
    mocks.auditCreate.mockResolvedValue({});
  });

  it("rejects grading when the locked assessment row is already LOCKED", async () => {
    mocks.lockQuery.mockResolvedValue([{ status: "LOCKED" }]);

    await expect(
      gradeAiAnswerSheet("sheet-1", { finalScore: 85 }, "teacher-1"),
    ).rejects.toBeInstanceOf(AiAssessmentError);

    expect(mocks.transactionSheetFindUnique).not.toHaveBeenCalled();
    expect(mocks.sheetUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("locks the assessment row before grading and records the audit event", async () => {
    mocks.lockQuery.mockResolvedValue([{ status: "PUBLISHED" }]);

    await expect(
      gradeAiAnswerSheet("sheet-1", { finalScore: 85, teacherFeedback: "Good work" }, "teacher-1"),
    ).resolves.toEqual({ id: "sheet-1", finalScore: 85 });

    expect(mocks.lockQuery).toHaveBeenCalledOnce();
    expect(mocks.sheetUpdate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "teacher-1",
        action: "ai_assessment:grade_answer_sheet",
      }),
    }));
  });

  it("rejects approval, publication and locking when the row-locked lifecycle state is invalid", async () => {
    mocks.lockQuery.mockResolvedValue([{ status: "LOCKED" }]);
    await expect(approveAiAssessmentTest("test-1", "teacher-1")).rejects.toBeInstanceOf(AiAssessmentError);

    mocks.lockQuery.mockResolvedValue([{ status: "DRAFT" }]);
    await expect(publishAiAssessmentTest("test-1", "teacher-1")).rejects.toBeInstanceOf(AiAssessmentError);

    mocks.lockQuery.mockResolvedValue([{ status: "APPROVED" }]);
    await expect(lockAiAssessmentTest("test-1", "teacher-1")).rejects.toBeInstanceOf(AiAssessmentError);
  });

  it("does not overwrite questions if an assessment becomes locked during AI generation", async () => {
    mocks.assessmentFindUnique.mockResolvedValue({
      id: "test-1",
      class: { name: "Class 9" },
      subject: { name: "Mathematics" },
      topic: "Fractions",
      difficulty: "EASY",
      language: "en",
      totalMarks: new Prisma.Decimal(5),
    });
    mocks.askCampusAI.mockResolvedValue(JSON.stringify(Array.from({ length: 5 }, (_, index) => ({
      questionType: "SHORT_ANSWER",
      questionText: `Question ${index + 1} about fractions?`,
      correctAnswer: "A valid answer",
      marks: 1,
      orderIndex: index + 1,
      optionsJson: [],
    }))));
    mocks.lockQuery.mockResolvedValue([{ status: "LOCKED" }]);

    await expect(
      generateTestQuestionsWithAi("test-1", 5, "teacher-1"),
    ).rejects.toBeInstanceOf(AiAssessmentError);
  });

  it("rejects non-finite and negative final scores before opening a transaction", async () => {
    await expect(
      gradeAiAnswerSheet("sheet-1", { finalScore: Number.NaN }, "teacher-1"),
    ).rejects.toBeInstanceOf(AiAssessmentError);
    await expect(
      gradeAiAnswerSheet("sheet-1", { finalScore: -1 }, "teacher-1"),
    ).rejects.toBeInstanceOf(AiAssessmentError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
