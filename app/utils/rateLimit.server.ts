import prisma from "../db.server";

/**
 * Database-Backed Rate Limiter
 *
 * Unlike in-memory rate limiters, this persists across Vercel cold starts
 * and works correctly across multiple serverless instances. Rate limit
 * records auto-expire and are cleaned up periodically.
 *
 * @param key       - Identifier to rate limit (usually IP address)
 * @param maxHits   - Maximum number of requests allowed in the window
 * @param windowMs  - Time window in milliseconds (default: 1 hour)
 * @returns         - { allowed: boolean, remaining: number, resetAt: Date }
 */
export async function checkRateLimit(
  key: string,
  maxHits: number = 10,
  windowMs: number = 60 * 60 * 1000 // 1 hour
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - (now.getTime() % windowMs));
  const windowId = windowStart.toISOString();
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  try {
    // Upsert: create or increment the counter for this key+window
    const record = await prisma.rateLimit.upsert({
      where: {
        key_window: { key, window: windowId },
      },
      update: {
        count: { increment: 1 },
      },
      create: {
        key,
        window: windowId,
        count: 1,
        expiresAt,
      },
    });

    const allowed = record.count <= maxHits;
    const remaining = Math.max(0, maxHits - record.count);

    return { allowed, remaining, resetAt: expiresAt };
  } catch (error) {
    // If the DB is down, fail OPEN (allow the request) to avoid
    // blocking legitimate users due to infrastructure issues
    console.error("Rate limiter DB error (failing open):", error);
    return { allowed: true, remaining: maxHits, resetAt: expiresAt };
  }
}

/**
 * Cleanup expired rate limit records.
 * Call this periodically (e.g. from a cron job) to prevent table bloat.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}
