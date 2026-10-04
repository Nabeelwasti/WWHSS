-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_id_examId_subjectId_key" ON "exam_subjects"("id", "examId", "subjectId");

-- DropForeignKey
ALTER TABLE "exam_results" DROP CONSTRAINT IF EXISTS "exam_results_examSubjectId_fkey";

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_examSubjectId_examId_subjectId_fkey" FOREIGN KEY ("examSubjectId", "examId", "subjectId") REFERENCES "exam_subjects"("id", "examId", "subjectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_records_userId_date_key" ON "ai_usage_records"("userId", "date");

-- CreateIndex
CREATE INDEX "ai_usage_records_userId_date_idx" ON "ai_usage_records"("userId", "date");

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
