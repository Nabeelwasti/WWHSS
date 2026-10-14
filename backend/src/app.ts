import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createRequire } from "node:module";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import crypto from "node:crypto";
import "./middleware/express-async-errors.js";
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
import { aiAssessmentRouter } from "./modules/ai/ai-assessment.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { backupRouter } from "./modules/backup/backup.routes.js";
import { storageRouter } from "./modules/storage/storage.routes.js";
import { parentRouter } from "./modules/parent/parent.routes.js";
import { schoolRouter } from "./modules/school/school.routes.js";
import { operationsRouter } from "./modules/operations/operations.routes.js";
import { paymentsRouter } from "./modules/finance/payments.routes.js";

const require = createRequire(import.meta.url);
const helmet = require("helmet") as (options?: Record<string, unknown>) => express.RequestHandler;

export const app = express();

app.use((req, res, next) => {
  const supplied = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"].trim() : "";
  const reqId = /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader("X-Request-ID", reqId);
  next();
});

app.set(
  "trust proxy",
  env.trustProxy === "true" || env.trustProxy === "1"
    ? 1
    : env.trustProxy === "false" || env.trustProxy === "0"
    ? false
    : env.trustProxy
);

app.use(helmet());

function isCorsOriginAllowed(origin: string | undefined, sameOrigin: string): boolean {
  if (!origin) return true;
  return origin === sameOrigin || env.corsOrigins.includes(origin);
}

// Keep the allowlist check and the CORS response policy identical. In particular,
// same-origin requests are valid even when CORS_ORIGIN only lists remote browser
// origins; rejecting them in the second middleware breaks JSON POST/preflight calls.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const sameOrigin = `${req.protocol}://${req.get("host")}`;
  if (!isCorsOriginAllowed(origin, sameOrigin)) {
    const error = new Error("CORS origin is not allowed") as Error & { status?: number; code?: string };
    error.status = 403;
    error.code = "CORS_ORIGIN_DENIED";
    return next(error);
  }

  return cors({
    credentials: true,
    origin(requestOrigin, callback) {
      if (isCorsOriginAllowed(requestOrigin, sameOrigin)) return callback(null, true);
      callback(new Error("CORS origin is not allowed"));
    },
  })(req, res, next);
});
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
  },
}));
app.use(cookieParser());

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const event = {
      timestamp: new Date().toISOString(),
      requestId: res.getHeader("X-Request-ID"),
      userId: (req as express.Request & { userId?: string }).userId ?? null,
      method: req.method,
      route: req.route?.path ?? req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    };
    if (env.nodeEnv !== "test") console.log(JSON.stringify(event));
  });
  next();
});

import { PostgresRateLimitStore } from "./middleware/rate-limit-store.js";

const authLoginStore = new PostgresRateLimitStore("auth-login-ip");
const authRefreshStore = new PostgresRateLimitStore("auth-refresh");
const authAccountStore = new PostgresRateLimitStore("auth-login-account");
const aiStore = new PostgresRateLimitStore("ai");
const generalStore = new PostgresRateLimitStore("general-api");
const expensiveOperationStore = new PostgresRateLimitStore("expensive-operation");
const backupOperationStore = new PostgresRateLimitStore("backup-operation");
const paymentWebhookStore = new PostgresRateLimitStore("payment-webhook");

const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: authLoginStore,
  message: { error: "Too many login attempts. Please try again later." },
});

const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: authRefreshStore,
  message: { error: "Too many token refresh attempts. Please try again later." },
});

const authAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: authAccountStore,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const ip = req.ip ? `ip:${ipKeyGenerator(req.ip, 56)}` : "unknown";
    return email ? `${email}:${ip}` : ip;
  },
  message: { error: "Too many login attempts for this account from your address. Please try again later." },
});


// Health/readiness endpoints intentionally bypass API rate-limit storage so
// operators can distinguish database/schema problems from rate-limit failures.
const healthHandler = async (_req: express.Request, res: express.Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
};
app.get("/", (_req, res) => {
  res.json({ service: "wwhss-api", status: "ok" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const readinessHandler = async (_req: express.Request, res: express.Response) => {
  try {
    // Database connectivity alone is insufficient: all API routes use the
    // PostgreSQL rate-limit store, so readiness must verify its table exists.
    const rows = await prisma.$queryRaw<Array<{ rateLimitTable: string | null }>>`
      SELECT to_regclass('rate_limit_buckets')::text AS "rateLimitTable"
    `;
    if (!rows[0]?.rateLimitTable) {
      res.status(503).json({ status: "not_ready" });
      return;
    }
    res.json({ status: "ready", database: "connected" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
};

app.get("/ready", readinessHandler);

app.get("/api/health", healthHandler);
app.get("/api/ready", readinessHandler);

app.use("/api/auth/login", authLoginLimiter);
app.use("/api/auth/login", authAccountLimiter);
app.use("/api/auth/refresh", authRefreshLimiter);

const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, store: aiStore, message: { error: "You've asked a lot of questions this hour. Please try again later." } });
app.use("/api/ai", aiLimiter);
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, store: generalStore, message: { error: "Too many requests. Please slow down and try again shortly." } });
app.use("/api", generalLimiter);
const expensiveOperationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, store: expensiveOperationStore, message: { error: "This operation is temporarily rate-limited. Please try again later." } });
const backupOperationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, store: backupOperationStore, message: { error: "Backup operations are temporarily rate-limited. Please try again later." } });
const paymentWebhookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, store: paymentWebhookStore, message: { error: "Payment webhook rate limit exceeded. Please retry later." } });
app.use("/api/storage/upload", expensiveOperationLimiter);
app.use("/api/documents", expensiveOperationLimiter);
app.use("/api/ai/assessment", expensiveOperationLimiter);
app.use("/api/backup", backupOperationLimiter);
app.use("/api/payments/webhooks", paymentWebhookLimiter);

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
app.use("/api/ai/assessment", aiAssessmentRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/backup", backupRouter);
app.use("/api/storage", storageRouter);
app.use("/api/parent", parentRouter);
app.use("/api/school", schoolRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/payments", paymentsRouter);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Route not found", requestId: res.getHeader("X-Request-ID") });
  return next();
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err === "object" && err && "status" in err && typeof (err as { status?: unknown }).status === "number"
    ? (err as { status: number }).status
    : 500;
  const requestId = res.getHeader("X-Request-ID");
  const errorCode = typeof err === "object" && err && "code" in err && typeof (err as { code?: unknown }).code === "string"
    ? (err as { code: string }).code
    : undefined;
  if (status >= 500) {
    console.error({
      event: "http_request_failed",
      requestId,
      status,
      errorCode,
      errorType: err instanceof Error ? err.name : "UnknownError",
    });
  }
  const publicError = status === 403
    ? errorCode === "CORS_ORIGIN_DENIED"
      ? "CORS origin is not allowed"
      : "Forbidden"
    : "Internal server error";
  res.status(status).json({ error: publicError, requestId });
});

export default app;
