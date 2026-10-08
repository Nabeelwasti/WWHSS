# WWHSS Digital Campus — Disaster Recovery Runbook

## Recovery model

The backup system supports three explicit restore modes:

- **DRY_RUN** — validates the encrypted backup and performs no mutation.
- **MERGE** — restores backup rows with upsert semantics; rows absent from the backup are retained.
- **REPLACE** — restores the represented application-table state by deleting current rows in dependency-safe order before replaying the backup. Object storage is reconciled after the committed database replacement.

Replacement is intentionally destructive and requires the explicit confirmation token RESTORE_REPLACE.

## Recovery assets

1. Neon/PostgreSQL data or an encrypted database backup.
2. Cloudflare R2 objects represented by the backup.
3. The backup encryption key stored separately from both the database and object storage.

Losing the encryption key makes encrypted backups unrecoverable.

## Standard recovery drill

1. Identify the last known-good encrypted backup.
2. Run DRY_RUN.
3. Verify table counts, schema compatibility, foreign-key dependencies, and sequence metadata.
4. Restore into an isolated PostgreSQL environment first.
5. Validate authentication, roles, permissions, students, enrollments, finance, exams, LMS, documents, audit logs, and storage references.
6. For exact replacement recovery, use REPLACE only after the dry run succeeds.
7. Reconcile R2 objects and verify every restored storage key.
8. Record the drill and retain the recovery evidence.

## Safety requirements

- Never test REPLACE against the only live database.
- Never store BACKUP_ENCRYPTION_KEY with backup objects.
- Keep at least one off-site encrypted backup.
- Define and periodically measure RPO and RTO.
- After restoring, verify admin login, refresh-token rotation, role permissions, and audit logging.


## Restore checkpoint lifecycle

Every MERGE/REPLACE restore is preceded by a read-only DRY_RUN validation. A real restore records:

1. `STARTED` after envelope/schema validation.
2. `STORAGE_STAGED` after all backup objects required for the restore are present.
3. `DATABASE_COMMITTED` only after the PostgreSQL transaction commits and sequences are synchronized.
4. `COMPLETE` only after post-commit storage reconciliation succeeds.
5. `FAILED` on any failure, with the failure message retained for operators.

Historical refresh-token/session rows are never restored. The restore explicitly invalidates refresh sessions so an old backup cannot revive a previous login session.