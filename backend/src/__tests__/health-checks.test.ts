import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

vi.mock("../db/client.js", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ result: 1 }]),
  },
}));

import { app } from "../app.js";
import { prisma } from "../db/client.js";

describe("health and readiness endpoints", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockClear();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1, rateLimitTable: "rate_limit_buckets" }] as never);
  });

  it.each(["/api/health", "/api/ready"])("%s bypasses the PostgreSQL rate-limit table", async (path) => {
    const response = await fetch(`${baseUrl}${path}`);

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.$queryRaw)).toHaveBeenCalledTimes(1);
    const body = await response.json() as { status: string; database?: string };
    expect(["ok", "ready"]).toContain(body.status);
    expect(body.database).toBe("connected");
  });

  it("allows same-origin credentialed requests and CORS preflight", async () => {
    const origin = baseUrl;

    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: origin },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");

    const preflight = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("reports not-ready when the required rate-limit table is missing", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ rateLimitTable: null }] as never);

    const response = await fetch(`${baseUrl}/api/ready`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "not_ready" });
  });

  it("returns degraded health instead of an unhandled 500 when the database health query fails", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded", database: "unreachable" });
  });
});
