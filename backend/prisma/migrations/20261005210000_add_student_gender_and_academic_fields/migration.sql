-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN "gender" TEXT,
ADD COLUMN "previousSchool" TEXT,
ADD COLUMN "boardRegistrationNo" TEXT;

-- CreateIndex
CREATE INDEX "student_profiles_gender_idx" ON "student_profiles"("gender");

-- CreateIndex
CREATE INDEX "student_profiles_fundingCategoryId_idx" ON "student_profiles"("fundingCategoryId");
