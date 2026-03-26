import { json, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return json({ message: "Method Not Allowed" }, { status: 405 });
    }

    try {
        // Run a tiny query to keep the database connection active.
        // We select the count of reviews, which is very fast but forces the DB to wake up.
        // Supabase pauses projects after 7 days of inactivity.
        // Hitting this endpoint ensures the project is never considered "inactive".
        await prisma.review.findFirst({ select: { id: true } });

        return json(
            {
                status: "ok"
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
