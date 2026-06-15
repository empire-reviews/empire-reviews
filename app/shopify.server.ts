import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
  BillingReplacementBehavior,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma, { withRetry } from "./db.server";

// Global sanitization for Vercel environment corruption
process.env.SHOPIFY_API_KEY = (process.env.SHOPIFY_API_KEY || "").trim();
process.env.SHOPIFY_API_SECRET = (process.env.SHOPIFY_API_SECRET || "").trim();
process.env.SHOPIFY_APP_URL = (process.env.SHOPIFY_APP_URL || "").trim();
process.env.SCOPES = (process.env.SCOPES || "").trim();
process.env.DATABASE_URL = (process.env.DATABASE_URL || "").trim();

// A wrapper that lazily initializes PrismaSessionStorage and retries on cold starts
class RetryablePrismaSessionStorage {
  private storage: PrismaSessionStorage<any> | null = null;

  private async getStorage() {
    if (!this.storage) {
        // Warm up the DB connection with retries BEFORE letting PrismaSessionStorage run ensureReady()
        await withRetry(() => prisma.session.count(), 5);
        this.storage = new PrismaSessionStorage(prisma);
    }
    return this.storage;
  }

  async storeSession(session: any) { return (await this.getStorage()).storeSession(session); }
  async loadSession(id: string) { return (await this.getStorage()).loadSession(id); }
  async deleteSession(id: string) { return (await this.getStorage()).deleteSession(id); }
  async deleteSessions(ids: string[]) { return (await this.getStorage()).deleteSessions(ids); }
  async findSessionsByShop(shop: string) { return (await this.getStorage()).findSessionsByShop(shop); }
}

const shopify = shopifyApp({
  apiKey: (process.env.SHOPIFY_API_KEY || "").trim(),
  apiSecretKey: (process.env.SHOPIFY_API_SECRET || "").trim(),
  apiVersion: ApiVersion.October24,
  // Scopes managed via shopify.app.toml (use_legacy_install_flow = false)
  appUrl: (process.env.SHOPIFY_APP_URL || "https://empire-reviews.vercel.app").trim(),
  authPathPrefix: "/auth",
  sessionStorage: new RetryablePrismaSessionStorage() as any,
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
    // unstable_newEmbeddedAuthStrategy was removed — it's an experimental flag
    // that causes billing.check() to use short-lived session tokens on client-side
    // fetches, making the Shopify billing API return hasActivePayment: false on
    // cold starts. Reverted to stable offline-token auth strategy.
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export const authenticate = shopify.authenticate;
