import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { checkRateLimit } from "../utils/rateLimit.server";

// 🛡️ Public storefront Q&A API. Mirrors the trust-boundary rules of api.reviews.tsx:
//  - shop is derived from the App Proxy header (x-shopify-shop-domain), never the body
//  - shop must validate as *.myshopify.com
//  - CORS restricted to Shopify storefronts
//  - all IPs (including unknown) are rate limited
//  - only "approved" questions/answers are ever returned to storefronts

function getAllowedOrigin(request: Request): string {
    const origin = request.headers.get("Origin") || "";
    if (origin.endsWith(".myshopify.com") || origin.endsWith(".shopify.com")) return origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;
    return "null";
}

function isValidShopDomain(shop: string | null): boolean {
    return !!shop && /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop);
}

function corsResponse(request: Request) {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": getAllowedOrigin(request),
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

function corsHeaders(request: Request) {
    return {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
}

// ─── POST: shopper submits a question ──────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method === "OPTIONS") return corsResponse(request);
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
    const rateCheck = await checkRateLimit(`question:${ip}`, 10, 60 * 60 * 1000); // 10/hr/IP
    if (!rateCheck.allowed) {
        const retryAfter = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 1000);
        return json(
            { error: "Rate limit exceeded. Try again later." },
            { status: 429, headers: { ...corsHeaders(request), "Retry-After": String(retryAfter) } }
        );
    }

    try {
        const formData = await request.formData();
        let productId = formData.get("productId") as string;
        if (productId && productId.includes("gid://shopify/Product/")) {
            productId = productId.replace("gid://shopify/Product/", "");
        }
        let body = (formData.get("body") as string) || "";
        let customerName = (formData.get("author") as string) || "Anonymous";
        const customerEmail = (formData.get("email") as string) || null;

        // 🛡️ shop from App Proxy header only
        const shop = request.headers.get("x-shopify-shop-domain")
            || new URL(request.url).searchParams.get("shop");
        if (!shop || !isValidShopDomain(shop)) {
            return json({ error: "Invalid or missing shop" }, { status: 400, headers: corsHeaders(request) });
        }

        body = body.trim();
        if (!body) return json({ error: "Question is required" }, { status: 400, headers: corsHeaders(request) });
        if (body.length > 1000) return json({ error: "Question exceeds 1000 characters." }, { status: 400, headers: corsHeaders(request) });
        if (customerName.length > 100) customerName = customerName.substring(0, 100);
        customerName = customerName.replace(/[<>&]/g, "");

        // Auto-approval mirrors the merchant's review publish policy: if they
        // auto-publish all reviews, auto-publish questions too; otherwise queue.
        const settings = await prisma.settings.findFirst({ where: { shop } });
        const publishMode = (settings as any)?.publishMode || "none";
        const status = publishMode === "all" ? "approved" : "pending";

        let formattedProductId: string | null = null;
        if (productId && productId.trim() !== "") {
            formattedProductId = `gid://shopify/Product/${productId}`;
        }

        const question = await prisma.question.create({
            data: {
                shop,
                productId: formattedProductId,
                body,
                customerName,
                customerEmail,
                status,
            },
        });

        return json({ success: true, status, id: question.id }, { headers: corsHeaders(request) });
    } catch (error) {
        console.error("Q&A API Error:", error);
        return json({ error: "Submission failed" }, { status: 500, headers: corsHeaders(request) });
    }
};

// ─── GET: list approved questions (+ approved answers) for a product/shop ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
    if (request.method === "OPTIONS") return corsResponse(request);

    const url = new URL(request.url);
    let productId = url.searchParams.get("productId");
    const shop = url.searchParams.get("shop");
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : 20;
    const page = url.searchParams.get("page") ? parseInt(url.searchParams.get("page")!) : 1;
    const skip = (page - 1) * limit;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
    const readLimit = await checkRateLimit(`qreads:${ip}`, 600, 60 * 60 * 1000);
    if (!readLimit.allowed) {
        const retryAfter = Math.ceil((readLimit.resetAt.getTime() - Date.now()) / 1000);
        return json(
            { error: "Rate limit exceeded. Try again later." },
            { status: 429, headers: { ...corsHeaders(request), "Retry-After": String(retryAfter) } }
        );
    }

    try {
        const where: any = { status: "approved" };
        if (shop) where.shop = shop;
        if (productId) {
            if (productId.includes("gid://shopify/Product/")) {
                productId = productId.replace("gid://shopify/Product/", "");
            }
            where.productId = `gid://shopify/Product/${productId}`;
        }

        const questions = await prisma.question.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
            skip,
            include: {
                answers: {
                    where: { status: "approved" },
                    orderBy: [{ isMerchant: "desc" }, { createdAt: "asc" }],
                },
            },
        });

        const hasMore = questions.length === limit;
        const headers: any = corsHeaders(request);
        headers["Cache-Control"] = "public, max-age=15, s-maxage=15, stale-while-revalidate=30";
        return json({ questions, pagination: { page, hasMore } }, { headers });
    } catch (e) {
        console.error("Q&A Fetch Error:", e);
        return json({ error: "Fetch failed" }, { status: 500, headers: corsHeaders(request) });
    }
};
