import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { sendCampaignEmail } from "../services/email.server";
import { unauthenticated } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // 1. Security Check — require CRON_SECRET to prevent public access
    if (process.env.CRON_SECRET && request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("⏱️ CRON: Processing Review Request Queue...");

    // 2. Fetch Pending Orders (Candidates)
    // We fetch a batch of "pending" orders regardless of date first, then filter by their shop's delay.
    // Optimization: Only fetch orders > 1 day old (minimum delay) to reduce set size.
    const minDelayThreshold = new Date();
    minDelayThreshold.setDate(minDelayThreshold.getDate() - 1);

    const pendingOrders = await prisma.order.findMany({
        where: {
            reviewRequestStatus: "pending",
            customerEmail: { not: null }
        },
        take: 50 // Process 50 at a time
    });

    if (pendingOrders.length === 0) {
        return json({ success: true, message: "No pending orders found." });
    }

    // 3. Fetch Settings for these Shops to get Delays
    const uniqueShops = [...new Set(pendingOrders.map(o => o.shop))];
    const shopSettings = await prisma.settings.findMany({
        where: { shop: { in: uniqueShops } },
        select: { shop: true, reviewRequestDelay: true }
    });

    const delayMap: Record<string, number> = {};
    shopSettings.forEach(s => {
        delayMap[s.shop] = s.reviewRequestDelay || 3; // Default 3 days
    });

    console.log(`🔍 Analyzing ${pendingOrders.length} candidates across ${uniqueShops.length} shops.`);
    const readyOrders = pendingOrders.filter(order => {
        if (!order.customerEmail) return false;
        
        // We now trust the webhooks to populate fulfilledAt and deliveredAt.
        // If neither exists, the order hasn't shipped yet.
        if (!order.fulfilledAt && !order.deliveredAt) return false;
        
        const delayDays = delayMap[order.shop] || 3;
        const sendThreshold = new Date();
        sendThreshold.setDate(sendThreshold.getDate() - delayDays);
        
        const baseDate = order.deliveredAt || order.fulfilledAt || order.createdAt;
        return baseDate <= sendThreshold; // Base date is older than threshold
    });

    console.log(`🚀 ${readyOrders.length} orders are ready for processing out of ${pendingOrders.length} pending.`);
    const results: any[] = [];

    if (readyOrders.length === 0) {
        return json({ success: true, processed: 0, results });
    }

    // Fetch active psychology templates for shops that have ready orders
    const activeShops = [...new Set(readyOrders.map(o => o.shop))];
    const activeCampaigns = await prisma.campaign.findMany({
        where: { shop: { in: activeShops }, status: "active" }
    });
    const campaignMap: Record<string, any> = {};
    activeCampaigns.forEach(c => {
        campaignMap[c.shop] = c;
    });

    // Batch processing to prevent serverless timeouts while respecting API rate limits
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < readyOrders.length; i += BATCH_SIZE) {
        const batch = readyOrders.slice(i, i + BATCH_SIZE);
        
        await Promise.allSettled(batch.map(async (order) => {
            const activeCampaign = campaignMap[order.shop];
            const subjectTemplate = activeCampaign?.subject || "How was your order from {{ store_name }}?";
            const bodyTemplate = activeCampaign?.body || "Hi {{ name }},\n\nWe hope you're loving your new order!\n\nCould you spare 30 seconds to help a small business grow? It would mean the world to us.\n\n{{ review_link }}";

            // Fallback to customer account if we don't have custom handle mapping
            const reviewLink = activeCampaign ? `https://${order.shop}/account?campaignId=${activeCampaign.id}` : `https://${order.shop}/account`;
            const resolvedProductTitle = (order as any).productTitle || "your recent order";

            const buttonHtml = `<div style="text-align: center; margin-top: 30px;"><a href="${reviewLink}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px; text-decoration: none; display: inline-block;">Write a Review</a></div>`;

            const personalizedBody = bodyTemplate
                .replace(/\\\\n/g, '\\n')
                .replace(/\\n/g, '<br/>')
                .replace(/\n/g, '<br/>')
                .replace(/{{ name }}/g, "Customer")
                .replace(/{{ store_name }}/g, order.shop)
                .replace(/{{ product_title }}/g, resolvedProductTitle)
                .replace(/{{ review_link }}/g, buttonHtml);

            const personalizedSubject = subjectTemplate
                .replace(/{{ store_name }}/g, order.shop)
                .replace(/{{ product_title }}/g, resolvedProductTitle);

            // A. Send Email via Resend
            const emailResult = await sendCampaignEmail(
                order.shop,
                order.customerEmail as string,
                personalizedSubject,
                personalizedBody,
                `cron-${order.id}`
            );

            if (emailResult.success) {
                // B. Update Database
                await prisma.order.update({
                    where: { id: order.id },
                    data: {
                        reviewRequestStatus: "sent",
                        reviewRequestSentAt: new Date()
                    }
                });

                // C. Integrate with Shopify Timeline (This is the only GraphQL call remaining per order)
                try {
                    const { admin } = await unauthenticated.admin(order.shop);
                    await admin.graphql(
                        `#graphql
                        mutation parse($id: ID!) {
                            orderUpdate(input: {id: $id, note: "📨 Empire Reviews: Review Request Email Sent"}) {
                                userErrors { field message }
                            }
                        }`,
                        { variables: { id: order.id } }
                    );
                } catch (shopifyError) {
                    console.error("Failed to update Shopify Order timeline:", shopifyError);
                }

                results.push({ id: order.id, status: "sent" });
            } else {
                await prisma.order.update({
                    where: { id: order.id },
                    data: { reviewRequestStatus: "failed" }
                });
                results.push({ id: order.id, status: "failed", error: emailResult.error });
            }
        }));
    }

    return json({ success: true, processed: results.length, results });
};
