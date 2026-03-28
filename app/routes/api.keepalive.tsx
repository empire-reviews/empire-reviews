import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

/**
 * DB Keepalive endpoint.
 * Ping this every 10 minutes from Cron-job.org (or similar) to prevent
 * Supabase's pgbouncer from dropping idle connections, which causes
 * cold-start timeouts that previously triggered the zero-state fallback.
 *
 * Example cron URL: https://your-app.vercel.app/api/keepalive
 */
export const loader = async (_: LoaderFunctionArgs) => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok", latencyMs: Date.now() - start, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[keepalive] DB health check failed:", error);
    return json(
      { status: "error", error: (error as Error).message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
};
