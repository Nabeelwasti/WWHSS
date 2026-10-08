CREATE TABLE "asset_assignments" (
  "id" TEXT NOT NULL,
  "assetTag" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "staffProfileId" TEXT,
  "studentProfileId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "notes" TEXT,
  CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_assignments_assetTag_key" ON "asset_assignments"("assetTag");
CREATE INDEX "asset_assignments_status_assignedAt_idx" ON "asset_assignments"("status","assignedAt");
CREATE INDEX "asset_assignments_staffProfileId_idx" ON "asset_assignments"("staffProfileId");
CREATE INDEX "asset_assignments_studentProfileId_idx" ON "asset_assignments"("studentProfileId");
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
