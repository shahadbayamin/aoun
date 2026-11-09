import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pickDatabaseUrl } from "./db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  // Serverless hosting: many short-lived instances, so each keeps only a couple of connections (the database limits them).
  const serverless = !!process.env.VERCEL;
  const adapter = new PrismaPg({ connectionString: pickDatabaseUrl()!, ...(serverless ? { max: 1, idleTimeoutMillis: 2_000 } : {}) });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
