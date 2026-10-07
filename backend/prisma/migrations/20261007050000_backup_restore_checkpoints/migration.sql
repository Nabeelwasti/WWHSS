CREATE TABLE "backup_restore_checkpoints" (
  "id" TEXT NOT NULL,
  "backupId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "actorUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "backup_restore_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "backup_restore_checkpoints_status_check" CHECK ("status" IN ('STARTED','STORAGE_STAGED','DATABASE_COMMITTED','COMPLETE','FAILED'))
);

CREATE INDEX "backup_restore_checkpoints_backupId_startedAt_idx"
  ON "backup_restore_checkpoints" ("backupId", "startedAt");

CREATE INDEX "backup_restore_checkpoints_status_startedAt_idx"
  ON "backup_restore_checkpoints" ("status", "startedAt");
