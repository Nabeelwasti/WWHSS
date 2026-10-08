# WWHSS Production Readiness

This document is the current operational source of truth for the production architecture. Historical design notes may describe earlier prototypes; they must not override the implementation and CI configuration on `main`.

## Runtime architecture

- Backend: Node.js 24, Express, TypeScript, Prisma 5, PostgreSQL 16, deployed as a stateless container (Cloud Run recommended for the long-running Express runtime). Vercel is the frontend edge/proxy layer.
- Frontend: React 18, TypeScript, Vite.
- Authentication: short-lived access JWT plus hashed, rotating refresh tokens in PostgreSQL, with explicit JWT issuer/audience validation.
- Authorization: backend-enforced permission keys with class/section/subject/department/student scopes.
- Durable files and backups: S3-compatible object storage (Cloudflare R2 is the free-first reference provider) in hosted preview/production.
- Local filesystem and process-memory persistence: development/test only. Cloud Run instances are ephemeral; no business data may depend on the container filesystem.
- Backup encryption: AES-256-GCM with a deployment-specific secret.
- Backup privilege boundary: dedicated `backup:view`, `backup:create`, `backup:download`, `backup:restore`, and `backup:delete` permissions; whole-database recovery capability is not implied by `users:manage`.
- Human exports: business-data exports explicitly exclude refresh-token/session records, password hashes, audit/security material, and recursively named secret/token/key fields. Disaster-recovery backups remain encrypted and contain the full restore dataset by design.
- Database restore: dependency-aware, transactional restore with primary-key upserts, sequence synchronization, and audit logging.
- Official documents: authoritative `SchoolProfile` data and persistent `DocumentSequence` numbering, with object-level authorization against the referenced student/staff record.
- AI assessment: teacher grading remains under `grades:enter`; answer-sheet submission is separately authorized for teaching scope or the authenticated student's own record.
- API contract: `backend/openapi.json` is checked against every mounted module router.
- CI: Node 24 + PostgreSQL 16, Prisma migrations, lock consistency, security audit, unit/integration tests, build, frontend build, Docker build, and authenticated browser/accessibility smoke tests.

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
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` only when explicit S3 credentials are required; they must be provided as a pair. Workload identity is supported when the provider supplies credentials automatically.
- `CORS_ORIGIN` using HTTPS
- `TRUST_PROXY=true` or `1`
- `WEB_RESEARCH_ENABLED=false` unless a real `WEB_RESEARCH_API_KEY` is intentionally configured

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


## Recommended free-first hosted topology

- Frontend: Vercel Pro/Enterprise for a commercial deployment, or another commercial static host/CDN.
- Backend: Google Cloud Run using `backend/Dockerfile`. Cloud Run is preferred over forcing the stateful Express server into a serverless-only deployment model.
- Vercel Hobby is not a commercial production option under Vercel's current terms; do not sell or operate the product commercially on Hobby.
- Database: Neon PostgreSQL via Vercel Marketplace or directly from Neon.
- Object storage: Cloudflare R2 using the existing S3-compatible storage provider.
- API routing: hosted Vercel builds use `VITE_API_BASE_URL` to call the matching Cloud Run HTTPS origin directly; the browser preserves cookie credentials. Same-origin `/api` remains the default for Docker/self-hosting. When frontend and backend are intentionally cross-origin, set `AUTH_COOKIE_CROSS_SITE=true` and use `SameSite=None; Secure` cookies.
- CI remains the release gate; production deployment credentials must never be committed.

Vercel's current documentation supports Express and external-origin rewrites, while Cloud Run supports Node.js containers and injects the `PORT` environment variable. The repository's container now binds to `0.0.0.0` and its Docker healthcheck follows the injected port.

### Cloud Run deployment sequence

1. Create/select a Google Cloud project and enable Cloud Run, Artifact Registry, and Cloud Build.
2. Deploy `backend/` from source or build the existing Dockerfile. Keep the service at `min-instances=0` for the free-first deployment and set a conservative `max-instances` (for example 3) until database capacity is measured.
3. Configure `PORT` through Cloud Run (it is injected automatically), `NODE_ENV=production`, and all hosted environment variables below.
4. Use Neon's pooled PostgreSQL connection string for application traffic; run `npm run prisma:deploy` against the target database as a controlled release/migration step before serving a schema-dependent revision. Application builds intentionally do **not** run migrations.
5. Seed the initial administrator once with `npm run seed` using a strong `ADMIN_EMAIL` and `ADMIN_PASSWORD`; never use the development default in production.
6. Set `CORS_ORIGIN` to the exact HTTPS Vercel production origin. Do not use `*`.
7. Set `TRUST_PROXY=true` (Cloud Run is behind a managed proxy).
8. Configure R2 through the existing `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optional `S3_ENDPOINT` variables.
9. Configure `VITE_API_BASE_URL` in the Vercel Preview and Production environments to the matching Cloud Run HTTPS origin. The frontend API client prefixes every request with that origin and preserves credentials. Do not place the backend hostname in source code.
10. Verify `/health`, login, refresh, logout, one authorized read, one authorized write, one private-file upload/download, and backup creation/verification against the hosted database before declaring production live.

### Vercel deployment boundary

The application intentionally keeps private file uploads at 10 MB. The recommended production backend is Cloud Run, where the existing upload contract is preserved. A Vercel-hosted backend must not be treated as feature-equivalent: Vercel Functions have a 4.5 MB request/response payload limit. If Vercel Services are used for the backend, large uploads must use an authorized direct-to-object-storage upload flow before that topology is considered production-equivalent; the repository must never silently reduce the 10 MB contract.

### Database separation

Preview/staging and production must use separate PostgreSQL databases or branches. Never point a preview deployment at the production database. Run Prisma migrations through the controlled release step, not automatically on every application instance startup.

### Backup separation

Database backups and business exports are different capabilities. Backups remain encrypted and complete for recovery; business exports continue to exclude session credentials, password hashes, audit/security material, and secret-like fields. Object storage must be durable and independent from the application container.

### Operational certification rule

Production readiness is not certified solely because CI is green. A release is certified only after:
- the latest GitHub Actions run is green;
- the hosted database is reachable and migrated;
- the backend `/health` endpoint reports database connectivity;
- the seeded administrator can log in;
- refresh-token rotation works;
- CORS and secure cookies work for the configured frontend/backend topology;
- representative authorization checks pass;
- object storage upload/download works;
- encrypted backup creation and verification work;
- frontend production routing works on direct paths such as `/admin` and `/dashboard`.
