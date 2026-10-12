import type { Store, Options, IncrementResponse } from "express-rate-limit";
import { prisma } from "../db/client.js";

export interface RateLimitStoreEntry {
  totalHits: number;
  resetTime: Date;
}

/**
 * Process-local rate-limit store for development and isolated unit tests only.
 * Production must use PostgresRateLimitStore to share counters across instances.
 */
export class SharedRateLimitStore implements Store {
  private hits = new Map<string, RateLimitStoreEntry>();
  private windowMs: number = 60 * 1000;
  private timer?: NodeJS.Timeout;

  init(options: Options): void {
    this.windowMs = options.windowMs;
    // Periodic sweep to prevent unbounded memory growth across keys
    this.timer = setInterval(() => this.sweep(), Math.min(this.windowMs, 60000));
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits.entries()) {
      if (entry.resetTime.getTime() <= now) {
        this.hits.delete(key);
      }
    }
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now();
    let entry = this.hits.get(key);

    if (!entry || entry.resetTime.getTime() <= now) {
      entry = {
        totalHits: 1,
        resetTime: new Date(now + this.windowMs),
      };
      this.hits.set(key, entry);
      return {
        totalHits: entry.totalHits,
        resetTime: entry.resetTime,
      };
    }

    entry.totalHits += 1;
    return {
      totalHits: entry.totalHits,
      resetTime: entry.resetTime,
    };
  }

  async decrement(key: string): Promise<void> {
    const entry = this.hits.get(key);
    if (entry && entry.totalHits > 0) {
      entry.totalHits -= 1;
    }
  }

  async resetKey(key: string): Promise<void> {
    this.hits.delete(key);
  }

  async resetAll(): Promise<void> {
    this.hits.clear();
  }

  shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}

/**
 * PostgreSQL-backed store shared across application instances.
 * Use a unique namespace per express-rate-limit limiter.
 */
export class PostgresRateLimitStore implements Store {
  private windowMs = 60_000;
  private cleanupCounter = 0;
  readonly namespacePrefix: string;

  constructor(namespace: string) {
    if (!/^[a-z0-9-]{1,64}$/i.test(namespace)) {
      throw new Error("Rate-limit namespace must be 1-64 alphanumeric or hyphen characters");
    }
    this.namespacePrefix = `${namespace}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const storageKey = this.namespacePrefix + key;
    const rows = await prisma.$queryRaw<Array<{ totalHits: number; resetTime: Date }>>`
      INSERT INTO "rate_limit_buckets" ("key", "total_hits", "reset_time")
      VALUES (${storageKey}, 1, NOW() + (${this.windowMs} * INTERVAL '1 millisecond'))
      ON CONFLICT ("key") DO UPDATE SET
        "total_hits" = CASE
          WHEN "rate_limit_buckets"."reset_time" <= NOW() THEN 1
          ELSE "rate_limit_buckets"."total_hits" + 1
        END,
        "reset_time" = CASE
          WHEN "rate_limit_buckets"."reset_time" <= NOW()
            THEN NOW() + (${this.windowMs} * INTERVAL '1 millisecond')
          ELSE "rate_limit_buckets"."reset_time"
        END
      RETURNING "total_hits" AS "totalHits", "reset_time" AS "resetTime"
    `;
    const row = rows[0];
    if (!row) throw new Error("PostgreSQL rate-limit store did not return an incremented counter");

    this.cleanupCounter += 1;
    if (this.cleanupCounter % 1000 === 0) {
      void prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "reset_time" <= NOW()`.catch((error) => {
        console.error("Rate-limit bucket cleanup failed", error);
      });
    }
    return { totalHits: Number(row.totalHits), resetTime: new Date(row.resetTime) };
  }

  async decrement(key: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "rate_limit_buckets"
      SET "total_hits" = GREATEST("total_hits" - 1, 0)
      WHERE "key" = ${this.namespacePrefix + key} AND "reset_time" > NOW()
    `;
  }

  async resetKey(key: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "key" = ${this.namespacePrefix + key}`;
  }

  async resetAll(): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM "rate_limit_buckets"
      WHERE LEFT("key", LENGTH(${this.namespacePrefix})) = ${this.namespacePrefix}
    `;
  }

  shutdown(): void {
    // No timers or background workers are held by this store.
  }
}
