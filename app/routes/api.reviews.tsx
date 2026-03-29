import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { analyzeBasicSentiment } from "../services/sentiment.server";
import { checkRateLimit } from "../utils/rateLimit.server";

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

    // 🛡️ DATABASE-BACKED RATE LIMITING (persists across Vercel cold starts)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (ip !== "unknown") {
        const rateCheck = await checkRateLimit(ip, 10, 60 * 60 * 1000); // 10 requests per hour

        if (!rateCheck.allowed) {
            const retryAfter = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 1000);
            return json(
                { error: "Rate limit exceeded. Try again later." },
                {
                    status: 429,
                    headers: {
                        ...corsHeaders(request),
                        "Retry-After": String(retryAfter),
                        "X-RateLimit-Limit": "10",
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": rateCheck.resetAt.toISOString(),
                    }
                }
            );
        }
    }

    try {
        const formData = await request.formData();
        let productId = formData.get("productId") as string;
        // Ensure we don't double-prefix the gid
        if (productId && productId.includes("gid://shopify/Product/")) {
            productId = productId.replace("gid://shopify/Product/", "");
        }
        const rating = parseInt(formData.get("rating") as string);
        const body = formData.get("body") as string;
        let customerName = formData.get("author") as string || "Anonymous";
        const customerEmail = formData.get("email") as string;
        const title = formData.get("title") as string;
        const mediaUrls = formData.get("media_urls") as string;

        const shop = (formData.get("shop") as string)
            || request.headers.get("x-shopify-shop-domain")
            || new URL(request.url).searchParams.get("shop");

        if (!productId || !rating || !shop) {
            return json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders(request) });
        }

        // Input Validation (Issue 13)
        if (isNaN(rating) || rating < 1 || rating > 5) return json({ error: "Invalid rating" }, { status: 400, headers: corsHeaders(request) });
        if (body && body.length > 2000) return json({ error: "Review body exceeds maximum length of 2000 characters." }, { status: 400, headers: corsHeaders(request) });
        if (customerName.length > 100) customerName = customerName.substring(0, 100);

        // Basic HTML Sanitization
        customerName = customerName.replace(/[<>&]/g, "");

        // 🧠 EMPIRE INTELLIGENCE LAYER
        const sentiment = analyzeBasicSentiment(body || "");

        // Fetch Settings for Auto-Publish Rules
        const settings = await prisma.settings.findFirst({ where: { shop } });

        // Evaluate Auto-Publish Rule (3 modes: none | five_star | all)
        const publishMode = (settings as any)?.publishMode || (settings?.autoPublish ? "five_star" : "none");
        let status = "pending";
        if (publishMode === "all") {
            status = "approved";
        } else if (publishMode === "five_star" && rating === 5) {
            status = "approved";
        }

        // Handle Media Creation (Strictly PRO Only)
        const mediaCreate: any[] = [];
        if (mediaUrls && settings?.plan === "EMPIRE_PRO") {
            const urls = mediaUrls.split(',').map(u => u.trim()).filter(u => u);
            for (const url of urls) {
                // Ensure URLs are secure HTTPS to prevent malicious XSS
                if (url.startsWith("https://")) {
                    mediaCreate.push({ url, type: 'image' });
                }
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
                const { unauthenticated } = await import("../shopify.server");
                const { admin } = await unauthenticated.admin(shop);

                await admin.graphql(
                    `#graphql
                    mutation flowTriggerReceive($handle: String!, $payload: JSON!) {
                        flowTriggerReceive(handle: $handle, payload: $payload) {
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
                            }
                        }
                    }
                );
                console.log("✅ Flow Trigger Fired: review_created");
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
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : 20; // smaller default limit for infinite scroll
    const page = url.searchParams.get("page") ? parseInt(url.searchParams.get("page")!) : 1;
    const skip = (page - 1) * limit;
    const mediaOnly = url.searchParams.get("mediaOnly") === "true";

    try {
        const where: any = {}; // Build dynamic query

        if (productId) {
            where.productId = `gid://shopify/Product/${productId}`;
        }

        if (shop) {
            where.shop = shop;
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
            skip: skip,
            include: { media: true, replies: true }
        });

        // Calculate Aggregates (Only if querying by Product for Stats, otherwise skip to save perf)
        let stats = null;
        if (productId) {
            const allReviews = await prisma.review.findMany({
                where: {
                    productId: `gid://shopify/Product/${productId}`,
                    status: "approved"
                },
                select: { rating: true }
            });
            const total = allReviews.length;
            const average = total === 0 ? 0 : allReviews.reduce((acc, r) => acc + r.rating, 0) / total;
            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            allReviews.forEach((r: any) => { if (Math.round(r.rating) >= 1 && Math.round(r.rating) <= 5) distribution[Math.round(r.rating) as keyof typeof distribution]++; });
            stats = { total, average, distribution };
        } else if (!productId && shop) {
            // Global Stats (for Trust Badge) - filter by shop to prevent data leaks
            const allReviews = await prisma.review.findMany({
                where: {
                    shop,
                    status: "approved"
                },
                select: { rating: true }
            });
            const total = allReviews.length;
            const average = total === 0 ? 0 : allReviews.reduce((acc, r) => acc + r.rating, 0) / total;
            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            allReviews.forEach((r: any) => { if (Math.round(r.rating) >= 1 && Math.round(r.rating) <= 5) distribution[Math.round(r.rating) as keyof typeof distribution]++; });
            stats = { total, average, distribution };
        }

        // Fetch Store Settings to determine PRO features (like Photo Uploads)
        let settings = null;
        if (shop) {
             settings = await prisma.settings.findFirst({
                 where: { shop },
                 select: { plan: true }
             });
        }
        const allowPhotoUploads = settings?.plan === "EMPIRE_PRO";

        // Return pagination metadata alongside data
        const hasMore = reviews.length === limit;
        return json(
            { reviews, stats, pagination: { page, hasMore }, features: { allowPhotoUploads } },
            {
                headers: corsHeaders(request),
            }
        );
    } catch (e) {
        console.error("API Fetch Error:", e);
        return json({ error: "Fetch failed" }, { status: 500, headers: corsHeaders(request) });
    }
};
