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
  DATABASE_URL: isProductionOrPreview ? z.string().min(1, "DATABASE_URL is required in production/preview") : z.string().default("postgresql://wwhs:wwhs@localhost:5432/wwhs_digital_campus"),
  JWT_ACCESS_SECRET: isProductionOrPreview ? z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters in production/preview") : z.string().min(16).default("dev-jwt-access-secret-key-must-be-at-least-32-bytes!"),
  JWT_REFRESH_SECRET: isProductionOrPreview ? z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters in production/preview") : z.string().min(16).default("dev-jwt-refresh-secret-key-must-be-at-least-32-bytes!"),
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
  LIBRARY_FINE_PER_DAY: z.coerce.number().min(0).default(5),
  TRUST_PROXY: z.string().default("0"),
  MAX_DAILY_AI_REQUESTS: z.coerce.number().int().min(1).default(100),
  MAX_AI_INPUT_CHARS: z.coerce.number().int().min(10).default(2000),
  MAX_AI_OUTPUT_TOKENS: z.coerce.number().int().min(10).default(800),
  WEB_RESEARCH_ENABLED: z.preprocess((value) => value === undefined ? isProductionOrPreview : value === true || value === "true" || value === "1", z.boolean()),
  WEB_RESEARCH_API_KEY: z.string().optional(),
  WEB_RESEARCH_ENDPOINT: z.string().url().default("https://api.search.brave.com/res/v1/web/search"),
}).refine((data) => {
  if (isProductionOrPreview) {
    if (data.JWT_ACCESS_SECRET.includes("dev-jwt") || data.JWT_ACCESS_SECRET.includes("CHANGE-ME")) return false;
    if (data.JWT_REFRESH_SECRET.includes("dev-jwt") || data.JWT_REFRESH_SECRET.includes("CHANGE-ME")) return false;
    if (data.BACKUP_ENCRYPTION_KEY.includes("dev-backup") || data.BACKUP_ENCRYPTION_KEY.includes("CHANGE-ME")) return false;
  }
  return true;
}, { message: "Default/development secrets cannot be used in production or preview deployments" }).refine((data) => {
  if (!isProductionOrPreview) return true;
  if (data.STORAGE_PROVIDER === "local" || data.BACKUP_PROVIDER === "local" || data.BACKUP_PROVIDER === "memory") return false;
  if (!data.S3_BUCKET || !data.S3_ACCESS_KEY_ID || !data.S3_SECRET_ACCESS_KEY) return false;
  const origins = data.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !/^https:\/\//i.test(origin) || /localhost|127\.0\.0\.1/i.test(origin))) return false;
  if (!["true", "1"].includes(data.TRUST_PROXY)) return false;
  if (data.WEB_RESEARCH_ENABLED && !data.WEB_RESEARCH_API_KEY) return false;
  return true;
}, { message: "Preview/production requires durable S3-compatible storage/backups, complete S3 credentials, HTTPS CORS, TRUST_PROXY=true/1, and a web-research key when research is enabled" });

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
  databaseUrl: rawEnv.DATABASE_URL,
  jwtAccessSecret: rawEnv.JWT_ACCESS_SECRET,
  jwtRefreshSecret: rawEnv.JWT_REFRESH_SECRET,
  backupEncryptionKey: rawEnv.BACKUP_ENCRYPTION_KEY,
  storageProvider: rawEnv.STORAGE_PROVIDER,
  backupProvider: rawEnv.BACKUP_PROVIDER,
  s3Bucket: rawEnv.S3_BUCKET,
  s3Region: rawEnv.S3_REGION,
  s3AccessKeyId: rawEnv.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: rawEnv.S3_SECRET_ACCESS_KEY,
  s3Endpoint: rawEnv.S3_ENDPOINT,
  accessTokenTtlMin: rawEnv.ACCESS_TOKEN_TTL_MIN,
  refreshTokenTtlDays: rawEnv.REFRESH_TOKEN_TTL_DAYS,
  corsOrigin: rawEnv.CORS_ORIGIN,
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
