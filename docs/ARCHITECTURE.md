# WWHS Digital Campus — Architecture

## 1. Decision: single self-hostable monolith, modular internally

Rejected: microservices (unnecessary operational overhead for a single school),
no-code SaaS stack (vendor lock-in, no data ownership), separate LMS+ERP+CMS
products stitched together (breaks the "one product" requirement — every
integration seam becomes a place where identity, permissions, or UX diverge).

Chosen: **one deployable application**, internally organized as modules
(identity, academics, attendance, LMS, exams, timetable, library, finance,
communication, AI, storage, backup) that all share one database, one auth system, one
permission engine. Modules are separated by code boundaries, not network
boundaries. This can be split into services later if scale ever demands it —
nothing here prevents that migration.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Database | PostgreSQL | ACID, mature, free, excellent support for row-level security (used for permission enforcement), self-hostable, huge ecosystem |
| Backend | Node.js + TypeScript + Express | One language across stack lowers maintenance burden for a small team; TypeScript catches whole classes of bugs before production; huge library ecosystem; easy to self-host in a single container |
| ORM | Prisma | Type-safe queries, migrations, works well with Postgres RLS patterns |
| Auth | Self-hosted, sessions or JWT + refresh tokens, argon2 password hashing | No dependency on a third-party identity vendor; school owns the credentials |
| Frontend | React + TypeScript + Vite | Fast dev cycle, huge component ecosystem, easy PWA support, good mobile performance |
| File storage | Local disk / Private Storage service | MIME and size validation, safe filename generation, session-authorized retrieval |
| Deployment | Docker Compose (Postgres + app + reverse proxy) | Single `docker compose up` gets a school running on their own hardware or any VPS |
| AI layer | Provider-agnostic adapter (Anthropic / Gemini / OpenAI compatible) | Never hard-locks the AI assistant to one vendor; permission engine gates what context reaches the model |
| Backups | Encrypted AES-256-GCM Backup Engine | Off-host encrypted database backups, JSON export, and verified recovery drills |

## 3. Identity & permission model (the foundation everything else depends on)

- `users` — one row per human. Never one row per role.
- `roles` — Super Admin, Principal, Vice Principal, Administrator, Teacher,
  Class Teacher, Subject Teacher, Coordinator, Librarian, Accountant,
  Counselor, Staff, Student, Parent — extensible, not an enum baked into code.
- `user_roles` — many-to-many, with optional scope columns (`class_id`,
  `section_id`, `subject_id`, `department_id`) so "Subject Teacher for
  Grade 10 Physics" is a real, queryable fact, not an assumption.
- `permissions` — fine-grained capability strings, e.g.
  `attendance:mark`, `attendance:view:own_class`, `grades:enter`,
  `finance:view`, `student:view:full_profile`.
- `role_permissions` — which permissions a role grants, optionally scoped.
- `relationships` — explicit table for parent↔student, class_teacher↔class,
  subject_teacher↔class+subject.

**Enforcement happens in one place**: a permission-check function/middleware
that every API route calls before touching data.

## 4. Key Subsystems & Capabilities

### AI Assessment Studio
- Multi-step workflow: Select → Generate → Preview → Edit → Approve → Print A4 → Ingest & Auto-score objective questions → AI-suggested subjective scoring → Teacher final authority → Remedial feedback.
- Supports English and Urdu (اردو), A/B/C/D question versions, answer keys, and marking schemes.

### Document Engine & A4 Printing
- School-branded document generation using authoritative school header metadata.
- Outputs printable A4 payloads and CSV/PDF data for Result Cards, Report Cards, Transcripts, Fee Receipts, Transfer Certificates, Fee Statements, and Attendance Logs.

### Encrypted Backups & Recovery
- Complete database table JSON serialization.
- AES-256-GCM encryption using secure scrypt key derivation.
- Automated recovery drill verification to ensure off-host backups decrypt and parse with complete schema integrity.

### Secure Private File Storage
- Storage directory isolated from public HTTP routes.
- Strict MIME type and 10MB size validation.
- Sanitized filenames with non-colliding random hashes.
- Route authorization check before serving any private document file.

### Correlation & Operational Logging
- Express middleware injects `X-Request-ID` on all incoming requests for request tracing.
- Structured morgan logging and PostgreSQL liveness health check at `/health`.
