import "dotenv/config";
import { z } from "zod";

const isVercelPreview = process.env.VERCEL_ENV === "preview";
const isVercelProduction = process.env.VERCEL_ENV === "production";
const isNodeProduction = process.env.NODE_ENV === "production";
const isVercelDeployment = isVercelPreview || isVercelProduction;
const isProductionOrPreview = isNodeProduction || isVercelDeployment;

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_URL: z.string().optional(),
  DATABASE_URL: isProductionOrPreview ? z.string().min(1, "DATABASE_URL is required in production/preview") : z.string().default("postgresql://wwhs:wwhs@localhost:5432/wwhs_digital_campus"),
  JWT_ACCESS_SECRET: isProductionOrPreview ? z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters in production/preview") : z.string().min(16).default("dev-jwt-access-secret-key-must-be-at-least-32-bytes!"),
  JWT_REFRESH_SECRET: isProductionOrPreview ? z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters in production/preview") : z.string().min(16).default("dev-jwt-refresh-secret-key-must-be-at-least-32-bytes!"),
  JWT_ISSUER: z.string().min(1).default("wwhss-api"),
  JWT_AUDIENCE: z.string().min(1).default("wwhss-web"),
  BACKUP_ENCRYPTION_KEY: isProductionOrPreview ? z.string().min(32, "BACKUP_ENCRYPTION_KEY must be at least 32 characters in production/preview") : z.string().min(16).default("dev-backup-encryption-key-must-be-at-least-32-bytes!"),
  STORAGE_PROVIDER: z.enum(["local", "s3", "cloud"]).default("local"),
  BACKUP_PROVIDER: z.enum(["local", "s3", "cloud", "memory"]).default("local"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  AUTH_COOKIE_CROSS_SITE: z.preprocess((value) => value === undefined ? false : value === true || value === "true" || value === "1", z.boolean()),
  LIBRARY_FINE_PER_DAY: z.coerce.number().min(0).default(5),
  TRUST_PROXY: z.string().default("0"),
  ALLOW_LOCAL_PERSISTENCE: z.preprocess((value) => value === undefined ? false : value === true || value === "true" || value === "1", z.boolean()),
  MAX_DAILY_AI_REQUESTS: z.coerce.number().int().min(1).default(100),
  MAX_AI_INPUT_CHARS: z.coerce.number().int().min(10).default(2000),
  MAX_AI_OUTPUT_TOKENS: z.coerce.number().int().min(10).default(800),
  WEB_RESEARCH_ENABLED: z.preprocess((value) => value === undefined ? process.env.WEB_SEARCH_ENABLED : value, z.preprocess((value) => value === undefined ? false : value === true || value === "true" || value === "1", z.boolean())),
  /** @deprecated Legacy alias retained for compatibility; use WEB_RESEARCH_ENABLED. */
  WEB_SEARCH_ENABLED: z.string().optional(),
  WEB_RESEARCH_API_KEY: z.string().optional(),
  WEB_RESEARCH_ENDPOINT: z.string().url().default("https://api.search.brave.com/res/v1/web/search"),
}).superRefine((data, ctx) => {
  if (!isProductionOrPreview) return;

  const issue = (path: string, message: string) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  };

  if (data.JWT_ACCESS_SECRET.includes("dev-jwt") || data.JWT_ACCESS_SECRET.includes("CHANGE-ME")) issue("JWT_ACCESS_SECRET", "must be a unique non-development secret in production/preview");
  if (data.JWT_REFRESH_SECRET.includes("dev-jwt") || data.JWT_REFRESH_SECRET.includes("CHANGE-ME")) issue("JWT_REFRESH_SECRET", "must be a unique non-development secret in production/preview");
  if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) issue("JWT_REFRESH_SECRET", "must differ from JWT_ACCESS_SECRET");
  if (data.JWT_ISSUER === "wwhss-api") issue("JWT_ISSUER", "must be explicitly configured in production/preview");
  if (data.JWT_AUDIENCE === "wwhss-web") issue("JWT_AUDIENCE", "must be explicitly configured in production/preview");
  if (data.BACKUP_ENCRYPTION_KEY.includes("dev-backup") || data.BACKUP_ENCRYPTION_KEY.includes("CHANGE-ME")) issue("BACKUP_ENCRYPTION_KEY", "must be a unique non-development key in production/preview");

  const durablePersistenceRequired = isVercelDeployment || !data.ALLOW_LOCAL_PERSISTENCE;
  if (durablePersistenceRequired && (data.STORAGE_PROVIDER === "local" || data.BACKUP_PROVIDER === "local" || data.BACKUP_PROVIDER === "memory")) {
    issue("STORAGE_PROVIDER", "hosted production/preview requires durable storage");
    issue("BACKUP_PROVIDER", "hosted production/preview requires durable backups");
  }
  if (durablePersistenceRequired && !data.S3_BUCKET) issue("S3_BUCKET", "is required when hosted durable storage/backups are enabled");
  if (data.AUTH_COOKIE_CROSS_SITE && data.CORS_ORIGIN.split(",").some((origin) => !/^https:\/\//i.test(origin.trim()))) issue("CORS_ORIGIN", "must contain only HTTPS origins when AUTH_COOKIE_CROSS_SITE=true");
  if (!!data.S3_ACCESS_KEY_ID !== !!data.S3_SECRET_ACCESS_KEY) {
    issue("S3_ACCESS_KEY_ID", "and S3_SECRET_ACCESS_KEY must be configured together");
    issue("S3_SECRET_ACCESS_KEY", "and S3_ACCESS_KEY_ID must be configured together");
  }
  if (data.S3_ENDPOINT && !/^https:\/\//i.test(data.S3_ENDPOINT)) issue("S3_ENDPOINT", "must use HTTPS in production/preview");
  const origins = data.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) issue("CORS_ORIGIN", "must contain at least one HTTPS origin");
  else if (origins.some((origin) => !/^https:\/\//i.test(origin) || /localhost|127\.0\.0\.1/i.test(origin))) issue("CORS_ORIGIN", "must contain only non-local HTTPS origins in production/preview");
  if (!["true", "1"].includes(data.TRUST_PROXY)) issue("TRUST_PROXY", "must be true or 1 behind Vercel/another trusted proxy");
  if (data.WEB_RESEARCH_ENABLED && !data.WEB_RESEARCH_API_KEY) issue("WEB_RESEARCH_API_KEY", "is required when WEB_RESEARCH_ENABLED=true");
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error(`Environment validation failed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
}

const rawEnv = parsed.data;
export const env = {
  port: rawEnv.PORT,
  nodeEnv: rawEnv.NODE_ENV,
  vercelEnv: rawEnv.VERCEL_ENV,
  vercelUrl: rawEnv.VERCEL_URL,
  databaseUrl: rawEnv.DATABASE_URL,
  jwtAccessSecret: rawEnv.JWT_ACCESS_SECRET,
  jwtRefreshSecret: rawEnv.JWT_REFRESH_SECRET,
  jwtIssuer: rawEnv.JWT_ISSUER,
  jwtAudience: rawEnv.JWT_AUDIENCE,
  backupEncryptionKey: rawEnv.BACKUP_ENCRYPTION_KEY,
  storageProvider: rawEnv.STORAGE_PROVIDER,
  backupProvider: rawEnv.BACKUP_PROVIDER,
  s3Bucket: rawEnv.S3_BUCKET,
  s3Region: rawEnv.S3_REGION,
  s3AccessKeyId: rawEnv.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: rawEnv.S3_SECRET_ACCESS_KEY,
  allowLocalPersistence: rawEnv.ALLOW_LOCAL_PERSISTENCE,
  s3Endpoint: rawEnv.S3_ENDPOINT,
  accessTokenTtlMin: rawEnv.ACCESS_TOKEN_TTL_MIN,
  refreshTokenTtlDays: rawEnv.REFRESH_TOKEN_TTL_DAYS,
  corsOrigin: rawEnv.CORS_ORIGIN,
  authCookieCrossSite: rawEnv.AUTH_COOKIE_CROSS_SITE,
  corsOrigins: rawEnv.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean),
  libraryFinePerDay: rawEnv.LIBRARY_FINE_PER_DAY,
  trustProxy: rawEnv.TRUST_PROXY,
  maxDailyAiRequests: rawEnv.MAX_DAILY_AI_REQUESTS,
  maxAiInputChars: rawEnv.MAX_AI_INPUT_CHARS,
  maxAiOutputTokens: rawEnv.MAX_AI_OUTPUT_TOKENS,
  webResearchEnabled: rawEnv.WEB_RESEARCH_ENABLED,
  webResearchApiKey: rawEnv.WEB_RESEARCH_API_KEY,
  webResearchEndpoint: rawEnv.WEB_RESEARCH_ENDPOINT,
};
