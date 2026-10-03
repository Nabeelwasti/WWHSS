import { PrismaClient } from "@prisma/client";

// Single shared client. In dev with hot-reload this avoids exhausting
// Postgres connections by attaching the instance to globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
