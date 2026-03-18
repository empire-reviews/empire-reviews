import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Safe diagnostic endpoint - does NOT expose secrets.
 * Returns auth-related diagnostic info to help debug 401 issues.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Check request headers for auth-related info
    const hasAuthHeader = !!request.headers.get("authorization");
    const hasShopHeader = !!request.headers.get("x-shopify-shop-domain");

    // Check session count in DB
    let sessionCount = 0;
    let sessions: { id: string; shop: string; isOnline: boolean; expires: Date | null; scope: string | null }[] = [];
    try {
        sessionCount = await prisma.session.count();
        sessions = await prisma.session.findMany({
            select: {
                id: true,
                shop: true,
                isOnline: true,
                expires: true,
                scope: true,
            },
            take: 10,
        });
    } catch (e: any) {
        return json({
            error: "DB connection failed",
            message: e.message,
        });
    }

    return json({
        status: "ok",
        timestamp: new Date().toISOString(),
        request: {
            url: request.url,
            method: request.method,
            hasAuthorizationHeader: hasAuthHeader,
            hasShopifyShopHeader: hasShopHeader,
            userAgent: request.headers.get("user-agent")?.substring(0, 100),
        },
        env: {
            hasApiKey: !!(process.env.SHOPIFY_API_KEY || "").trim(),
            apiKeyLength: (process.env.SHOPIFY_API_KEY || "").trim().length,
            hasApiSecret: !!(process.env.SHOPIFY_API_SECRET || "").trim(),
            apiSecretLength: (process.env.SHOPIFY_API_SECRET || "").trim().length,
            hasAppUrl: !!(process.env.SHOPIFY_APP_URL || "").trim(),
            appUrl: (process.env.SHOPIFY_APP_URL || "").trim(),
            hasDbUrl: !!(process.env.DATABASE_URL || "").trim(),
            nodeEnv: process.env.NODE_ENV,
        },
        database: {
            sessionCount,
            sessions: sessions.map(s => ({
                id: s.id.substring(0, 20) + "...",
                shop: s.shop,
                isOnline: s.isOnline,
                expired: s.expires ? new Date(s.expires) < new Date() : "no-expiry",
                scope: s.scope,
            })),
        },
    });
};
