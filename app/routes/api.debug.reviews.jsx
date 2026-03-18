import { json } from "@remix-run/node";
import prisma from "../db.server";
export const loader = async ({ request }) => {
    // REMOVED AUTH FOR DEBUGGING
    // await authenticate.admin(request);
    try {
        const reviews = await prisma.review.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                rating: true,
                body: true,
                customerName: true,
                createdAt: true
            }
        });
        console.log("DEBUG REVIEWS FETCH:", JSON.stringify(reviews, null, 2));
        return json({
            count: reviews.length,
            reviews
        }, { headers: { "Content-Type": "application/json" } });
    }
    catch (e) {
        console.error("DEBUG ERROR:", e);
        return json({ error: String(e) }, { status: 500 });
    }
};
