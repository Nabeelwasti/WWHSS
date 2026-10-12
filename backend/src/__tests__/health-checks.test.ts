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
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }] as never);
  });

  it.each(["/api/health", "/api/ready"])("%s bypasses the PostgreSQL rate-limit table", async (path) => {
    const response = await fetch(`${baseUrl}${path}`);

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.$queryRaw)).toHaveBeenCalledTimes(1);
    const body = await response.json() as { status: string; database?: string };
    expect(["ok", "ready"]).toContain(body.status);
    expect(body.database).toBe("connected");
  });

  it("returns degraded health instead of an unhandled 500 when the database health query fails", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded", database: "unreachable" });
  });
});
