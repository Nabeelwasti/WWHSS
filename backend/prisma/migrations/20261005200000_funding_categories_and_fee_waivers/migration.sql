-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN "fundingCategoryId" TEXT;

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN "fundingCategoryId" TEXT,
ADD COLUMN "feeType" TEXT NOT NULL DEFAULT 'TUITION';

-- CreateTable
CREATE TABLE "funding_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funding_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_funding_records" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "fundingCategoryId" TEXT NOT NULL,
    "programName" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "evidenceRef" TEXT,
    "approvalAuthority" TEXT,
    "feePolicy" TEXT NOT NULL DEFAULT 'FULLY_WAIVED',
    "waiverPercentage" DECIMAL(5,2),
    "customFeeAmount" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_funding_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_waivers" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funding_categories_name_key" ON "funding_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "funding_categories_code_key" ON "funding_categories"("code");

-- CreateIndex
CREATE INDEX "student_funding_records_studentProfileId_idx" ON "student_funding_records"("studentProfileId");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_fundingCategoryId_fkey" FOREIGN KEY ("fundingCategoryId") REFERENCES "funding_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_funding_records" ADD CONSTRAINT "student_funding_records_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_funding_records" ADD CONSTRAINT "student_funding_records_fundingCategoryId_fkey" FOREIGN KEY ("fundingCategoryId") REFERENCES "funding_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fundingCategoryId_fkey" FOREIGN KEY ("fundingCategoryId") REFERENCES "funding_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
