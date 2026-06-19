import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { checkRateLimit } from "../utils/rateLimit.server";

// 🛡️ CORS HELPER — restrict to Shopify storefronts (mirrors api.reviews.tsx).
// Never returns "*": echoes the request origin for known Shopify/localhost
// origins, otherwise "null" so unknown origins are denied.
function getAllowedOrigin(request: Request): string {
    const origin = request.headers.get("Origin") || "";
    if (origin.endsWith(".myshopify.com") || origin.endsWith(".shopify.com")) {
        return origin;
    }
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return origin;
    }
    return "null";
}

function isValidShopDomain(shop: string | null): boolean {
    return !!shop && /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // 1. CORS — restricted, never wildcard
    const corsHeaders = {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    // 2. Validate shop domain — reject anything not *.myshopify.com (prevents
    // cross-tenant reads via a spoofed/garbage shop param)
    if (!isValidShopDomain(shop)) {
        return json({ error: "Invalid or missing shop" }, { status: 400, headers: corsHeaders });
    }

    // 3. Rate limit all callers (including unknown IPs) — guards against
    // cross-tenant scraping / cost abuse on this public GET endpoint
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
    const rateCheck = await checkRateLimit(ip, 60, 60 * 60 * 1000); // 60 requests per hour

    if (!rateCheck.allowed) {
        const retryAfter = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 1000);
        return json(
            { error: "Rate limit exceeded. Try again later." },
            {
                status: 429,
                headers: {
                    ...corsHeaders,
                    "Retry-After": String(retryAfter),
                },
            }
        );
    }

    try {
        // Strict Billing Check
        const settings = await prisma.settings.findUnique({
            where: { shop: shop! },
            select: { plan: true }
        });

        if (!settings || settings.plan !== "EMPIRE_PRO") {
            return json({ success: false, error: "Feature requires Empire Pro", reviews: [] }, { status: 403, headers: corsHeaders });
        }

        // Fetch top 5-star reviews
        const reviews = await prisma.review.findMany({
            where: {
                shop: shop!,
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
                verified: true,
                media: true
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
