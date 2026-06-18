import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { analyzeBasicSentiment } from "../services/sentiment.server";
import { checkRateLimit } from "../utils/rateLimit.server";
import { decrypt } from "../utils/encryption.server";

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
    return "null"; // Deny unknown origins — prevents CORS from being exploited
}

function isValidShopDomain(shop: string | null): boolean {
    return !!shop && /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop);
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
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";

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

        // 🛡️ Derive shop from App Proxy header only — never trust form body for shop
        const shop = request.headers.get("x-shopify-shop-domain")
            || new URL(request.url).searchParams.get("shop");

        if (!shop || !isValidShopDomain(shop)) {
            return json({ error: "Invalid or missing shop" }, { status: 400, headers: corsHeaders(request) });
        }

        if (!rating) {
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

        // Handle Media Creation — hybrid model: photos on every plan, video Pro-only.
        const mediaIsPro = settings?.plan === "EMPIRE_PRO";
        const mediaCreate: any[] = [];
        if (mediaUrls) {
            try {
                // Parse safely as JSON array
                let urls = [];
                if (mediaUrls.startsWith('[')) urls = JSON.parse(mediaUrls);
                else urls = mediaUrls.split(',').map((u: string) => u.trim()); // Legacy fallback

                for (const url of urls) {
                    // Only allow Cloudinary HTTPS URLs — no data: URIs or arbitrary hosts
                    if (typeof url !== 'string' || !url.startsWith("https://res.cloudinary.com/")) continue;
                    const isVideo = /\/video\//.test(url) || /\.(mp4|mov|webm|m4v)$/i.test(url);
                    // Video is Pro-only; silently drop video URLs from non-Pro shops.
                    if (isVideo && !mediaIsPro) continue;
                    mediaCreate.push({ url, type: isVideo ? 'video' : 'image' });
                }
            } catch(e) { console.error("Media URL parsing error", e); }
        }

        // 🛡️ Enforce free plan 50-review cap
        if (!settings || settings.plan !== "EMPIRE_PRO") {
            const reviewCount = await prisma.review.count({ where: { shop } });
            if (reviewCount >= 50) {
                return json({ error: "Review limit reached. Upgrade to Empire Pro for unlimited reviews." }, { status: 403, headers: corsHeaders(request) });
            }
        }

        let formattedProductId = null;
        if (productId && productId.trim() !== "") {
            formattedProductId = `gid://shopify/Product/${productId}`;
        }

        const review = await prisma.review.create({
            data: {
                shop,
                productId: formattedProductId,
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

        // 🎯 CAMPAIGN CONVERSION TRACKING (email-based attribution)
        // Link this review to the most recent unattributed CampaignSend for the same customer email.
        // This is more reliable than the Referer header which can be stripped or spoofed.
        if (review.customerEmail) {
            try {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

                // Find the most recent unattributed send for this customer within this shop
                const matchedSend = await prisma.campaignSend.findFirst({
                    where: {
                        customerEmail: review.customerEmail,
                        reviewId: null,
                        sentAt: { gte: thirtyDaysAgo },
                        campaign: { shop },
                    },
                    orderBy: { sentAt: "desc" },
                });

                if (matchedSend) {
                    // Mark the send as attributed to this review
                    await prisma.campaignSend.update({
                        where: { id: matchedSend.id },
                        data: { reviewId: review.id },
                    });

                    // Increment campaign totalReviews (safe: updateMany does nothing if row is missing)
                    await prisma.campaignMetrics.updateMany({
                        where: { campaignId: matchedSend.campaignId },
                        data: { totalReviews: { increment: 1 } },
                    });

                    console.log(`✅ Conversion tracked: review ${review.id} → send ${matchedSend.id} (campaign ${matchedSend.campaignId})`);
                }
            } catch (trackError) {
                console.error("⚠️ Failed to track campaign conversion:", trackError);
            }
        }

        return json({ success: true, review }, {
            headers: corsHeaders(request),
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
                    status: "approved",
                    ...(shop ? { shop } : {}),  // scope to THIS shop — was leaking cross-shop counts
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
        let settings: any = null;
        if (shop) {
             settings = await prisma.settings.findFirst({
                 where: { shop }
             });
        }
        
        // Hybrid model: photo reviews on every plan; video reviews are Pro-only.
        const loaderIsPro = settings?.plan === "EMPIRE_PRO";
        const safeSettings = settings ? {
            primaryColor: settings.primaryColor,
            aiProvider: settings.aiProvider,
            allowPhotoUploads: true,
            allowVideoUploads: loaderIsPro,
        } : null;

        const allowPhotoUploads = true;
        const allowVideoUploads = loaderIsPro;

        // Return pagination metadata alongside data
        const hasMore = reviews.length === limit;
        
        // Handle AI Summary intent
        if (url.searchParams.get("intent") === "summary") {
            if (!settings || settings.plan !== "EMPIRE_PRO") {
                return json({ error: "Feature requires Empire Pro" }, { status: 403, headers: corsHeaders(request) });
            }
            if (!settings.aiProvider) {
                return json({ error: "AI Provider not configured" }, { status: 400, headers: corsHeaders(request) });
            }
            try {
                const { generateInsights } = await import("../services/ai.server");
                const insightReviews = reviews.map(r => ({ body: r.body, rating: r.rating }));
                const { summary } = await generateInsights({ provider: settings.aiProvider as any, apiKey: decrypt(settings.aiApiKey || "") }, insightReviews, "quick");
                const headers: any = corsHeaders(request);
                
                // Dynamic caching based on merchant settings
                const cacheParam = url.searchParams.get("cache") || "1h";
                let cacheSeconds = 3600; // default 1 hour
                if (cacheParam === "10m") cacheSeconds = 600;
                else if (cacheParam === "1h") cacheSeconds = 3600;
                else if (cacheParam === "1d") cacheSeconds = 86400;
                else if (cacheParam === "1w") cacheSeconds = 604800;
                
                headers["Cache-Control"] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`;
                return json({ summary }, { headers });
            } catch (e: any) {
                console.error("AI Summary Error:", e);
                return json({ error: e.message || "Summary generation failed" }, { status: 500, headers: corsHeaders(request) });
            }
        }
        
        const headers: any = corsHeaders(request);
        // Short cache so newly approved/added reviews appear on storefronts quickly
        // (was max-age=60, s-maxage=300, swr=300 — caused stale "0" counts to linger
        // at the CDN edge for up to ~10 min after a review was approved).
        headers["Cache-Control"] = "public, max-age=15, s-maxage=15, stale-while-revalidate=30";
        return json(
            { reviews, stats, pagination: { page, hasMore }, features: { allowPhotoUploads, allowVideoUploads }, settings: safeSettings },
            { headers }
        );
    } catch (e) {
        console.error("API Fetch Error:", e);
        return json({ error: "Fetch failed" }, { status: 500, headers: corsHeaders(request) });
    }
};
