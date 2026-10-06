import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, askCampusAIMock } = vi.hoisted(() => ({
  prismaMock: {
    aiAssessmentTest: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  askCampusAIMock: vi.fn(),
}));

vi.mock("../../../../db/client.js", () => ({ prisma: prismaMock }));
vi.mock("../../ai.service.js", () => ({ askCampusAI: askCampusAIMock }));

const { generateTestQuestionsWithAi } = await import("../ai-assessment.service.js");

describe("AI assessment generation safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed AI output instead of creating fabricated placeholder questions", async () => {
    prismaMock.aiAssessmentTest.findUnique.mockResolvedValue({
      id: "test-id",
      classId: "class-id",
      sectionId: null,
      subjectId: "subject-id",
      topic: "Algebra",
      difficulty: "MEDIUM",
      totalMarks: new Prisma.Decimal("10"),
      language: "en",
      class: { name: "Grade 9" },
      subject: { name: "Mathematics" },
    });
    askCampusAIMock.mockResolvedValue("not valid json");

    await expect(generateTestQuestionsWithAi("test-id", 2, "teacher-id"))
      .rejects.toThrow("AI generation failed validation");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects structurally invalid generated questions before persistence", async () => {
    prismaMock.aiAssessmentTest.findUnique.mockResolvedValue({
      id: "test-id",
      classId: "class-id",
      sectionId: null,
      subjectId: "subject-id",
      topic: "Algebra",
      difficulty: "MEDIUM",
      totalMarks: new Prisma.Decimal("10"),
      language: "en",
      class: { name: "Grade 9" },
      subject: { name: "Mathematics" },
    });
    askCampusAIMock.mockResolvedValue(JSON.stringify([
      { version: "A", questionType: "MCQ", questionText: "2+2?", optionsJson: ["3", "4"], correctAnswer: "5", markingScheme: "Exact answer", marks: 10, orderIndex: 1 },
    ]));

    await expect(generateTestQuestionsWithAi("test-id", 1, "teacher-id"))
      .rejects.toThrow("correct answer is not one of its options");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
