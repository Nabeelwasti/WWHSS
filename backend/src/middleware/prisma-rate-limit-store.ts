import { prisma } from "../db/client.js";

/**
 * A PostgreSQL-backed express-rate-limit store.
 *
 * Every increment is an atomic upsert, so concurrent Cloud Run instances
 * share the same counter/window rather than maintaining independent memory
 * buckets. The namespace prevents different limiters from sharing keys.
 */
export class PrismaRateLimitStore {
  private windowMs = 15 * 60 * 1000;
  private operations = 0;
  private fallbackMode = false;
  private readonly fallbackAllowed = process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development";
  private readonly fallbackCounters = new Map<string, { totalHits: number; resetTime: Date }>();

  constructor(private readonly namespace: string) {}

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  private incrementFallback(key: string, now: Date): { totalHits: number; resetTime: Date } {
    const existing = this.fallbackCounters.get(key);
    if (!existing || existing.resetTime.getTime() <= now.getTime()) {
      const fresh = { totalHits: 1, resetTime: new Date(now.getTime() + this.windowMs) };
      this.fallbackCounters.set(key, fresh);
      return fresh;
    }
    existing.totalHits += 1;
    return { ...existing };
  }

  private isMissingTable(error: unknown): boolean {
    const value = error as { code?: string; meta?: { code?: string; message?: string }; message?: string };
    return value?.code === "P2021" ||
      value?.meta?.code === "42P01" ||
      /relation ["']rate_limit_counters["'] does not exist/i.test(value?.meta?.message ?? value?.message ?? "");
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const namespacedKey = `${this.namespace}:${key}`;
    if (this.fallbackMode) return this.incrementFallback(namespacedKey, now);
    let rows: Array<{ totalHits: number; resetTime: Date }>;
    try {
      rows = await prisma.$queryRaw<Array<{ totalHits: number; resetTime: Date }>>`
      INSERT INTO "rate_limit_counters" ("key", "count", "resetAt", "createdAt", "updatedAt")
      VALUES (${namespacedKey}, 1, ${resetAt}, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_counters"."resetAt" <= ${now} THEN 1
          ELSE "rate_limit_counters"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "rate_limit_counters"."resetAt" <= ${now} THEN ${resetAt}
          ELSE "rate_limit_counters"."resetAt"
        END,
        "updatedAt" = ${now}
      RETURNING "count" AS "totalHits", "resetAt" AS "resetTime"
    `;
    } catch (error) {
      if (this.fallbackAllowed && this.isMissingTable(error)) {
        this.fallbackMode = true;
        console.warn("Rate-limit migration is missing; using per-instance fallback only for preview/development.");
        return this.incrementFallback(namespacedKey, now);
      }
      throw error;
    }
    const row = rows[0];
    if (!row) throw new Error("Rate-limit counter update returned no row");

    this.operations += 1;
    if (this.operations % 500 === 0) {
      try {
        await prisma.$executeRaw`
          DELETE FROM "rate_limit_counters"
          WHERE "key" IN (
            SELECT "key" FROM "rate_limit_counters"
            WHERE "resetAt" <= ${now}
            ORDER BY "resetAt" ASC
            LIMIT 500
          )
        `;
      } catch {
        // Cleanup is best-effort; enforcement itself remains database-backed.
      }
    }

    return { totalHits: Number(row.totalHits), resetTime: new Date(row.resetTime) };
  }

  async decrement(key: string): Promise<void> {
    const namespacedKey = `${this.namespace}:${key}`;
    if (this.fallbackMode) {
      const existing = this.fallbackCounters.get(namespacedKey);
      if (existing) existing.totalHits = Math.max(0, existing.totalHits - 1);
      return;
    }
    await prisma.$executeRaw`
      UPDATE "rate_limit_counters"
      SET "count" = GREATEST("count" - 1, 0), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = ${namespacedKey}
    `;
  }

  async resetKey(key: string): Promise<void> {
    const namespacedKey = `${this.namespace}:${key}`;
    if (this.fallbackMode) {
      this.fallbackCounters.delete(namespacedKey);
      return;
    }
    await prisma.$executeRaw`DELETE FROM "rate_limit_counters" WHERE "key" = ${namespacedKey}`;
  }
}
