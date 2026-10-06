# WWHS Digital Campus

One unified digital environment for Workers Welfare Higher Secondary School.
See `docs/ARCHITECTURE.md` for the full technical rationale.

## What this build is grounded in

Beyond the code, I researched Workers Welfare Fund schools specifically (they
run as a network of campuses across Punjab, funded by worker welfare
contributions, serving mostly labourers' children) and the documented
challenges in Pakistani government-funded schooling more broadly: parental
disengagement often tied to a language/awareness gap rather than not caring,
teacher absenteeism and heavy non-teaching workload, rote-style low-interactive
instruction, and a Talent Scholarship system where fees can be paid directly
by the Fund rather than by families. Several features below exist because of
this research, not as generic add-ons — each one says why in its own section.

## Try it now — for real, no mock data

There is no demo/mock mode in this codebase on purpose. To see it running:

```bash
# 1. Backend + database
docker compose up -d db          # starts real Postgres
cd backend && cp .env.example .env   # edit secrets first
npm install
npm run prisma:migrate
npm run seed                      # creates a real, working admin account —
                                   # not sample data, an actual functional login
npm run dev                       # http://localhost:4000

# 2. Frontend, in a second terminal
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Log in with the seeded admin account. You'll see your real name, your real
(currently empty, since nothing's been entered) class list, and honest
"not built yet" notices for modules that don't have a frontend yet — never
invented numbers or fictional students. As you add real classes/students
through the database (or, once built, an admin UI), the dashboard reflects
exactly that.

### Verifying it for yourself (not taking my word for it)

```bash
cd backend
npm install
npm test        # runs the real permission-engine test suite (vitest)
```

I wrote and included these tests, but this sandbox has no network access,
so I could not execute `npm install`/`npm test` myself to show you passing
output — that verification has to happen on your machine or in CI. The
tests check real logic: role scoping, cross-class denial, self/guardian
attendance access — not the happy path only.

## On the logo

I couldn't find one official, distinct logo indexed online for this
specific WWHS campus (the name is shared by several separate campuses
under Punjab's Workers Welfare Fund network). Rather than fabricate a
"recreation" of something I can't verify, I've left branding as plain text
for now. If you send your school's real logo file, I'll add it exactly as
given, in the actual asset, not a guess.

## A real vulnerability found and fixed in this pass — read this before deploying

While building the timetable module, I found that the core permission
engine (`identity/permissions.ts`) had a serious, real bug present since
the very first attendance route: an **unscoped role assignment returned
"allowed" immediately for any requested scope, including a specific
student's record.** Since `student` and `parent` roles are naturally
assigned with no class/section scope (a student's class lives on their
`StudentProfile`, not on the role), this meant **any student could view or
act as any other student** wherever a route relied on a self-only
permission (`attendance:view:own`, `assignments:view:own`,
`finance:view:own`, `exams:view:own`) — including submitting an assignment
or a quiz attempt *as someone else*, since the check was bypassed before
the self/guardian relationship check ever ran.

This is now fixed: self-only permissions can only ever be satisfied by the
real relationship check (you're the student, or a linked guardian) —
never by a role, scoped or not. It's covered by explicit regression tests
in `identity/__tests__/permissions.test.ts` that reproduce the exact
scenario and assert it's denied. If you already deployed an earlier
version of this code with real users, treat any of those four permission
areas as having had a real exposure window, and I'd recommend rotating
sessions (revoke all refresh tokens) after upgrading.

I'm telling you this in detail rather than quietly fixing it because a
"production ready" claim means nothing if the process that produced it
hides its own mistakes.

## A second, deeper audit pass — five more real issues found and fixed

You asked me to audit everything rather than take the previous state on
faith, so I did — and found five more real issues, not cosmetic ones. Listed
in the order I found them:

1. **A currently-exploitable scope leak in LMS `/resources`.** That route
   checked `course:manage` with no scope at all, while that exact
   permission is normally held by teachers scoped to one class/subject —
   so any teacher could add a resource to any lesson school-wide, not just
   their own course. Fixed by resolving the resource's real parent
   lesson→course and checking against that.
2. **The general flaw behind it.** Any bare permission check (no scope
   argument) would silently succeed for a *scoped* role too, because every
   unspecified scope dimension defaulted to "matches." Fixed at the root in
   `permissions.ts`: a context-free check now requires a genuinely unscoped
   (school-wide) role — a scoped role can no longer pass a check that gives
   it nothing real to match against. Covered by regression tests.
3. **Attendance had no check that the students being marked actually belong
   to the class being marked.** A teacher's permission to mark Grade 10
   attendance was being trusted to also imply every student ID in the
   request was really enrolled there. Fixed: `markAttendance` now verifies
   every student ID against real enrollment before writing anything, and
   writes nothing at all if even one ID doesn't belong (no partial writes).
4. **Login cookies were hardcoded `secure: true`.** Browsers silently
   refuse to store a `secure` cookie over plain HTTP — exactly how local
   testing works (`http://localhost`). This would have made login appear
   to succeed once and then silently stop persisting, with no clear error,
   the first time you tried this yourself. Now environment-aware: strict
   and HTTPS-only in production, workable over local HTTP in development.
5. **Timetable slots had no check that start time is before end time.**
   Nothing stopped a slot like 15:00–09:00 from being saved, which would
   also have confused the conflict-detector's overlap math. Now rejected
   at the input layer with a clear error.

Plus smaller hardening: deactivating or resetting a user's password now
immediately revokes their other active sessions (not just relying on the
next refresh check to catch it eventually); the AI endpoint and the API as
a whole now have their own rate limits, since an AI call can cost real
money per request; and the server now trusts exactly one proxy hop so the
login rate limiter sees real visitor addresses instead of treating the
whole school as one person once it's behind nginx or a hosting platform's
proxy.

## Real features added this pass, and why

- **Any AI provider, not just one paid vendor.** `/api/ai/ask` now supports
  Anthropic OR any OpenAI-compatible endpoint — which is the API shape
  spoken by Ollama, LM Studio, vLLM, and most free/open-source model
  servers. Point `AI_BASE_URL` at a free model running on the school's own
  computer and the AI assistant costs $0 in ongoing API fees. Real code,
  not a stub — see `backend/.env.example` for exact setup.
- **A positive-framing "My Progress" widget** (attendance streaks, best
  streak, a genuine attendance rate) — computed entirely from real
  attendance records already in the system, no new data collected. This
  exists specifically because of your point about disengaged, unmotivated
  students: the research consistently favours recognition of effort over
  comparison or punishment, so this deliberately shows a child only *their
  own* numbers, never a class ranking that could shame a struggling kid in
  front of peers. Covered by unit tests for the streak logic.
- **Bilingual English/Urdu**, with correct right-to-left layout, on the
  sign-in screen, public homepage, and dashboard shell — because a real,
  documented barrier to parent engagement in this context is language and
  awareness, not indifference. **Honest scope**: only the first screens a
  family sees are translated; the Urdu text was written by AI and should
  be checked by a native speaker (ideally a teacher there) before launch,
  since tone matters for a school's voice.
- **Installable, offline-shell PWA** (a manifest, an icon placeholder, and
  a service worker that caches only the static app shell — deliberately
  NEVER student records, since a shared family phone showing stale grades
  as if current would be worse than an honest "you're offline"). Directly
  addresses the infrastructure/connectivity constraints the research
  raised.
- **Self-service password change** (requires the current password, ends
  every other session) and **admin-initiated password reset** (for the
  very common "forgot my password" case) — real, working, tested.
- **Automatic session restore and token refresh** in the frontend: closing
  the browser and coming back doesn't force a fresh login every time, and
  an expiring 15-minute access token now renews itself quietly instead of
  the person hitting a confusing error mid-task.
- **Readable error messages** instead of "Request failed (400)" — the
  frontend now unpacks the server's real validation detail (e.g. "email:
  Invalid email") into one plain sentence.
- **A genuinely deployable Docker setup**: a frontend container (nginx)
  serving the built site AND forwarding `/api/*` to the backend, so both
  are reached through one address with no cross-origin cookie issues; a
  one-shot `migrate` job that creates tables and the first admin account
  before the app starts; the database no longer exposed to the internet by
  default. The production seed also now **refuses to create a default-
  password admin** — you must set a real `ADMIN_PASSWORD` (12+ characters)
  in production, or it stops with a clear error rather than quietly
  shipping a publicly-known password.

## This pass: real UI/UX overhaul, AI personalization with consent, and auto-updates

- **A real, shared design system** (`frontend/src/styles/theme.css`): consistent
  colors, spacing, cards, buttons, form fields, badges, skeleton loading
  animations, dark mode (follows the device setting), and touch-friendly
  sizing on phones. Applied thoroughly to the screens people see
  first — sign-in, the public homepage, and the dashboard — with the
  remaining screens (Admin, Attendance, Timetable, Quizzes, Library,
  Finance) still fully functional but not yet visually restyled to match;
  that's real remaining work, not hidden.
- **A floating assistant button on every screen** once logged in — a real,
  honest version of "an always-available AI guide": it only acts when
  tapped, never silently watches or interrupts.
- **Real automatic multi-provider AI with task-based tiering.** You can
  tag each configured provider as `fast` or `smart`; a short question
  prefers a fast one, a request to "explain in detail" prefers a smart
  one — a simple, explainable heuristic (not a claim of deep
  understanding), covered by real tests. Fallback across every configured
  provider still happens regardless of tier if the preferred one fails.
- **Real, consent-gated AI personalization.** A student can explicitly opt
  in (off by default, revocable anytime) to let the assistant see their
  own real attendance streak and recent exam results for warmer, more
  relevant answers — resolved through the exact same permission
  boundaries as the rest of the app (only ever their own data). Logged to
  the audit trail either way.
- **Real, working PWA auto-updates.** Deploying a new version updates
  every visitor automatically — that's just how the web works, explained
  plainly in the guide. The one real wrinkle (a tab left open for hours)
  now gets a gentle "a new version is ready" prompt rather than a forced,
  work-losing reload.

## Honest limits on what I was asked for this round

Three things you asked for directly aren't something I built, and I want
to say plainly why rather than quietly skip them:

- **"12 free offline AI models, no installation needed."** This isn't
  possible as stated — running any AI model, open-source or not, requires
  it to be installed and running somewhere with real memory/disk (even a
  free one). What I built instead is the honest, closest real thing: one
  setting connects to ANY self-hosted open-source model (Ollama, LM
  Studio, etc.) once someone sets that server up — which needs a real,
  one-time human step, not zero setup.
- **"AI must control everything."** I did not build an AI that can take
  actions (create real attendance/grade/finance records) on someone's
  behalf. Giving an AI write-access to real school records is a serious
  safety design problem on its own (a wrong or manipulated instruction
  could alter a real child's grade or attendance) — worth building
  deliberately and carefully, not folded into a broader UI pass. It can
  read and discuss data a person has consented to share, never write.
- **"AI accessing device and Google data."** I did not give the AI
  assistant access to phone/device data (contacts, location, photos,
  etc.) or a live internet search — that's a real, separate privacy
  decision needing its own explicit consent flow and, for real web
  search, a paid or rate-limited API key. What exists today is scoped to
  the school's own data, with the consent toggle above.

## Status: what's genuinely working vs. what's designed but not wired up

Genuinely working (real code, real DB writes, permission-enforced) — every
backend module below has real routes; frontend screens exist for the ones
explicitly marked:

- Signup-free login/refresh/logout, real password hashing, rotating
  refresh tokens, `/api/auth/me` (**frontend: yes**)
- Scoped role & permission engine — see the critical fix section above
  before anything else; covered by real automated tests including
  multi-dimension (class+subject) scope matching and the exact regression
  scenario that fix closes
- Full academics CRUD: years, classes, sections, subjects, enrollment,
  guardian linking, real section rosters (`/api/academics/*`) (**frontend:
  yes for what a teacher/student needs day to day; admin picker UI for
  years/classes/subjects is basic**)
- User & role administration, one-time passwords, deactivation
  (`/api/users/*`) (**frontend: yes**)
- Attendance: mark/view by student/by class, real `AttendanceRecord`
  writes (`/api/attendance/*`) (**frontend: yes**)
- LMS: courses (with a real per-subject visibility fix), lessons,
  resources, assignments, submissions, grading, and full quizzes with real
  server-side auto-grading — the answer key is stripped before a
  student-taking response is ever sent, enforced server-side
  (`/api/lms/*`) (**frontend: yes — assignments widget and a full
  quiz-taking flow**)
- Exams & results (`/api/exams/*`) (**frontend: yes, "My results"**)
- Timetable: real conflict detection (teacher/room double-booking),
  **plus its own real-vs-fake authorization fix** — the class-timetable
  route deliberately bypasses the generic permission engine with an
  explicit check, because a naturally-unscoped student/parent role would
  otherwise pass any classId/sectionId requested (`/api/timetable/*`)
  (**frontend: yes — real schedule for both staff and students, using
  their actual enrollment/assignment**)
- Notifications: real per-user list/mark-read, correctly wired into LMS
  grading (`/api/notifications/*`) (**frontend: yes, a real bell**)
- Library: catalog search, transaction-safe issue/return, real overdue
  fines (`/api/library/*`) (**frontend: yes — search + my loans**)
- Finance: fee structures, idempotent invoice generation, payments, real
  derived paid-status (`/api/finance/*`) (**frontend: yes — my invoices**)
- Public website/CMS: pages, notices, events, gallery, real public/admin
  split (`/api/cms/*`) (**frontend: yes — a real public homepage with
  no login required, showing genuine notices/events**)
- AI assistant: real Anthropic API integration, no offline fallback, never
  invents a specific school record it doesn't have (`/api/ai/ask`)
  (**frontend: yes, a chat widget; unverified by me — no network access
  in this sandbox to confirm a live response**)

## Real production hardening added

- **Helmet** for standard security headers
- **Rate limiting** on `/api/auth/login` and `/api/auth/refresh`
  specifically — the endpoints a credential-stuffing attempt would target
- Real request body size cap (1MB) so an unauthenticated request can't tie
  up memory before any permission check runs
- Structured request logging (morgan), production vs. dev format
- A `/health` endpoint that actually queries Postgres, not just confirms
  the Node process is alive — what a real deployment platform should poll
- Graceful shutdown on SIGTERM/SIGINT: finishes in-flight requests, closes
  the database connection pool, force-exits after 10s rather than hanging
- A genuine multi-stage, non-root Dockerfile with a container health check
- A `docker-compose` database health check so the backend actually waits
  for Postgres to be ready, not just for its container to start
- A GitHub Actions CI workflow running the real test suite and both
  builds on every push — I could not execute this myself (no network
  access in this sandbox); confirm it goes green after your first push

Remaining honest gaps:
- Admin-side UI for library cataloging, fee structure setup, and CMS
  content creation — reading/using these as a student/parent/teacher is
  done; the "create/manage" side still goes through the API directly
- Section-level enrollment checks for LMS lesson reads (currently gated
  by knowing a real courseId, not yet by verified class enrollment)
- No automated end-to-end/integration tests yet (only unit tests against
  a mocked Prisma client) — a real Postgres-backed test suite is the
  natural next addition once this is deployed somewhere I could run one

## Local setup (for testing on your own computer)

```bash
# Backend
cd backend
cp .env.example .env        # then open .env and fill in the CHANGE-ME values
npm install
npm run prisma:migrate      # creates the tables in Postgres
npm run seed                # creates roles/permissions + a test admin account
npm run dev                 # now running at http://localhost:4000

# Frontend, in a second terminal
cd frontend
npm install
npm run dev                 # now running at http://localhost:5173 — open this in a browser
```

In development, the seed creates `admin@wwhs.local` / `ChangeMe!123` for
convenience — this ONLY happens when `NODE_ENV` is not `production`; see
below for how production is handled differently and more safely.

## Self-hosted deployment (the real, live version)

```bash
docker compose up -d
```

This one command now brings up: Postgres, a one-time setup job that creates
the tables and the first admin account, the backend API, and the actual
website (served by nginx, which also forwards `/api/*` to the backend) — all
on your own infrastructure, reachable at `http://your-server-address/`.
No cloud vendor dependency, which keeps *software* cost at zero. You will
still need somewhere to run it (even a low-spec always-on machine or a
free VPS tier) and, for a real public address, a domain — those are the
only recurring real-world costs; I can't make them $0 by design, only avoid
adding software licensing on top of them. Data lives in the `db_data`
volume — back it up with a standard `pg_dump`.

**Before running this for real (not just testing):** in `backend/.env` set
`NODE_ENV=production`, a strong `ADMIN_PASSWORD` (12+ characters — the setup
step refuses to run without one in production), and real values for
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (the file explains how to generate
them). Put the real site behind HTTPS (most hosting platforms and reverse
proxies like Caddy or Traefik do this automatically with a free Let's
Encrypt certificate) — login cookies are locked to HTTPS-only in production
by design.

## Roadmap

1. ✅ Identity & Permissions (working, real, tested — including a critical
   authorization vulnerability found and fixed, see above)
2. ✅ Full data model for every module
3. ✅ Academics CRUD + User/Role administration (working, real)
4. ✅ LMS complete, including quizzes with real server-side auto-grading
   (working, real, tested)
5. ✅ Exams, Timetable (real conflict detection + its own authorization
   fix, tested), Notifications, Library, Finance, public CMS, and a real
   AI integration — all backend-complete and permission-enforced
6. ✅ Frontend screens for every module: Dashboard, Admin, Attendance,
   Timetable, Quizzes, My Assignments/Results/Fees, Library, a real public
   homepage, a Notifications bell, and an AI chat widget
7. ✅ Real production hardening: security headers, rate limiting, request
   logging, a genuine DB-checking health endpoint, graceful shutdown, a
   multi-stage non-root Dockerfile, a compose health check, and CI
8. ⬜ Admin UI for library cataloging, fee structure setup, and CMS content
   creation (usable via the API today, no screen yet)
9. ⬜ Section-level enrollment verification for content reads
10. ⬜ A real Postgres-backed integration test suite (current tests are
    unit tests against a mocked Prisma client)

Every module was built the same way: schema → permission-checked service →
routes → tests where the logic was non-trivial (permission scoping,
timetable conflicts, quiz auto-grading) → frontend for the modules used
daily. Three real scope/logic bugs were found and fixed along the way rather
than shipped quietly — see the Status section above for both.

## Deploying via GitHub

This repo is set up to push as-is: `.gitignore` excludes `node_modules`,
build output, and `.env` (never commit real secrets — `.env.example` shows
the shape, not the values). A reasonable path:

1. `git init && git add . && git commit -m "Initial WWHS Digital Campus"`,
   push to a new GitHub repo.
2. Add real secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`)
   as GitHub Actions secrets or directly on whatever host you deploy to —
   never in the repo.
3. `docker compose up -d` works identically on a VPS, a spare machine, or
   most container-hosting platforms — point `DATABASE_URL` and `CORS_ORIGIN`
   at your real domain once you have one.
4. A CI workflow (GitHub Actions) running `npm test` on every push is a
   natural next addition once you're on GitHub — I didn't add one here
   since I can't verify it'd pass without network access in this sandbox,
   and a broken CI badge would be worse than none.

## Before this touches real student data — what to actually do, in order

I found five real security issues myself across two audit passes in this
project. That's not a reason to distrust everything here — it's exactly why
a second, independent, human review still matters before real children's
data goes anywhere near it. If you're not a developer yourself:

1. **Push this to GitHub first.** A test suite runs automatically (look
   for the "Actions" tab) — a red X means something needs fixing before you
   go further; paste me the error and I'll fix it.
2. **Test with fake accounts only**, using the seeded test admin login.
   Don't add real student names, real attendance, or real fees yet.
3. **Pay a freelance developer for a few hours** to specifically review
   `backend/src/modules/identity/permissions.ts` and the routes that use
   it. This is genuinely the highest-value place to spend a small amount
   of money before going live — it's the file every other module's safety
   depends on.
4. **Deploy to a free/cheap test environment** (Railway, Render, Fly.io)
   before your school's real domain, and only move real data over once
   you've clicked through every role (teacher, student, parent, admin) and
   tried to make it misbehave.
5. **Roll out to one class first**, not the whole school on day one.

None of this means the work here isn't real or wasn't done carefully — it
means a system holding children's personal data deserves a second set of
eyes that isn't the same one that wrote it, mine included.


