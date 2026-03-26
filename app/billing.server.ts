import { BillingInterval } from "@shopify/shopify-app-remix/server";
import { authenticate } from "./shopify.server";
import prisma from "./db.server";

export const MONTHLY_PLAN = "Empire Pro";

const IS_TEST_CHARGE = process.env.NODE_ENV !== "production" || process.env.BILLING_TEST_MODE === "true";

// Stay compatible with boolean checks
export async function hasActivePayment(request: Request) {
    const { billing, session } = await authenticate.admin(request);

    // 1. Always check DB first — this is our cache and handles VIP/Lifetime access.
    //    This also acts as a fallback if the Shopify Billing API is unreachable.
    let localPlanIsPro = false;
    try {
        const settings = await prisma.settings.findFirst({
            where: { shop: session.shop }
        });
        if (settings?.plan === "EMPIRE_PRO") {
            localPlanIsPro = true;
            // Return immediately — DB says Pro, no need to hit Shopify API
            return true;
        }
    } catch (e) {
        console.warn("[billing] DB plan check failed:", e);
    }

    // 2. Verify with Shopify Billing API (source of truth for subscriptions)
    try {
        const billingCheck = await billing.check({
            plans: [MONTHLY_PLAN],
            isTest: IS_TEST_CHARGE,
        });
        if (billingCheck.hasActivePayment) {
            // ✅ Cache the Pro status in DB so future cold starts are instant
            try {
                await prisma.settings.updateMany({
                    where: { shop: session.shop },
                    data: { plan: "EMPIRE_PRO" }
                });
            } catch (cacheErr) {
                // Non-fatal — caching failure should not block the user
                console.warn("[billing] Failed to cache Pro status:", cacheErr);
            }
        }
        return billingCheck.hasActivePayment;
    } catch (error) {
        // ⚡ FAIL-OPEN: Shopify API is down / cold start timeout.
        // If DB already said Pro above, we would have returned. If it said Free,
        // we conservatively return false to avoid giving free access.
        // If DB check itself failed, we fail-open with false (safe default).
        console.warn("[billing] Shopify billing check failed, returning DB-cached status:", localPlanIsPro);
        return localPlanIsPro;
    }
}

export async function getPlanDetails(request: Request) {
    const { billing } = await authenticate.admin(request);
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

export async function requirePayment(request: Request) {
    const { billing } = await authenticate.admin(request);

    try {
        const billingCheck = await billing.check({
            plans: [MONTHLY_PLAN],
            isTest: IS_TEST_CHARGE,
        });

        if (billingCheck.hasActivePayment) {
            return billingCheck;
        }

        const appUrl = (process.env.SHOPIFY_APP_URL || "https://empire-reviews.vercel.app").trim();
        return await billing.request({
            plan: MONTHLY_PLAN,
            isTest: IS_TEST_CHARGE,
            returnUrl: `${appUrl}/app/settings`,
        });
    } catch (error: any) {
        console.error("❌ Billing Flow Failure:", {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        throw error;
    }
}
