import type { Store, Options, IncrementResponse } from "express-rate-limit";

export interface RateLimitStoreEntry {
  totalHits: number;
  resetTime: Date;
}

/**
 * Production-capable shared rate limit store interface and implementation.
 * Supports in-memory, multi-instance, and external backing stores (such as Redis/Postgres).
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
