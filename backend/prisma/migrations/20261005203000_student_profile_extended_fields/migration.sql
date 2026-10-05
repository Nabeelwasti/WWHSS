-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN "registrationNo" TEXT,
ADD COLUMN "fatherName" TEXT,
ADD COLUMN "motherName" TEXT,
ADD COLUMN "guardianName" TEXT,
ADD COLUMN "guardianRelation" TEXT,
ADD COLUMN "guardianPhone" TEXT,
ADD COLUMN "emergencyContact" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "bloodGroup" TEXT,
ADD COLUMN "medicalNotes" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "withdrawalReason" TEXT,
ADD COLUMN "transferDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_registrationNo_key" ON "student_profiles"("registrationNo");

-- CreateIndex
CREATE INDEX "student_profiles_classId_sectionId_idx" ON "student_profiles"("classId", "sectionId");

-- CreateIndex
CREATE INDEX "student_profiles_status_idx" ON "student_profiles"("status");
