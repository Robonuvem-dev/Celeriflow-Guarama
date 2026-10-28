import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function createPrismaClient(connectionString = process.env.DATABASE_URL!): PrismaClient {
  const adapter = new PrismaNeon({
    connectionString,
  });
  return new PrismaClient<Prisma.PrismaClientOptions>({
    adapter,
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
