import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export const action = async ({ request }) => {
    const { topic, shop, payload } = await authenticate.webhook(request);
    // 🛡️ GDPR Mandatory Webhooks
    // Shopify requires these endpoints to return 200 OK.
    console.log(`Received GDPR webhook: ${topic} for shop: ${shop}`);
    try {
        if (topic === "CUSTOMERS_DATA_REQUEST") {
            // 📩 Customer is requesting their data.
            // Log what data we have for this customer so the merchant can respond.
            const customerEmail = payload?.customer?.email;
            if (customerEmail) {
                const reviews = await prisma.review.findMany({
                    where: { customerEmail },
                    select: { id: true, productId: true, rating: true, body: true, createdAt: true },
                });
                const orders = await prisma.order.findMany({
                    where: { customerEmail },
                    select: { id: true, totalPrice: true, createdAt: true },
                });
                console.log(`Customer data request for ${customerEmail}:`, {
                    reviewCount: reviews.length,
                    orderCount: orders.length,
                    reviews,
                    orders,
                });
            }
        }
        if (topic === "CUSTOMERS_REDACT") {
            // 🗑️ Customer data must be erased.
            const customerEmail = payload?.customer?.email;
            if (customerEmail) {
                // Delete reviews (ReviewMedia & Reply cascade automatically via onDelete: Cascade)
                const deletedReviews = await prisma.review.deleteMany({
                    where: { customerEmail },
                });
                // Delete campaign sends for this customer
                const deletedSends = await prisma.campaignSend.deleteMany({
                    where: { customerEmail },
                });
                // Delete orders for this customer
                const deletedOrders = await prisma.order.deleteMany({
                    where: { customerEmail },
                });
                console.log(`Customer redacted (${customerEmail}): ${deletedReviews.count} reviews, ${deletedSends.count} campaign sends, ${deletedOrders.count} orders deleted.`);
            }
        }
        if (topic === "SHOP_REDACT") {
            // 🏪 Shop uninstalled 48 hours ago — delete ALL data for this shop.
            // Order matters: delete children before parents to respect relations.
            if (shop) {
                // 1. Get all campaign IDs for this shop (needed for metrics/sends cleanup)
                const campaigns = await prisma.campaign.findMany({
                    where: { shop },
                    select: { id: true },
                });
                const campaignIds = campaigns.map((c) => c.id);
                // 2. Delete campaign metrics (references campaign)
                if (campaignIds.length > 0) {
                    await prisma.campaignMetrics.deleteMany({
                        where: { campaignId: { in: campaignIds } },
                    });
                    // 3. Delete campaign sends (references campaign)
                    await prisma.campaignSend.deleteMany({
                        where: { campaignId: { in: campaignIds } },
                    });
                    // 4. Delete campaigns
                    await prisma.campaign.deleteMany({ where: { shop } });
                }
                // 5. Delete reviews (ReviewMedia & Reply cascade automatically)
                await prisma.review.deleteMany({ where: { shop } });
                // 6. Delete orders
                await prisma.order.deleteMany({ where: { shop } });
                // 7. Delete analytics events
                await prisma.analyticsEvent.deleteMany({ where: { shop } });
                // 8. Delete settings
                await prisma.settings.deleteMany({ where: { shop } });
                // 9. Delete sessions (last, since other operations may need them)
                await prisma.session.deleteMany({ where: { shop } });
                console.log(`Shop fully redacted: ${shop}. All data deleted.`);
            }
        }
    }
    catch (error) {
        console.error(`Error processing GDPR webhook ${topic}:`, error);
        // Still return 200 to prevent retries (standard Shopify practice)
    }
    return new Response("Webhook processed", { status: 200 });
};
