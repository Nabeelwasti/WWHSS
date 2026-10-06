import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
app.use((req, _res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  const sameOrigin = `${req.protocol}://${req.get("host")}`;
  if (env.corsOrigins.includes(origin) || origin === sameOrigin) return next();
  const error = new Error("CORS origin is not allowed");
  (error as Error & { status?: number }).status = 403;
  return next(error);
});
const corsAllowedOrigins = new Set([
  ...env.corsOrigins,
  ...(env.vercelUrl ? [`https://${env.vercelUrl}`] : []),
]);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || corsAllowedOrigins.has(origin)) return callback(null, true);
    callback(new Error("CORS origin is not allowed"));
  },
}));
app.use(express.json({ limit: "1mb" }));
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

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Please try again later." } });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/refresh", authLimiter);
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "You've asked a lot of questions this hour. Please try again later." } });
app.use("/api/ai", aiLimiter);
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please slow down and try again shortly." } });
app.use("/api", generalLimiter);
const expensiveOperationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: "This operation is temporarily rate-limited. Please try again later." } });
const backupOperationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Backup operations are temporarily rate-limited. Please try again later." } });
app.use("/api/storage/upload", expensiveOperationLimiter);
app.use("/api/documents", expensiveOperationLimiter);
app.use("/api/ai/assessment", expensiveOperationLimiter);
app.use("/api/backup", backupOperationLimiter);

const healthHandler = async (_req: express.Request, res: express.Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

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

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err === "object" && err && "status" in err && typeof (err as { status?: unknown }).status === "number"
    ? (err as { status: number }).status
    : 500;
  const requestId = res.getHeader("X-Request-ID");
  if (status >= 500) console.error({ requestId, error: err });
  res.status(status).json({ error: status === 403 ? "CORS origin is not allowed" : "Internal server error", requestId });
});

export default app;
