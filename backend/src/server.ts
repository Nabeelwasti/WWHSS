import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";

let server: ReturnType<typeof app.listen> | undefined;

// When running as a standalone server (Docker, Cloud Run, local development)
if (!process.env.VERCEL) {
  server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`WWHS Digital Campus API listening on :${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down gracefully…`);
    server?.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export { app, server };
export default app;
