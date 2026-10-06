import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(`WWHS Digital Campus API listening on :${env.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
