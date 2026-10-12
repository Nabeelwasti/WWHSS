import { describe, it, expect } from "vitest";
import http from "node:http";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { SharedRateLimitStore } from "../middleware/rate-limit-store.js";

describe("Rate Limiting, Proxy Trust & Forwarded-IP Isolation", () => {
  it("isolates client IPs and rejects spoofed headers when proxy is not blindly trusting multi-hop headers", async () => {
    const app = express();
    app.set("trust proxy", 1); // Only trust single immediate hop (reverse proxy)

    const store = new SharedRateLimitStore();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 2,
      store,
      keyGenerator: (req) => {
        const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
        const ip = req.ip || "unknown";
        return email ? `${email}:${ip}` : ip;
      },
      message: { error: "rate limit exceeded" },
    });

    app.get("/test-login", limiter, (req, res) => {
      res.json({ ip: req.ip });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Helper
      const sendReq = async (forwardedFor: string, email: string) => {
        return fetch(`${baseUrl}/test-login?email=${encodeURIComponent(email)}`, {
          headers: { "X-Forwarded-For": forwardedFor },
        });
      };

      // Request 1 from client A with spoofed client B in header:
      // With trust proxy = 1, Express treats the rightmost IP before proxy as client IP
      const res1 = await sendReq("1.1.1.1, 2.2.2.2", "victim@school.edu");
      expect(res1.status).toBe(200);

      const res2 = await sendReq("1.1.1.1, 2.2.2.2", "victim@school.edu");
      expect(res2.status).toBe(200);

      // Third attempt from same IP triggers rate limit
      const res3 = await sendReq("1.1.1.1, 2.2.2.2", "victim@school.edu");
      expect(res3.status).toBe(429);

      // But attempt from a different IP for the same victim account is NOT locked out!
      const resDifferentIp = await sendReq("3.3.3.3, 4.4.4.4", "victim@school.edu");
      expect(resDifferentIp.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("shared rate limit store tracks hits across multiple instances", async () => {
    const store = new SharedRateLimitStore();
    store.init({ windowMs: 60000 } as any);

    const resA = await store.increment("account:1.1.1.1");
    expect(resA.totalHits).toBe(1);

    const resB = await store.increment("account:1.1.1.1");
    expect(resB.totalHits).toBe(2);

    await store.decrement("account:1.1.1.1");
    const resC = await store.increment("account:1.1.1.1");
    expect(resC.totalHits).toBe(2);
  });
});
