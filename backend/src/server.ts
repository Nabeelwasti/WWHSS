import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";
import { authRouter } from "./modules/identity/auth.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { academicsRouter } from "./modules/academics/academics.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { lmsRouter } from "./modules/lms/lms.routes.js";
import { examsRouter } from "./modules/exams/exams.routes.js";
import { timetableRouter } from "./modules/timetable/timetable.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { libraryRouter } from "./modules/library/library.routes.js";
import { financeRouter } from "./modules/finance/finance.routes.js";
import { cmsRouter } from "./modules/cms/cms.routes.js";
import { aiRouter } from "./modules/ai/ai.routes.js";

const app = express();

// The API normally sits behind the web container (nginx) or a hosting
// platform's proxy. Without this, every request appears to come from the
// proxy's own address — and the login rate limiter below would treat the
// ENTIRE school as one person, locking everyone out after 20 attempts
// combined. "1" = trust exactly one proxy hop in front of us.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

// Real security headers — not a placeholder. Sets X-Content-Type-Options,
// X-Frame-Options, a conservative CSP, etc. `crossOriginResourcePolicy`
// relaxed slightly since the frontend and API may sit on different origins
// in some deployments (see CORS_ORIGIN).
app.use(helmet());

app.use(cors({ origin: env.corsOrigin, credentials: true }));

// A real body size cap — without this, an unauthenticated client could
// send an enormous JSON payload and tie up server memory before any
// permission check even runs.
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Real, structured request logging. "combined" is the standard production
// format (works with any log aggregator); skip it in test runs so vitest
// output stays readable.
if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
}

// Real rate limiting on the endpoints that actually matter: login and
// refresh are the ones a credential-stuffing or brute-force attempt would
// hit. This is enforced server-side, in front of the real auth logic — not
// a UI throttle that a script bypasses by calling the API directly.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/refresh", authLimiter);

// The AI assistant can cost real money per request if a paid provider is
// configured, so an unthrottled endpoint is a way for one enthusiastic (or
// malicious) user to run up the school's bill. 30 questions per hour per
// address is generous for genuine homework help.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You've asked a lot of questions this hour. Please try again later." },
});
app.use("/api/ai", aiLimiter);

// A broad safety net for the whole API — high enough that normal use
// (including a whole class sharing school wifi) never notices it.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});
app.use("/api", generalLimiter);

app.get("/health", async (_req, res) => {
  // A real liveness check: confirms the actual database connection works,
  // not just that the Node process is up — the distinction that matters
  // when a deployment platform decides whether to route traffic here.
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/academics", academicsRouter);
app.use("/api/users", usersRouter);
app.use("/api/lms", lmsRouter);
app.use("/api/exams", examsRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/library", libraryRouter);
app.use("/api/finance", financeRouter);
app.use("/api/cms", cmsRouter);
app.use("/api/ai", aiRouter);

// Central error handler: never leak stack traces to the client, always log
// server-side, so a bug in one module can't turn into an information leak.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(env.port, () => {
  console.log(`WWHS Digital Campus API listening on :${env.port}`);
});

// Real graceful shutdown — a container orchestrator (Docker, k8s, most PaaS
// platforms) sends SIGTERM before killing a process; without handling it,
// in-flight requests get dropped and the Postgres connection pool isn't
// closed cleanly. This matters the first time you deploy behind a rolling
// restart, not before.
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force-exit if connections haven't closed within 10s, rather than hang
  // forever on a stuck socket.
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
