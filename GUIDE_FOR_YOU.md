# WWHSS Digital Campus — Simple Current Guide

This guide describes the implementation currently on `main`. It avoids promising disconnected or fabricated functionality.

## 1. What WWHSS is

WWHSS is a real school-management platform built with React 18/Vite, Node.js 24/TypeScript/Express, Prisma 5 and PostgreSQL.

It includes student/staff/guardian management, academics and enrollment, attendance, LMS/quizzes, exams/results, timetable, library, CMS, parent portal, welfare-first finance, documents, private storage, encrypted backups, AI, Assessment Studio, Urdu/English RTL support, PWA/accessibility coverage and Docker/self-hosting.

There is no fake-data fallback. If the backend is unavailable, the frontend shows the real connection/error state.

## 2. Architecture

Hosted:

`Browser → Vercel frontend → same-origin /api proxy → Vercel Express backend → PostgreSQL + private S3/R2`

The frontend API client still supports an explicit `VITE_API_BASE_URL` when a separate backend origin is intentionally required. When it is empty, the Vercel frontend proxy is the authoritative hosted path; this avoids a frontend/backend origin mismatch and keeps refresh cookies same-site.

Local/self-hosted:

`Browser → nginx/Vite frontend → same-origin /api → Express → PostgreSQL + configured storage`

Preview and Production must use separate backend origins, databases, storage and secrets.

## 3. Vercel

The repository root `vercel.json` is the supported repo-root Vercel configuration. It builds the Vite frontend from `frontend/`, serves `frontend/dist`, provides the SPA fallback and intentionally keeps automatic Git deployments disabled.

A Vercel project can instead set Root Directory to `frontend/`; `frontend/vercel.ts` is provided for that supported layout.

Vercel frontend deployments use the repository's `/api/*` proxy to the stable backend service. `VITE_API_BASE_URL` is optional and is used only when an operator intentionally chooses a direct backend origin.

Do not place secrets, tokens or credentials in frontend code or Vite environment variables.

## 4. Authentication

Access JWTs are short-lived. Refresh tokens are hashed, HttpOnly, rotated and revoked on logout, deactivation and password change, with replay/reuse detection.

Same-origin deployments use Strict cookies.

Only for intentional cross-origin browser/backend deployments:

```
AUTH_COOKIE_CROSS_SITE=true
```

This requires HTTPS CORS and uses Secure + HttpOnly + SameSite=None cookies.

## 5. Finance

Funding records are authoritative for invoice calculation on the actual billing/due date.

Policies: FULLY_WAIVED, PARTIALLY_WAIVED, STANDARD and CUSTOM.

The implementation prevents overlapping funding periods, over-waivers and overpayments and uses serializable transactions for concurrent finance operations. Invoice generation is idempotent by fee structure + student + billing period.

## 6. Documents

Official documents read authoritative `SchoolProfile` data and persistent `DocumentSequence` numbering.

Supported formats are PDF, HTML, CSV and XLSX, including Urdu/Arabic/English Unicode. Referenced student/staff/class/teacher/room/notice/event objects are authorization-checked.

## 7. Private storage

Uploads are authenticated, permission-checked and limited to 10 MiB. MIME type, extension and file signature are validated and storage keys are generated safely.

Private downloads use database ownership/scope authorization, safe Content-Disposition, no-store and no-sniff headers.

Hosted Preview/Production use S3/R2/cloud storage and fail closed rather than silently switching to local storage.

## 8. Backups and recovery

Backups use AES-256-GCM with a deployment-specific encryption key and a random salt/IV per backup.

Restore modes:

- DRY_RUN — read-only validation
- MERGE — dependency-safe upsert
- REPLACE — dependency-safe replacement of the represented application dataset

MERGE/REPLACE are preceded by DRY_RUN validation.

Restore checkpoints progress through:

`STARTED → STORAGE_STAGED → DATABASE_COMMITTED → COMPLETE`

Failures become `FAILED`. Historical refresh-token sessions are never restored.

## 9. AI and Assessment Studio

AI uses real configured providers only; there is no fake/offline answer source. Provider failures are retried within bounded limits and provider health is protected by a circuit breaker.

AI remains permission/scope/consent/usage aware and audited. Online research is disabled unless deliberately enabled and configured.

Assessment Studio preserves the real Select → Generate → Preview → Edit → Approve → Publish/Lock → Print/Export → Answer Sheet → Objective Auto-score → AI Suggested Subjective Score → Teacher Final Authority lifecycle.

## 10. Hosted configuration

Before real school data, configure at least:

- DATABASE_URL
- strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (they may be the same strong value)
- non-default JWT_ISSUER and JWT_AUDIENCE
- BACKUP_ENCRYPTION_KEY
- STORAGE_PROVIDER=s3 or cloud
- BACKUP_PROVIDER=s3 or cloud
- S3_BUCKET and S3_REGION
- S3 credentials only when the provider requires them; if one explicit credential is set, set the pair
- HTTPS CORS_ORIGIN
- TRUST_PROXY=true or 1
- VITE_API_BASE_URL only when intentionally using a direct backend origin
- AUTH_COOKIE_CROSS_SITE=true only when intentionally cross-origin

Web research stays disabled unless deliberately configured.

## 11. Release

Do not put real student data into an unverified deployment.

Release order:

1. Green GitHub CI on the exact commit.
2. Controlled Prisma migration.
3. Immutable backend container deployment.
4. Verify /health and /ready.
5. Verify authentication and authorization.
6. Verify private upload/download.
7. Create and verify an encrypted backup.
8. Perform a disposable PostgreSQL restore drill.
9. Verify frontend routes and configured API origin.

A green CI run is necessary, but production certification also requires the real deployment environment to be configured and tested.
