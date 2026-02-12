import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // 💓 This is the Heartbeat Endpoint.
    // 🎯 Purpose: Keep the Supabase Database awake and the Vercel Function warm.
    // 💡 How: A free external service (like cron-job.org) hits this URL every 4 minutes.

    const start = Date.now();

    try {
        // 1. Run a tiny query to keep the database connection active.
        // We select the count of reviews, which is very fast but forces the DB to wake up.
        // Supabase pauses projects after 7 days of inactivity.
        // Hitting this endpoint ensures the project is never considered "inactive".
        const count = await prisma.review.count();

        const duration = Date.now() - start;

        return json(
            {
                status: "alive",
                message: "I am awake! ☕ (Supabase Edition)",
                database_latency_ms: duration,
                review_count: count
            },
            {
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                }
            }
        );
    } catch (error) {
        console.error("Keepalive Error:", error);
        return json({ status: "error", message: "Database might be sleeping or unreachable." }, { status: 500 });
    }
};
