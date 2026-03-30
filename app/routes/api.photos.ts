import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

function getAllowedOrigin(request: Request): string {
    const origin = request.headers.get("Origin") || "";
    if (origin.endsWith(".myshopify.com") || origin.endsWith(".shopify.com")) return origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;
    return "";
}

function corsHeaders(request: Request) {
    return {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=60",
    };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const productId = url.searchParams.get("productId") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "48"), 48);

    if (!shop) {
        return json({ error: "Missing shop parameter" }, { status: 400, headers: corsHeaders(request) });
    }

    try {
        const mediaRecords = await prisma.reviewMedia.findMany({
            where: {
                review: {
                    shop,
                    status: "approved",
                    ...(productId ? { productId } : {}),
                },
                type: { startsWith: "image" },
            },
            include: {
                review: {
                    select: {
                        id: true,
                        rating: true,
                        customerName: true,
                        body: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        const photos = mediaRecords.map((m) => ({
            id: m.id,
            url: m.url,
            reviewId: m.reviewId,
            rating: m.review.rating,
            customerName: m.review.customerName || "Anonymous",
            body: m.review.body || "",
        }));

        return json({ photos }, { headers: corsHeaders(request) });
    } catch (err) {
        console.error("[api.photos] Error:", err);
        return json({ error: "Internal server error" }, { status: 500, headers: corsHeaders(request) });
    }
};
