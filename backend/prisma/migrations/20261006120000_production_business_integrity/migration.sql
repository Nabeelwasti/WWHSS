CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "dummy_guard" BOOLEAN;
ALTER TABLE "users" DROP COLUMN IF EXISTS "dummy_guard";

ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedByUserId" TEXT;

ALTER TABLE "ai_assessment_tests"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "ai_answer_sheets"
  ADD COLUMN IF NOT EXISTS "scoreFinalizedByUserId" TEXT;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'posted';

CREATE TABLE IF NOT EXISTS "student_enrollment_history" (
  "id" TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "sectionId" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT,
  "changedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_enrollment_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_enrollment_history_studentProfileId_startDate_idx"
  ON "student_enrollment_history" ("studentProfileId","startDate");
CREATE INDEX IF NOT EXISTS "student_enrollment_history_academicYearId_classId_sectionId_idx"
  ON "student_enrollment_history" ("academicYearId","classId","sectionId");

DO $$ BEGIN
  ALTER TABLE "student_enrollment_history"
    ADD CONSTRAINT "student_enrollment_history_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollment_history"
    ADD CONSTRAINT "student_enrollment_history_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollment_history"
    ADD CONSTRAINT "student_enrollment_history_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "classes"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollment_history"
    ADD CONSTRAINT "student_enrollment_history_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollment_history"
    ADD CONSTRAINT "student_enrollment_history_changedByUserId_fkey"
    FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "course_teacher_assignments" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "assignedByUserId" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate" TIMESTAMP(3),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_teacher_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "course_teacher_assignments_courseId_teacherId_startDate_key"
  ON "course_teacher_assignments" ("courseId","teacherId","startDate");
CREATE INDEX IF NOT EXISTS "course_teacher_assignments_teacherId_startDate_endDate_idx"
  ON "course_teacher_assignments" ("teacherId","startDate","endDate");
DO $$ BEGIN
  ALTER TABLE "course_teacher_assignments" ADD CONSTRAINT "course_teacher_assignments_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "course_teacher_assignments" ADD CONSTRAINT "course_teacher_assignments_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "course_teacher_assignments" ADD CONSTRAINT "course_teacher_assignments_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "payment_adjustments" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "adjustedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "payment_adjustments_paymentId_idx" ON "payment_adjustments" ("paymentId");
CREATE INDEX IF NOT EXISTS "payment_adjustments_kind_createdAt_idx" ON "payment_adjustments" ("kind","createdAt");
DO $$ BEGIN
  ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_adjustedByUserId_fkey"
    FOREIGN KEY ("adjustedByUserId") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "exams" ADD CONSTRAINT "exams_publishedByUserId_fkey"
    FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ai_answer_sheets" ADD CONSTRAINT "ai_answer_sheets_scoreFinalizedByUserId_fkey"
    FOREIGN KEY ("scoreFinalizedByUserId") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "student_funding_records"
    ADD CONSTRAINT "student_funding_records_no_overlap"
    EXCLUDE USING gist (
      "studentProfileId" WITH =,
      tsrange("startDate", COALESCE("endDate", 'infinity'::timestamp), '[)') WITH &&
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
