# WWHSS Production Readiness

This document is the current operational source of truth for the production architecture. Historical design notes may describe earlier prototypes; they must not override the implementation and CI configuration on `main`.

## Runtime architecture

- Backend: Node.js 24, Express, TypeScript, Prisma 5, PostgreSQL 16.
- Frontend: React 18, TypeScript, Vite.
- Authentication: short-lived access JWT plus hashed, rotating refresh tokens in PostgreSQL, with explicit JWT issuer/audience validation.
- Authorization: backend-enforced permission keys with class/section/subject/department/student scopes.
- Durable files and backups: S3-compatible object storage in hosted preview/production.
- Local filesystem and process-memory persistence: development/test only.
- Backup encryption: AES-256-GCM with a deployment-specific secret.
- Backup privilege boundary: dedicated `backup:view`, `backup:create`, `backup:download`, `backup:restore`, and `backup:delete` permissions; whole-database recovery capability is not implied by `users:manage`.
- Human exports: business-data exports explicitly exclude refresh-token/session records, password hashes, audit/security material, and recursively named secret/token/key fields. Disaster-recovery backups remain encrypted and contain the full restore dataset by design.
- Database restore: dependency-aware, transactional restore with primary-key upserts, sequence synchronization, and audit logging.
- Official documents: authoritative `SchoolProfile` data and persistent `DocumentSequence` numbering, with object-level authorization against the referenced student/staff record.
- AI assessment: teacher grading remains under `grades:enter`; answer-sheet submission is separately authorized for teaching scope or the authenticated student's own record.
- API contract: `backend/openapi.json` is checked against every mounted module router.
- CI: Node 24 + PostgreSQL 16, Prisma migrations, lock consistency, security audit, unit/integration tests, build, frontend build, and Docker build.

## Hosted environment requirements

Preview and production must provide real values for:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `BACKUP_ENCRYPTION_KEY`
- `STORAGE_PROVIDER=s3` or `cloud`
- `BACKUP_PROVIDER=s3` or `cloud`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `CORS_ORIGIN` using HTTPS
- `TRUST_PROXY=true` or `1`

Do not commit real credentials. Preview and production should point at separate PostgreSQL databases. Refresh cookies are Secure/HttpOnly on both Vercel preview and production deployments.

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

Also build both Docker images before release and run the disposable-database recovery drill described below before declaring a disaster-recovery objective operationally proven.

## Recovery requirements

Backups are encrypted before persistence. A restore must be executed by an operator holding the dedicated `backup:restore` permission, validated against the current schema, and performed as one database transaction. A production recovery drill should periodically restore a backup into a disposable PostgreSQL database and verify representative users, student records, finance, attendance, LMS, exams, documents, timetable, library, CMS, and audit records. Human-facing exports are not substitutes for disaster-recovery backups.

## Security requirements

Uploads are authenticated, authorized, size-limited before buffering, stored outside the web root or in object storage, assigned generated storage keys, checked against an allowlist, and validated against expected filename/type signatures for supported binary formats.

Private downloads are authorized from persisted ownership/entity scope and return no-store, no-sniff, attachment-oriented headers. Hosted S3 failures fail closed rather than silently switching to local persistence.

Official document endpoints resolve the referenced student/staff object and enforce the caller's actual class/section/department/self relationship before generating sensitive payloads.

AI-generated assessment content is never replaced by fabricated placeholder questions. Invalid AI output is rejected and retried once through the real provider path.
