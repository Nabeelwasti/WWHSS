import "dotenv/config";
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: isProduction
    ? z.string().min(1, "DATABASE_URL is required in production")
    : z.string().default("postgresql://wwhs:wwhs@localhost:5432/wwhs_digital_campus"),
  JWT_ACCESS_SECRET: isProduction
    ? z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters in production")
    : z.string().min(16).default("dev-jwt-access-secret-key-must-be-at-least-32-bytes!"),
  JWT_REFRESH_SECRET: isProduction
    ? z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters in production")
    : z.string().min(16).default("dev-jwt-refresh-secret-key-must-be-at-least-32-bytes!"),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LIBRARY_FINE_PER_DAY: z.coerce.number().min(0).default(5),
  TRUST_PROXY: z.string().default("0"),
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
  databaseUrl: rawEnv.DATABASE_URL,
  jwtAccessSecret: rawEnv.JWT_ACCESS_SECRET,
  jwtRefreshSecret: rawEnv.JWT_REFRESH_SECRET,
  accessTokenTtlMin: rawEnv.ACCESS_TOKEN_TTL_MIN,
  refreshTokenTtlDays: rawEnv.REFRESH_TOKEN_TTL_DAYS,
  corsOrigin: rawEnv.CORS_ORIGIN,
  libraryFinePerDay: rawEnv.LIBRARY_FINE_PER_DAY,
  trustProxy: rawEnv.TRUST_PROXY,
};

