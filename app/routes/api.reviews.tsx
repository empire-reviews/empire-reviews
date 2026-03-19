import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { analyzeBasicSentiment } from "../services/sentiment.server";

// 🛡️ CORS HELPER — restrict to Shopify storefronts
function getAllowedOrigin(request: Request): string {
    const origin = request.headers.get("Origin") || "";
    // Allow any *.myshopify.com storefront and custom domains via Shopify proxy
    if (origin.endsWith(".myshopify.com") || origin.endsWith(".shopify.com")) {
        return origin;
    }
    // Allow localhost for development
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return origin;
    }
    return ""; // Reject unknown origins
}

function corsResponse(request: Request) {
    const allowedOrigin = getAllowedOrigin(request);
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    });
}

function corsHeaders(request: Request) {
    return {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
}

export const action = async ({ request }: ActionFunctionArgs) => {

    // Handle Preflight
    if (request.method === "OPTIONS") return corsResponse(request);

    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
    }

    try {
        const formData = await request.formData();
        const productId = formData.get("productId") as string;
        const rating = parseInt(formData.get("rating") as string);
        const body = formData.get("body") as string;
        const customerName = formData.get("author") as string || "Anonymous";
        const customerEmail = formData.get("email") as string;
        const title = formData.get("title") as string;
        const mediaUrls = formData.get("media_urls") as string; // Expecting comma-separated URLs

        // Get shop from form data (storefront widget must include this)
        // Also check App Proxy header as fallback
        const shop = (formData.get("shop") as string)
            || request.headers.get("x-shopify-shop-domain")
            || new URL(request.url).searchParams.get("shop");

        if (!productId || !rating || !shop) {
            return json({ error: "Missing required fields (productId, rating, shop)" }, { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
        }

        // 🧠 EMPIRE INTELLIGENCE LAYER
        const sentiment = analyzeBasicSentiment(body || "");

        // Fetch Settings for Auto-Publish Rules
        const settings = await prisma.settings.findFirst({ where: { shop } });

        // 🚨 DEV MODE: Auto-approve everything so you can see it
        let status = "approved";

        // Handle Media Creation
        const mediaCreate = [];
        if (mediaUrls) {
            const urls = mediaUrls.split(',').map(u => u.trim()).filter(u => u);
            for (const url of urls) {
                mediaCreate.push({ url, type: 'image' });
            }
        }

        const review = await prisma.review.create({
            data: {
                shop,
                productId: `gid://shopify/Product/${productId}`,
                rating,
                body: body || null,
                title: title || null,
                customerName,
                // @ts-ignore
                customerEmail,
                status,
                verified: false,
                sentiment,
                media: { create: mediaCreate }
            }
        });

        // 🔌 ECOSYSTEM: Trigger Shopify Flow
        if (settings?.enableFlow) {
            // We need an admin client. For public storefront API, we usually don't have one.
            // However, this is a Remix Backend Action, so we might need to "unauthenticated" usage or get a session.
            // Since this API is public (CORS), we don't have a specific merchant session in context easily.
            // BUT: Since this is a single-tenant app in this context (or we saved the shop "empire-store"),
            // we will fetch the OFFLINE session for "empire-store" (or dynamic shop) to fire the trigger.

            // For now, in this PoC, we will wrap in a try/catch block and use a simplistic approach.
            // In a multi-tenant app, we'd pass the shop via query param or header.

            try {
                // Find session for this shop to get an Access Token (Offline)
                // Note: We need to import 'shopify' correctly.
                const shopify = (await import("../shopify.server")).default;
                // @ts-ignore: Session storage type mismatch
                const sessionId = shopify.sessionStorage.getOfflineId(shop);
                const session = await shopify.sessionStorage.loadSession(sessionId);

                if (session) {
                    // @ts-ignore: Client type mismatch
                    const client = new shopify.clients.Graphql({ session });
                    await client.request(
                        `mutation flowTriggerReceive($handle: String!, $payload: JSON!, $surreal: Boolean) {
                            flowTriggerReceive(handle: $handle, payload: $payload, surreal: $surreal) {
                                userErrors { field message }
                            }
                        }`,
                        {
                            variables: {
                                handle: "empire-review-trigger",
                                payload: {
                                    rating,
                                    reviewBody: body,
                                    customerEmail,
                                    customerName,
                                    reviewTitle: "Review from Storefront"
                                },
                                surreal: true // Use 'surreal' to fire immediately in dev
                            }
                        }
                    );
                    console.log("✅ Flow Trigger Fired: review_created");
                }
            } catch (flowError) {
                console.error("⚠️ Failed to fire Flow trigger:", flowError);
            }
        }

        // 🎯 CAMPAIGN CONVERSION TRACKING (via HTTP Referer)
        const referer = request.headers.get("Referer");
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                const campaignId = refererUrl.searchParams.get("campaignId");
                
                if (campaignId) {
                    await prisma.campaignMetrics.updateMany({
                        where: { campaignId },
                        data: { totalReviews: { increment: 1 } }
                    });
                    console.log(`✅ Conversion tracked to Campaign: ${campaignId}`);
                }
            } catch (trackError) {
                console.error("⚠️ Failed to track campaign conversion:", trackError);
            }
        }

        return json({ success: true, review }, {
            headers: {
                "Access-Control-Allow-Origin": "*",
            }
        });

    } catch (error) {
        console.error("API Error:", error);
        return json({ error: "Submission failed" }, { status: 500, headers: corsHeaders(request) });
    }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Handle OPTIONS for CORS preflight
    if (request.method === "OPTIONS") return corsResponse(request);

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const shop = url.searchParams.get("shop");
    const minRating = url.searchParams.get("minRating") ? parseInt(url.searchParams.get("minRating")!) : undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : 50;
    const mediaOnly = url.searchParams.get("mediaOnly") === "true";

    try {
        const where: any = {}; // Build dynamic query

        // Filter by Product (Optional now, to allow store-wide widgets)
        if (productId) {
            where.productId = `gid://shopify/Product/${productId}`;
        }

        // Filter by Rating (e.g. Carousel wants 5-stars)
        if (minRating) {
            where.rating = { gte: minRating };
        }

        // Filter by Media (e.g. Grid wants photos)
        if (mediaOnly) {
            where.media = { some: {} }; // At least one media item
        }

        // Only show approved reviews on storefronts
        where.status = "approved";

        const reviews = await prisma.review.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
            include: { media: true, replies: true }
        });

        // Calculate Aggregates (Only if querying by Product for Stats, otherwise skip to save perf)
        let stats = null;
        if (productId) {
            const allReviews = await prisma.review.findMany({
                where: { productId: `gid://shopify/Product/${productId}` },
                select: { rating: true }
            });
            const total = allReviews.length;
            const average = total === 0 ? 0 : allReviews.reduce((acc, r) => acc + r.rating, 0) / total;
            stats = { total, average };
        } else if (!productId && shop) {
            // Global Stats (for Trust Badge) - filter by shop to prevent data leaks
            const allReviews = await prisma.review.findMany({
                where: { shop },
                select: { rating: true }
            });
            const total = allReviews.length;
            const average = total === 0 ? 0 : allReviews.reduce((acc, r) => acc + r.rating, 0) / total;
            stats = { total, average };
        }

        return json(
            { reviews, stats },
            {
                headers: corsHeaders(request),
            }
        );
    } catch (e) {
        console.error("API Fetch Error:", e);
        return json({ error: "Fetch failed" }, { status: 500, headers: corsHeaders(request) });
    }
};
