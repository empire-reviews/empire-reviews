import { BillingInterval } from "@shopify/shopify-app-remix/server";
import { authenticate } from "./shopify.server";
import prisma, { withRetry } from "./db.server";

export const MONTHLY_PLAN = "Empire Pro";

const IS_TEST_CHARGE = process.env.NODE_ENV !== "production" || process.env.BILLING_TEST_MODE === "true";

// 5-second hard limit on the Shopify billing API call.
// Cold-start Vercel functions can hang for 10-30s waiting for Shopify's API.
// If it times out we fall back to the DB-cached plan status.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[billing] billing.check() timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function hasActivePayment(
    billing: Awaited<ReturnType<typeof authenticate.admin>>["billing"],
    session: Awaited<ReturnType<typeof authenticate.admin>>["session"]
) {
    // 1. DB is the authoritative fast-path.
    //    - Handles VIP/Lifetime access
    //    - Acts as a cache against Shopify API timeouts
    //    - Uses withRetry to survive cold-start DB connection hiccups
    try {
        const settings = await withRetry(() =>
            prisma.settings.findFirst({ where: { shop: session.shop } })
        );
        if (settings?.plan === "EMPIRE_PRO") {
            // DB says Pro — return immediately, no Shopify API call needed.
            return true;
        }
    } catch (e) {
        console.warn("[billing] DB plan check failed after retries:", e);
        // Fall through to Shopify API — don't assume FREE if DB is down
    }

    // 2. DB says FREE (or is unreachable) — verify with Shopify Billing API.
    //    This catches newly subscribed users who aren't cached in DB yet.
    //    Hard timeout: 5 seconds. If Shopify API is slow, fail-safe to FREE.
    try {
        const billingCheck = await withTimeout(
            billing.check({ plans: [MONTHLY_PLAN], isTest: IS_TEST_CHARGE }),
            5000
        );

        if (billingCheck.hasActivePayment) {
            // ✅ Newly confirmed Pro — cache to DB so future requests are instant
            withRetry(() =>
                prisma.settings.updateMany({
                    where: { shop: session.shop },
                    data: { plan: "EMPIRE_PRO" },
                })
            ).catch((cacheErr) =>
                console.warn("[billing] Failed to cache Pro status to DB:", cacheErr)
            );
        }

        return billingCheck.hasActivePayment;
    } catch (error) {
        // Shopify API failed or timed out.
        // At this point DB also said FREE (or was unreachable).
        // Safe default: deny Pro access rather than grant it incorrectly.
        console.warn("[billing] Shopify billing.check() failed/timed out:", (error as Error).message);
        return false;
    }
}

export async function getPlanDetails(
    billing: Awaited<ReturnType<typeof authenticate.admin>>["billing"]
) {
    try {
        const billingCheck = await billing.check({
            plans: [MONTHLY_PLAN],
            isTest: IS_TEST_CHARGE,
        });

        if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
            return billingCheck.appSubscriptions[0];
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function requirePayment(
    billing: Awaited<ReturnType<typeof authenticate.admin>>["billing"]
) {
    const appUrl = (process.env.SHOPIFY_APP_URL || "https://empire-reviews.vercel.app").trim();
    return await billing.request({
        plan: MONTHLY_PLAN,
        isTest: IS_TEST_CHARGE,
        returnUrl: `${appUrl}/app/settings`,
    });
}
