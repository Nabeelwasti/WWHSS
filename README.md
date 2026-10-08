# WWHSS Digital Campus

<!-- Final integrated CI verification candidate 2 -->

WWHSS Digital Campus is a production-oriented school management platform for Workers Welfare Higher Secondary School. It is a real full-stack system backed by PostgreSQL, Prisma, Express, React/Vite, durable S3-compatible storage, Docker, and GitHub Actions.

## Current production architecture

```
Browser
  │
  ▼
Vercel Vite frontend
  │ configured VITE_API_BASE_URL (or same-origin /api for Docker/self-hosting)
  ▼
Cloud Run / Docker Express backend
  │
  ├── PostgreSQL (managed)
  ├── S3/R2 durable object storage
  └── encrypted backup storage
```

The backend is deliberately kept as a conventional stateless Express runtime. Cloud Run/self-hosting is the preferred production backend because WWHSS supports 10 MB private uploads, long-running AI/document/backup work, and controlled database migrations.

Vercel remains an excellent frontend/proxy layer. A Vercel-hosted backend is possible, but it is **not feature-equivalent** until large uploads use direct-to-object-storage transfer because Vercel Functions have a 4.5 MB request/response payload limit.

## Major capabilities

- Signup-free authentication with Argon2 passwords
- Short-lived access JWTs and rotating HttpOnly refresh tokens
- RBAC with class, section, subject, department, student/self and guardian scope
- Academic years, classes, sections, subjects and enrollment history
- Student and staff management
- Enterprise HR, staff leave approval and payroll periods/records
- Admissions enquiry pipeline with lifecycle tracking
- Transport vehicles, routes and student assignments
- Inventory stock, movements, reorder thresholds and audit trail
- Asset custody and return tracking for staff and students
- Parent-teacher meeting scheduling with conflict detection
- Attendance with transactional enrollment validation
- LMS courses, lessons, resources, assignments, submissions and quizzes
- Server-side quiz grading with protected answer keys
- Exams, results and teacher grading authority
- Timetable conflict detection for teachers, rooms and classes
- Funding categories, funding periods, fee policies and waivers
- Recurring fee invoices with explicit billing periods
- Payments, reversals, refunds, adjustments and financial reporting
- Provider-neutral online payment intents with signed webhook processing for gateway adapters
- Library catalog, copies, loans and fines
- CMS pages, notices, events and gallery
- Parent portal with scoped child access
- AI assistant with provider routing, limits, consent and school-data authorization
- AI Assessment Studio with generation, validation, review, publish/lock, submission and grading
- Document Engine for academic, financial, attendance, library and operational documents
- Private S3/R2 storage with authorization and metadata
- Encrypted backup, DRY_RUN/MERGE/REPLACE restore modes and storage reconciliation
- OpenAPI contract validation
- English/Urdu localization and RTL support
- PWA shell caching without caching student API data
- Accessibility and authenticated browser E2E coverage
- Docker and self-hosting support

## Finance billing model

Invoices are identified by:

```
fee structure
+ student
+ billing period start
+ billing period end
```

Therefore a monthly fee can correctly produce separate September, October, November and later invoices while repeated generation for the same period remains idempotent.

Existing invoices are migrated without deletion: their billing period is initialized from their existing due date and their invoice number is preserved through a generated migration identifier.

## Database migrations

Application builds **never mutate the database**.

Use:

```bash
cd backend
npm ci
npm run prisma:deploy
npm run build
```

Migration execution is a controlled release operation. Preview/staging and production must use separate PostgreSQL databases or branches.

Docker deployments use their dedicated migration/setup workflow.

## Hosted environment requirements

Preview and production require real values for:

- DATABASE_URL
- JWT_ACCESS_SECRET
- JWT_REFRESH_SECRET
- JWT_ISSUER
- JWT_AUDIENCE
- BACKUP_ENCRYPTION_KEY
- STORAGE_PROVIDER=s3 or cloud
- BACKUP_PROVIDER=s3 or cloud
- S3_BUCKET
- S3_REGION
- S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are optional as a pair when the S3-compatible provider supplies workload/instance credentials; if one is set, the other is required.
- CORS_ORIGIN=https://...
- Optional payment webhook secrets: `PAYMENT_WEBHOOK_SECRET` or provider-specific `PAYMENT_WEBHOOK_SECRET_JAZZCASH` / `PAYMENT_WEBHOOK_SECRET_EASYPAISA` when using external gateway adapters
- AUTH_COOKIE_CROSS_SITE=true only when the browser and backend are intentionally cross-origin; otherwise leave it false.
- TRUST_PROXY=true or 1

Web research is **off unless deliberately enabled**:

```
WEB_RESEARCH_ENABLED=false
```

If enabled, configure a real WEB_RESEARCH_API_KEY.

Never commit production secrets.

## Development

Backend:

```bash
cd backend
npm ci
cp .env.example .env
npm run prisma:migrate
npm run seed
npm run dev
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

The development environment may use local PostgreSQL and local storage. Hosted preview/production must use durable PostgreSQL and S3-compatible storage.

## Verification

Backend:

```bash
cd backend
npm ci
npx prisma validate
npx prisma generate
npm audit --audit-level=high
npm run test:unit
npm run test:integration
npm run build
```

Frontend:

```bash
cd frontend
npm ci
npm audit --audit-level=high
npm run build
```

Release verification also builds both Docker images and runs the authenticated browser/accessibility E2E suite against disposable PostgreSQL.

The authoritative CI workflow is:

```
backend tests/build
frontend build
Docker builds
browser/accessibility E2E
```

## Backup and disaster recovery

Backups are encrypted and contain the complete recovery dataset. Human-facing exports are intentionally not substitutes for DR backups.

Restore modes:

- DRY_RUN — validate without mutation
- MERGE — upsert backup rows while retaining rows absent from the backup
- REPLACE — replace represented application-table state and reconcile object storage

A production DR certification still requires an operator to perform a disposable-database recovery drill and retain evidence for authentication, students, finance, attendance, LMS, exams, documents, audit records and storage.

See:

- `docs/PRODUCTION_READINESS.md`
- `docs/DISASTER_RECOVERY.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_CLASSIFICATION.md`
- `docs/RELEASE_RUNBOOK.md`
- `docs/COMPETITOR_BENCHMARK.md`

## Vercel deployment policy

Repository configuration intentionally has:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

This keeps GitHub pushes from being treated as automatic Vercel releases. GitHub Actions remains the verification gate. Vercel production deployment should be performed deliberately after a release candidate is green.

The repository root `vercel.json` is the supported Vercel configuration for the repo-root deployment: it builds the Vite frontend from `frontend/`, serves `frontend/dist`, keeps Git-triggered Vercel deployment disabled, and provides the SPA fallback. `frontend/vercel.ts` is also kept as a supported frontend-root configuration for a Vercel project whose Root Directory is `frontend/`. API routing normally uses the Vercel `/api/*` proxy; `VITE_API_BASE_URL` is an optional direct-backend override when intentionally using a separate origin. `frontend/vercel.legacy.json` is retained only as an archival copy of the former hardcoded Vercel-backend routing configuration and is not active.

## Release checklist

Before real student data:

1. Verify the latest GitHub Actions run is green.
2. Run controlled Prisma migrations against the intended database.
3. Verify backend `/health` reports database connectivity.
4. Verify administrator login and refresh-token rotation.
5. Verify authorization with positive and negative role/scope cases.
6. Verify private object-storage upload/download.
7. Create and verify an encrypted backup.
8. Complete a disposable PostgreSQL DR drill.
9. Verify direct frontend routes such as `/admin` and `/dashboard`.
10. Confirm Preview and Production use different databases and secrets.
11. Deploy the release candidate manually.

Production readiness means both code evidence and operational evidence. A green CI run alone is not a production certification.

## Repository hygiene

`wwhs-digital-campus.zip` is retained as an archival source snapshot. The Git-tracked source tree is the authoritative implementation.

## License

Private school-system project. No production credentials or real student data belong in this repository.
