import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.DATABASE_URL_UNPOOLED].find((u) => !!u && /^postgres(ql)?:\/\//.test(u))! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
