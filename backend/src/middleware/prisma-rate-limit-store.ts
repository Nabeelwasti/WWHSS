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

  constructor(private readonly namespace: string) {}

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const namespacedKey = `${this.namespace}:${key}`;
    const rows = await prisma.$queryRaw<Array<{ totalHits: number; resetTime: Date }>>`
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
    await prisma.$executeRaw`
      UPDATE "rate_limit_counters"
      SET "count" = GREATEST("count" - 1, 0), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = ${namespacedKey}
    `;
  }

  async resetKey(key: string): Promise<void> {
    const namespacedKey = `${this.namespace}:${key}`;
    await prisma.$executeRaw`DELETE FROM "rate_limit_counters" WHERE "key" = ${namespacedKey}`;
  }
}
