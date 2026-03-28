import { BillingInterval } from "@shopify/shopify-app-remix/server";
import { authenticate } from "./shopify.server";
import prisma, { withRetry } from "./db.server";

export const MONTHLY_PLAN = "Empire Pro";

const IS_TEST_CHARGE = process.env.NODE_ENV !== "production" || process.env.BILLING_TEST_MODE === "true";

// ─────────────────────────────────────────────────────────────────────────────
// THE SINGLE SOURCE OF TRUTH FOR ALL CONTENT PAGES
// ─────────────────────────────────────────────────────────────────────────────
//
// Use isPlanPro(shop) in EVERY route that gates Pro content:
//   - app.insights.tsx, app.impact.tsx, app.reviews.tsx, app.campaigns.tsx
//   - app._index.tsx (dashboard)
//
// This reads ONLY from the database — never calls the Shopify billing API.
// The DB is always correct because:
//   • Plans page loader promotes DB to EMPIRE_PRO when Shopify confirms Pro
//   • Referral code action promotes DB to EMPIRE_PRO when valid code is entered
//   • We NEVER demote the DB to FREE from a billing check (only from webhook)
//
// ─────────────────────────────────────────────────────────────────────────────
export async function isPlanPro(shop: string): Promise<boolean> {
  try {
    const settings = await withRetry(() =>
      prisma.settings.findFirst({
        where: { shop },
        select: { plan: true },
      })
    );
    return settings?.plan === "EMPIRE_PRO";
  } catch (e) {
    // DB unreachable — fail-safe: deny Pro rather than grant it incorrectly.
    console.warn("[billing] isPlanPro DB check failed:", e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING SYNC — only for Plans & Settings loaders
// ─────────────────────────────────────────────────────────────────────────────
//
// Use hasActivePayment(billing, session) ONLY in loaders that legitimately
// need to sync billing status from Shopify (Plans page, Settings page).
// It verifies the Shopify subscription and updates the DB cache.
//
// DO NOT use this in every route — it calls the Shopify API and can timeout.
//
// ─────────────────────────────────────────────────────────────────────────────

// 5-second hard limit on the Shopify billing API call.
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
    // 1. Fast DB path — covers VIP referral users and cached Pro subscribers
    const dbIsPro = await isPlanPro(session.shop);
    if (dbIsPro) return true;

    // 2. DB says FREE — verify with Shopify Billing API (catches newly subscribed users)
    try {
        const billingCheck = await withTimeout(
            billing.check({ plans: [MONTHLY_PLAN], isTest: IS_TEST_CHARGE }),
            5000
        );

        if (billingCheck.hasActivePayment) {
            // Newly confirmed Pro — cache to DB so future requests use fast path
            withRetry(() =>
                prisma.settings.updateMany({
                    where: { shop: session.shop },
                    data: { plan: "EMPIRE_PRO" },
                })
            ).catch((e) => console.warn("[billing] Failed to cache Pro to DB:", e));
        }

        return billingCheck.hasActivePayment;
    } catch (error) {
        console.warn("[billing] billing.check() failed/timed out:", (error as Error).message);
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
