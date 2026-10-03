# WWHS Digital Campus — Architecture

## 1. Decision: single self-hostable monolith, modular internally

Rejected: microservices (unnecessary operational overhead for a single school),
no-code SaaS stack (vendor lock-in, no data ownership), separate LMS+ERP+CMS
products stitched together (breaks the "one product" requirement — every
integration seam becomes a place where identity, permissions, or UX diverge).

Chosen: **one deployable application**, internally organized as modules
(identity, academics, attendance, LMS, exams, timetable, library, finance,
communication, AI) that all share one database, one auth system, one
permission engine. Modules are separated by code boundaries, not network
boundaries. This can be split into services later if scale ever demands it —
nothing here prevents that migration.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Database | PostgreSQL | ACID, mature, free, excellent support for row-level security (used for permission enforcement), self-hostable, huge ecosystem |
| Backend | Node.js + TypeScript + Express (or Fastify) | One language across stack lowers maintenance burden for a small team; TypeScript catches whole classes of bugs before production; huge library ecosystem; easy to self-host in a single container |
| ORM | Prisma | Type-safe queries, migrations, works well with Postgres RLS patterns |
| Auth | Self-hosted, sessions or JWT + refresh tokens, argon2 password hashing | No dependency on a third-party identity vendor; school owns the credentials |
| Frontend | React + TypeScript + Vite, Tailwind CSS | Fast dev cycle, huge component ecosystem, easy PWA support, good mobile performance |
| File storage | Local disk (or S3-compatible MinIO if self-hosted object storage is wanted) | Avoids mandatory cloud dependency; MinIO gives an S3 API without vendor lock-in |
| Background jobs | BullMQ + Redis (optional; can start with a simple cron table) | Notifications, report generation, scheduled attendance alerts |
| Deployment | Docker Compose (Postgres + Redis + app + reverse proxy) | Single `docker compose up` gets a school running on their own hardware or any VPS |
| AI layer | Provider-agnostic adapter (Anthropic API by default, swappable) | Never hard-locks the AI assistant to one vendor; the permission engine gates what context reaches the model, not the model itself |

Nothing here is mandatory dogma — e.g. Fastify instead of Express, or SQLite
for a very small deployment, are reasonable substitutions. The two decisions
that matter most and should **not** be casually changed are: (1) one
database/one auth for the whole product, (2) permissions enforced at the
data-access layer, never only in the UI.

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
  subject_teacher↔class+subject. This is what stops "a teacher can see every
  student" — access is derived from an explicit relationship row, not from
  job title alone.

**Enforcement happens in one place**: a permission-check function/middleware
that every API route calls before touching data, backed by Postgres
row-level security policies as a second, database-level line of defense (so
even a bug in application code can't leak cross-student data). The frontend
hides UI it has no permission for, but that is a convenience, never the
security boundary.

## 4. Module map (how "one dashboard" is built from many domains)

Every module exposes:
1. A Postgres schema (its own tables, foreign keys into `users`/`classes`)
2. A service layer (business logic, permission checks)
3. REST (or GraphQL, decide once frontend needs are clearer) endpoints
4. Frontend "widgets" that a role's dashboard composes automatically based
   on that user's permissions — this is what makes it feel like one product:
   the dashboard doesn't know about "the LMS" or "the ERP", it just asks
   "what widgets is this user authorized to see" and renders them.

Modules, in build order (each depends only on ones above it):
1. **Identity & permissions** (this is step 1, non-negotiable)
2. **Academics** — academic years, classes, sections, subjects, enrollment
3. **Attendance**
4. **LMS** — lessons, resources, assignments, quizzes, gradebook
5. **Exams & results**
6. **Timetable**
7. **Communication & notifications**
8. **Library**
9. **Finance/fees**
10. **Public website/CMS** (lowest technical risk, can be built anytime,
    including in parallel by a different contributor)
11. **AI assistant layer** — sits on top of everything, calls into the same
    permission-checked service layer other modules use, so it can never see
    more than the requesting user could see through the UI.

## 5. What "complete" means in practice

A project like this is genuinely built in phases by a real team over months.
I'm building it the same way, just faster and solo: working, tested code for
one module before starting the next, so at every point there's a real,
runnable product — not a large pile of unfinished stubs. Current phase:
**Identity & Permissions core** (see `/backend`).
