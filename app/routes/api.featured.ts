import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // 1. Validate CORS
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    if (!shop) {
        return json({ error: "Missing shop parameter" }, { status: 400, headers: corsHeaders });
    }

    try {
        // Fetch top 5-star reviews
        const reviews = await prisma.review.findMany({
            where: {
                shop: shop,
                rating: 5,
                status: "approved",
                body: { not: "" }
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                id: true,
                rating: true,
                title: true,
                body: true,
                customerName: true,
                createdAt: true,
                verified: true
            }
        });

        return json({
            success: true,
            reviews
        }, { headers: corsHeaders });

    } catch (error) {
        console.error("[api.featured] error fetching global reviews:", error);
        return json({ error: "Internal Server Error" }, { status: 500, headers: corsHeaders });
    }
};
