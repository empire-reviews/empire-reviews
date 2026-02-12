import { BillingInterval } from "@shopify/shopify-app-remix/server";
import { authenticate } from "./shopify.server";
import prisma from "./db.server";

export const MONTHLY_PLAN = "Empire Pro";

// Stay compatible with boolean checks
export async function hasActivePayment(request: Request) {
    const { billing, session } = await authenticate.admin(request);

    // 1. Check DB for Lifetime/Referral status (VIP Access)
    try {
        const settings = await prisma.settings.findFirst({
            where: { shop: session.shop }
        });
        if (settings?.plan === "EMPIRE_PRO") {
            return true;
        }
    } catch (e) {
        console.log("Error checking local plan status", e);
    }

    // 2. Check Shopify Billing
    try {
        const billingCheck = await billing.check({
            plans: [MONTHLY_PLAN],
            isTest: true,
        });
        return billingCheck.hasActivePayment;
    } catch (error) {
        return false;
    }
}

export async function getPlanDetails(request: Request) {
    const { billing } = await authenticate.admin(request);
    try {
        const billingCheck = await billing.check({
            plans: [MONTHLY_PLAN],
            isTest: true,
        });

        console.log("DEBUG: Billing Check Result:", JSON.stringify(billingCheck, null, 2));

        if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
            return billingCheck.appSubscriptions[0];
        }
        return null;
    } catch (error) {
        console.error("DEBUG: Billing Check Error:", error);
        return null;
    }
}

export async function requirePayment(request: Request) {
    const { billing } = await authenticate.admin(request);

    try {
        const billingCheck = await billing.check({
            plans: [MONTHLY_PLAN],
            isTest: true,
        });

        if (billingCheck.hasActivePayment) {
            return billingCheck;
        }

        return await billing.request({
            plan: MONTHLY_PLAN,
            isTest: true,
            returnUrl: "/app/settings",
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
