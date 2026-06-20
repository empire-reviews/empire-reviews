import prisma from "../db.server";

// Loyalty rewards: when a merchant approves a review, optionally mint a one-time
// Shopify discount code and record it as a Reward. Delivery of the code to the
// shopper happens via email (services/email.server.ts → sendRewardEmail).
//
// Design rules:
//  - Idempotent: never issue more than one reward per review (keyed by reviewId).
//  - Eligibility gated by merchant Settings (min rating, optional photo requirement).
//  - Requires a customer email (otherwise the code can't be delivered) — skip silently.
//  - Failures here must NEVER block the review approval; callers wrap in try/catch
//    but this function also swallows its own errors and returns a result object.

type AdminClient = { graphql: (query: string, opts?: any) => Promise<Response> };

export type RewardResult =
    | { issued: true; code: string; amount: string }
    | { issued: false; reason: string };

function randomCode(): string {
    // Readable, unambiguous code (no 0/O/1/I)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `THANKS-${s}`;
}

export async function issueReviewReward(
    admin: AdminClient,
    shop: string,
    review: { id: string; rating: number; customerEmail: string | null; media?: { id: string }[] },
    settings: any
): Promise<RewardResult> {
    try {
        if (!settings?.enableRewards) return { issued: false, reason: "rewards_disabled" };
        if (review.rating < (settings.rewardMinRating || 1)) return { issued: false, reason: "below_min_rating" };
        if (settings.rewardRequirePhoto && !(review.media && review.media.length > 0)) {
            return { issued: false, reason: "photo_required" };
        }
        if (!review.customerEmail) return { issued: false, reason: "no_email" };

        // Idempotency — one reward per review.
        const existing = await prisma.reward.findFirst({ where: { shop, reviewId: review.id } });
        if (existing) return { issued: false, reason: "already_issued" };

        const type = settings.rewardType === "fixed" ? "fixed" : "percentage";
        const value = Number(settings.rewardValue) || 10;
        const code = randomCode();
        const amountLabel = type === "fixed" ? `${value}` : `${value}%`;

        // Build the customerGets value for the Shopify discount mutation.
        const customerGetsValue =
            type === "fixed"
                ? { discountAmount: { amount: value.toFixed(2), appliesOnEachItem: false } }
                : { percentage: Math.min(value, 100) / 100 };

        const resp = await admin.graphql(
            `#graphql
            mutation reviewRewardCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                    codeDiscountNode { id }
                    userErrors { field message }
                }
            }`,
            {
                variables: {
                    basicCodeDiscount: {
                        title: `Review reward ${code}`,
                        code,
                        startsAt: new Date().toISOString(),
                        customerSelection: { all: true },
                        customerGets: {
                            value: customerGetsValue,
                            items: { all: true },
                        },
                        appliesOncePerCustomer: true,
                        usageLimit: 1,
                    },
                },
            }
        );

        const data = await resp.json();
        const userErrors = data?.data?.discountCodeBasicCreate?.userErrors || [];
        if (userErrors.length > 0) {
            console.error("[rewards] discount creation userErrors:", userErrors);
            return { issued: false, reason: "shopify_error" };
        }

        await prisma.reward.create({
            data: {
                shop,
                reviewId: review.id,
                customerEmail: review.customerEmail,
                discountCode: code,
                amount: amountLabel,
                status: "issued",
            },
        });

        return { issued: true, code, amount: amountLabel };
    } catch (err) {
        console.error("[rewards] issueReviewReward failed:", err);
        return { issued: false, reason: "exception" };
    }
}
