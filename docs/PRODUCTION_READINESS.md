# WWHSS Production Readiness

This document is the current operational source of truth for the production architecture. Historical design notes may describe earlier prototypes; they must not override the implementation and CI configuration on `main`.

## Runtime architecture

- Backend: Node.js 24, Express, TypeScript, Prisma 5, PostgreSQL 16.
- Frontend: React 18, TypeScript, Vite.
- Authentication: short-lived access JWT plus hashed, rotating refresh tokens in PostgreSQL.
- Authorization: backend-enforced permission keys with class/section/subject/department/student scopes.
- Durable files and backups: S3-compatible object storage in hosted preview/production.
- Local filesystem and process-memory persistence: development/test only.
- Backup encryption: AES-256-GCM with a deployment-specific secret.
- Database restore: dependency-aware, transactional restore with primary-key upserts, sequence synchronization, and audit logging.
- Official documents: authoritative `SchoolProfile` data and persistent `DocumentSequence` numbering.
- API contract: `backend/openapi.json` is checked against every mounted module router.
- CI: Node 24 + PostgreSQL 16, Prisma migrations, lock consistency, security audit, unit/integration tests, build, frontend build, and Docker build.

## Hosted environment requirements

Preview and production must provide real values for:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `BACKUP_ENCRYPTION_KEY`
- `STORAGE_PROVIDER=s3` or `cloud`
- `BACKUP_PROVIDER=s3` or `cloud`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `CORS_ORIGIN` using HTTPS
- `TRUST_PROXY=true` or `1`

Do not commit real credentials. Preview and production should point at separate PostgreSQL databases.

## Verification

From `backend/`:

```text
npm ci
npx prisma validate
npx prisma generate
npm audit --audit-level=high
npm run test:unit
npm run test:integration
npm run build
```

From `frontend/`:

```text
npm ci
npm audit --audit-level=high
npm run build
```

Also build both Docker images before release.

## Recovery requirements

Backups are encrypted before persistence. A restore must be executed by a privileged authenticated operator, validated against the current schema, and performed as one database transaction. A production recovery drill should periodically restore a backup into a disposable PostgreSQL database and verify representative users, student records, finance, attendance, LMS, exams, documents, timetable, library, CMS, and audit records.

## Security requirements

Uploads are authenticated, authorized, size-limited before buffering, stored outside the web root or in object storage, assigned generated storage keys, checked against an allowlist, and validated against expected filename/type signatures for supported binary formats.

Private downloads are authorized from persisted ownership/entity scope and return no-store, no-sniff, attachment-oriented headers.

AI-generated assessment content is never replaced by fabricated placeholder questions. Invalid AI output is rejected and retried once through the real provider path.

