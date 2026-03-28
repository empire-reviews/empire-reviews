// Envoy sanitization moved to central location

import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

let prisma: PrismaClient;

const DB_URL = (process.env.DATABASE_URL || "").trim();

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({
    datasources: { db: { url: DB_URL } },
  });
} else {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      datasources: { db: { url: DB_URL } },
    });
  }
  prisma = global.prismaGlobal;
}

/**
 * Retry a Prisma operation up to `retries` times with exponential backoff.
 * Handles transient Vercel cold-start DB connection timeouts gracefully.
 */
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        const delay = 500 * Math.pow(2, i); // 500ms, 1000ms, 2000ms
        console.warn(`[db] Operation failed (attempt ${i + 1}/${retries}), retrying in ${delay}ms…`, (error as Error).message);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export { withRetry };
export default prisma;
