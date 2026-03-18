import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp, BillingInterval, BillingReplacementBehavior, } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
// Global sanitization for Vercel environment corruption
process.env.SHOPIFY_API_KEY = (process.env.SHOPIFY_API_KEY || "").trim();
process.env.SHOPIFY_API_SECRET = (process.env.SHOPIFY_API_SECRET || "").trim();
process.env.SHOPIFY_APP_URL = (process.env.SHOPIFY_APP_URL || "").trim();
process.env.SCOPES = (process.env.SCOPES || "").trim();
process.env.DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const shopify = shopifyApp({
    apiKey: (process.env.SHOPIFY_API_KEY || "").trim(),
    apiSecretKey: (process.env.SHOPIFY_API_SECRET || "").trim(),
    apiVersion: ApiVersion.October24,
    // Scopes managed via shopify.app.toml (use_legacy_install_flow = false)
    appUrl: (process.env.SHOPIFY_APP_URL || "https://empire-reviews.vercel.app").trim(),
    authPathPrefix: "/auth",
    sessionStorage: new PrismaSessionStorage(prisma),
    distribution: AppDistribution.AppStore,
    billing: {
        "Empire Pro": {
            lineItems: [
                {
                    amount: 9.99,
                    currencyCode: "USD",
                    interval: BillingInterval.Every30Days,
                },
            ],
            trialDays: 7,
            replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
        },
    },
    future: {
        unstable_newEmbeddedAuthStrategy: true,
        expiringOfflineAccessTokens: true,
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
        ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
        : {}),
});
export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
