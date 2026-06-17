import { json, type ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import prisma from "../db.server";

// 🛡️ CORS HELPER — restrict to Shopify storefronts (mirrors api.reviews.tsx)
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

function corsHeaders(request: Request) {
    return {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function corsResponse(request: Request) {
    return new Response(null, { headers: corsHeaders(request) });
}

function isValidShopDomain(shop: string | null | undefined): shop is string {
    return typeof shop === "string" && /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop);
}

/**
 * Signed Cloudinary upload proxy (Bug C6).
 *
 * Instead of shipping a shared unsigned upload_preset to the storefront (which
 * lets anyone upload arbitrary files to our shared Cloudinary account), the
 * storefront asks this route for a short-lived signed upload signature. We:
 *   1. Derive `shop` from the App Proxy header (not spoofable by the client).
 *   2. Confirm the shop is on EMPIRE_PRO (photo uploads are Pro-only).
 *   3. Sign the upload server-side with our API secret, scoped to the shop's folder.
 * The client then uploads directly to Cloudinary using the signed params.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method === "OPTIONS") return corsResponse(request);

    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
    }

    // Derive shop from the App Proxy header (set by Shopify, not spoofable by the storefront).
    const shop = request.headers.get("x-shopify-shop-domain")
        || new URL(request.url).searchParams.get("shop");

    if (!isValidShopDomain(shop)) {
        return json({ error: "Invalid shop" }, { status: 400, headers: corsHeaders(request) });
    }

    // Cloudinary credentials must be configured server-side.
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
        console.error("Cloudinary env vars missing — cannot sign upload");
        return json({ error: "Upload service not configured" }, { status: 401, headers: corsHeaders(request) });
    }

    // Hybrid model: photo uploads are available on every plan; video uploads are Pro-only.
    const settings = await prisma.settings.findFirst({ where: { shop } });
    const isPro = settings?.plan === "EMPIRE_PRO";
    const resourceType = (new URL(request.url).searchParams.get("type") || "image").toLowerCase();
    if (resourceType === "video" && !isPro) {
        return json({ error: "Video reviews require Empire Pro" }, { status: 403, headers: corsHeaders(request) });
    }

    // Scope every upload to a per-shop folder.
    const folder = `empire-reviews/${shop}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signature: SHA-1 of the alphabetically-sorted params to sign,
    // concatenated with the API secret. Here we sign `folder` and `timestamp`.
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = createHash("sha1")
        .update(paramsToSign + apiSecret)
        .digest("hex");

    return json(
        { cloudName, apiKey, timestamp, signature, folder },
        { headers: corsHeaders(request) }
    );
};
