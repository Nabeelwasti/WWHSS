# WWHSS Release Runbook

## Production topology

Browser → Vercel/static frontend → Cloud Run Express API → managed PostgreSQL + private S3/R2.

Preview and Production must use isolated databases, storage locations and secrets. The Vercel frontend normally reaches the backend through the same-origin `/api/*` proxy; `VITE_API_BASE_URL` is optional for an intentionally direct backend origin.

## Release order

1. Require green GitHub CI on the exact release commit.
2. Build the immutable backend image.
3. Run `npx prisma migrate deploy` exactly once against the target database.
4. Deploy the immutable Cloud Run revision with the injected `PORT`.
5. Verify `/health` and `/ready`.
6. Verify the Vercel `/api/*` proxy reaches the intended backend deployment and does not return frontend HTML or a 404.
7. Run authentication, authorization, upload, document, finance and representative E2E smoke tests.
8. Shift production traffic only after readiness and smoke checks pass.

The application container must start with `node dist/server.js`; it must never run database migrations as part of normal startup.

## Vercel

Automatic Git deployment is intentionally disabled in repository configuration. The supported Vercel configurations are `vercel.json` for a repo-root project and `frontend/vercel.ts` for a `frontend/` Root Directory project. Both provide the `/api/*` backend proxy and SPA fallback. `VITE_API_BASE_URL` remains an optional direct-origin override. Do not put secrets or credentials into frontend source or Vite environment variables.

## Database

Use a pooled runtime connection string for Cloud Run application traffic and a direct migration connection where the database provider requires it. Never run migrations concurrently from multiple application instances.

## Uploads

The backend accepts private uploads up to exactly 10 MiB. The global JSON parser is not the upload boundary. Upload requests use an explicit raw binary parser and storage validation.

## Disaster recovery

A restore is not complete until:

- encrypted backup integrity is validated;
- storage objects are staged and verified;
- PostgreSQL restore commits;
- object-storage reconciliation succeeds;
- refresh sessions are invalidated;
- a restore checkpoint is marked `COMPLETE`.

Any failed post-start restore is marked `FAILED`; it must not be reported as successful.

## Secrets

Never log, commit, or place in frontend JavaScript:

- passwords
- JWTs
- refresh tokens
- AI/API keys
- backup encryption keys
- cloud credentials
- private student data

## Evidence

A green CI run is necessary but is not by itself production certification. Retain evidence of the migration, readiness, smoke tests, backup verification and disposable-database DR drill for every production release.
