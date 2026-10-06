import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
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

app.use(cors({ origin: (origin, callback) => { if (!origin || env.corsOrigins.includes(origin)) return callback(null, true); return callback(new Error("CORS origin is not allowed")); }, credentials: true }));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/refresh", authLimiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You've asked a lot of questions this hour. Please try again later." },
});
app.use("/api/ai", aiLimiter);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});
app.use("/api", generalLimiter);

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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
