import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";

export type ExamLifecycleStatus = "DRAFT" | "PUBLISHED" | "LOCKED" | "FINALIZED";

export class ExamLifecycleError extends Error {}

const transitions: Record<ExamLifecycleStatus, ExamLifecycleStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["LOCKED"],
  LOCKED: ["FINALIZED"],
  FINALIZED: [],
};

async function readExamStatus(examId: string): Promise<ExamLifecycleStatus> {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; publishedAt: Date | null; lockedAt: Date | null; publishedByUserId: string | null }>>`
    SELECT "id", "status", "publishedAt", "lockedAt", "publishedByUserId"
    FROM "exams"
    WHERE "id" = ${examId}
  `;
  const exam = rows[0];
  if (!exam) throw new ExamLifecycleError("Exam not found");
  if (!["DRAFT", "PUBLISHED", "LOCKED", "FINALIZED"].includes(exam.status)) {
    throw new ExamLifecycleError(`Invalid exam lifecycle status: ${exam.status}`);
  }
  return exam.status as ExamLifecycleStatus;
}

export async function getExamLifecycle(examId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: ExamLifecycleStatus; publishedAt: Date | null; lockedAt: Date | null; publishedByUserId: string | null }>>`
    SELECT "id", "status", "publishedAt", "lockedAt", "publishedByUserId"
    FROM "exams"
    WHERE "id" = ${examId}
  `;
  if (!rows[0]) throw new ExamLifecycleError("Exam not found");
  return rows[0];
}

async function transitionExam(examId: string, actorId: string, target: ExamLifecycleStatus) {
  if (!actorId) throw new ExamLifecycleError("Authenticated user identity required");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ status: ExamLifecycleStatus }>>`
      SELECT "status" FROM "exams" WHERE "id" = ${examId} FOR UPDATE
    `;
    const exam = rows[0];
    if (!exam) throw new ExamLifecycleError("Exam not found");
    if (!transitions[exam.status].includes(target)) {
      throw new ExamLifecycleError(`Invalid exam lifecycle transition: ${exam.status} -> ${target}`);
    }

    if (target === "PUBLISHED") {
      await tx.$executeRaw`
        UPDATE "exams"
        SET "status" = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP, "publishedByUserId" = ${actorId}
        WHERE "id" = ${examId}
      `;
    } else if (target === "LOCKED") {
      await tx.$executeRaw`
        UPDATE "exams"
        SET "status" = 'LOCKED', "lockedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${examId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "exams"
        SET "status" = 'FINALIZED'
        WHERE "id" = ${examId}
      `;
    }

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: `exams:lifecycle:${target.toLowerCase()}`,
        resource: `exam:${examId}`,
        metadata: { from: exam.status, to: target },
      },
    });

    const updated = await tx.$queryRaw<Array<{ id: string; status: ExamLifecycleStatus; publishedAt: Date | null; lockedAt: Date | null; publishedByUserId: string | null }>>`
      SELECT "id", "status", "publishedAt", "lockedAt", "publishedByUserId"
      FROM "exams"
      WHERE "id" = ${examId}
    `;
    return updated[0];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function publishExam(examId: string, actorId: string) {
  return transitionExam(examId, actorId, "PUBLISHED");
}

export function lockExam(examId: string, actorId: string) {
  return transitionExam(examId, actorId, "LOCKED");
}

export function finalizeExam(examId: string, actorId: string) {
  return transitionExam(examId, actorId, "FINALIZED");
}
