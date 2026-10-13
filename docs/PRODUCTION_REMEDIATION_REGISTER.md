# WWHSS Digital Campus — Production Remediation Register

**Baseline audited:** `main@f7576007f18441858b339fb4f3cd805e30b61434`  
**Audit branch:** `audit/production-readiness-2026-10-14`  
**Last updated:** 2026-10-14  
**Purpose:** track code changes separately from release evidence and school policy decisions. A green CI run is not a blanket production-readiness certificate.

## Implemented in this change

- [x] Removed `prisma migrate deploy` from `backend/vercel.json` build command. A deployment build now compiles the application only.
- [x] Added a CI invariant that fails if the Vercel backend build is changed to run migrations, and verifies that the governed Cloud Run release workflow remains the migration owner.
- [x] Added a CI check that decodes the bundled Noto Naskh Arabic font and validates the TrueType signature.
- [x] Clarified migration ownership in the release runbook and production-readiness guide.
- [x] Made data-retention approval an explicit governance gate rather than implying the technical team can choose legal retention durations.
- [x] Added scheduled CodeQL JavaScript/TypeScript security analysis (`.github/workflows/codeql.yml`).
- [x] Added automated Dependabot update PRs for backend/frontend npm dependencies and GitHub Actions.
- [x] Attempted a pull-request dependency review gate; the exact PR run confirmed GitHub dependency review is unavailable because the repository dependency graph is disabled. Removed the always-failing workflow rather than masking that limitation.
- [x] Added section- and department-scope permission regression tests alongside existing class, subject, student-self and guardian checks.
- [x] Made post-commit backup-restore failures return HTTP 503 with the restore checkpoint ID and an explicit incomplete-recovery signal; this improves observability but does not replace a recovery drill.
- [x] Added a permission-protected restore-checkpoint summary endpoint so backup operators can inspect recent restore state without exposing retained raw error text.
- [x] Added an admin backup-management panel for recent restore checkpoints and surfaced the checkpoint ID when an incomplete restore returns HTTP 503.
- [x] Routed the main authenticated campus shell's navigation, group headings, workspace descriptions, search labels, role labels and loading text through paired English/Urdu translation keys; broader component-level localization remains outstanding.
- [x] Normalized IPv6 client addresses in the account-specific login rate-limit key so address rotation within a subnet does not trivially bypass the per-account limiter.
- [x] Validated configured CORS/public-app origins as canonical HTTPS origins (not URLs with paths, embedded credentials, or loopback hosts), preventing configurations that pass startup validation but cannot match browser Origin headers.

## Audit notes for this pass

- The Vercel backend project is not the documented production topology. The supported topology is static Vercel frontend calling Cloud Run directly; production API origin, database migration owner, and live deployment state must be confirmed before release. The backend build must remain compile-only and must not apply migrations.
- Account-specific login throttling previously keyed custom IP values without IPv6 subnet normalization. The audit branch corrects this with a local normalizer backed by the explicitly declared `ipaddr.js` dependency and adds a regression test.
- CORS origin validation previously checked only an HTTPS prefix and had a malformed loopback regex in the `PUBLIC_APP_ORIGIN` check. The audit branch now requires canonical origins and rejects loopback hosts.
- No CI result is claimed for this audit branch until its checks complete.

## Required before production can be certified

These items require real environment access, school-owner decisions, or dedicated test fixtures; repository edits alone cannot truthfully mark them complete.

| Priority | Gate | Evidence required | State |
|---|---|---|---|
| P0 | Confirm actual production API topology | Record the live frontend API origin and backend provider; confirm Vercel is not independently migrating a shared production DB | Pending operator verification |
| P1 | Exact-commit release | Successful protected release workflow on the chosen commit; record image digest, Cloud Run revision and traffic promotion | Pending release execution |
| P1 | Preview/production isolation | Verify database, storage bucket, credentials and AI/provider settings are distinct | Pending environment evidence |
| P1 | Migration rehearsal | Apply all pending migrations to a sanitized production-like clone; record locks, duration, rollback/forward plan | Pending disposable clone |
| P1 | Authorization matrix | Generate a route inventory and exercise allow/deny cases for every role and object scope, including unrelated students/guardians and cross-class/section/subject/department access | Expanded unit coverage for class, section, subject, department, self and guardian relationships; exhaustive route-by-role matrix still pending |
| P1 | Disaster recovery | Restore a real encrypted backup to disposable PostgreSQL and isolated object storage; validate FKs, business invariants, object references, interruption and post-commit storage failure | Failure is now surfaced as incomplete with checkpoint ID; isolated restore and interruption drills pending |
| P1 | Autonomous jobs | Implement persisted jobs with idempotency, leases, retry/backoff, concurrency controls, dead-letter state, audit events, operator retry/cancel and alerts; approval-gate high-impact work | Not implemented / not certified |
| P1 | Private storage | Exercise cross-scope upload/download, malformed/signature-mismatched files, size boundaries, storage outage and orphan reconciliation on the target runtime | Existing unit tests; live matrix pending |
| P1 | Finance | Exercise duplicate/out-of-order webhooks, signature/replay, refund/reversal, concurrent posting, rounding and approval/reconciliation against a test gateway | Partial tests; gateway certification pending |
| P2 | Localization and accessibility | Complete user-visible English/Urdu translation audit; desktop/mobile keyboard, screen-reader, focus, error and RTL browser journeys | Shell and major operations feedback/navigation are localized; form labels/placeholders/enums, backend error translation and full RTL/accessibility journeys remain pending |
| P2 | Supply-chain assurance | Add and triage secret scanning, SAST, SBOM/provenance, license policy and reviewed/pinned actions; retain results for exact release commit | Partial: CodeQL and Dependabot added; dependency review blocked until GitHub dependency graph is enabled in repository settings; secret scanning, SBOM/provenance, license policy, action pinning and alert triage pending |
| P2 | Load/soak and resilience | Measure DB pool saturation, rate-limit store outage, login/refresh, AI quotas, uploads and backup/restore under expected peak load | Pending |
| P2 | Governance | Name policy owners; approve retention/deletion, backup expiry, audit access, AI consent/minimization, incident/breach response and staff offboarding | School management approval pending |
| P2 | Independent review | Independent security review/penetration test and remediation evidence | Pending |

## Safety invariants

1. Never run production migrations from a build hook, application startup, or more than one release owner.
2. Never claim backup recoverability based only on envelope validation or a dry run.
3. Never allow AI to bypass backend identity, permission or object-scope checks.
4. AI-generated assessments remain drafts until an authorized teacher reviews and approves them.
5. Finance posting, payroll, final grade publication, destructive restore, privilege changes and public publishing require explicit authorization/approval; autonomous jobs must not silently perform these actions.
6. Never automate permanent deletion of protected student, safeguarding, finance, academic or audit records until the retention schedule is formally approved.
7. Keep credentials, real student records and production dumps out of source control, CI logs, frontend bundles and test artifacts.

## Release decision

**Current decision: NOT CERTIFIED for unrestricted production use.** The latest recorded baseline CI run was green, but release, recovery, complete route-scope assurance, durable job automation, governance and independent security evidence remain unproven. Re-evaluate each row against artifacts from the exact release commit; do not change a state to complete based on configuration presence alone.
