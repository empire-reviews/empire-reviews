// Envoy sanitization moved to central location

import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

let prisma: PrismaClient;

/**
 * DATABASE_URL vs DIRECT_URL — two distinct connection strings:
 *
 * - DATABASE_URL: the Supabase/Neon PgBouncer **pooler** URL (port 6543), with
 *   `?pgbouncer=true&connection_limit=1` appended. Used for all runtime queries
 *   from the Vercel serverless functions. The pooler is required because each
 *   serverless invocation opens its own connection and the pooler multiplexes
 *   them; `connection_limit=1` keeps a single short-lived connection per
 *   invocation so we don't exhaust the pool during cold-start storms.
 * - DIRECT_URL: the **direct** Postgres connection (port 5432, no PgBouncer).
 *   Used by Prisma for migrations only (`prisma migrate deploy`). PgBouncer in
 *   transaction-pooling mode does not support the prepared statements /
 *   advisory locks that migrations need, so migrations must bypass the pooler.
 *   Configured via `directUrl = env("DIRECT_URL")` in schema.prisma.
 *
 * Runtime queries here intentionally use DATABASE_URL (the pooler).
 */
// Ensure connection_limit=1 is always set for serverless — prevents EMAXCONNSESSION
// on Supabase/Neon poolers when DATABASE_URL doesn't include it already.
function buildDbUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "1");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "10");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const DB_URL = buildDbUrl((process.env.DATABASE_URL || "").trim());

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
