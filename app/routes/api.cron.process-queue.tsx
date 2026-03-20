import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { sendCampaignEmail } from "../services/email.server";
import { unauthenticated } from "../shopify.server";
import { sendWithRateLimit } from "../utils/rate-limiter.server";
import { Sentry } from "../utils/sentry.server";

// Named constants — no magic numbers
const CRON_CONFIG = {
    BATCH_SIZE: 50,           // Max orders to fetch per run
    MAX_EMAILS_PER_SECOND: 5, // Resend rate limit buffer (actual limit is 10/s)
    DEFAULT_DELAY_DAYS: 3,    // Default days after fulfillment to send email
} as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // 1. SECURITY: Always require CRON_SECRET authentication
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error("❌ CRON_SECRET not set in environment variables");
        return json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
        const ip = request.headers.get("x-forwarded-for") ||
                   request.headers.get("x-real-ip") ||
                   "unknown";
        console.warn(`⚠️ Unauthorized cron attempt from IP: ${ip}`);
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("⏱️ CRON: Processing Review Request Queue...");

    // 2. Fetch Pending Orders (Candidates)
    const pendingOrders = await prisma.order.findMany({
        where: {
            reviewRequestStatus: "pending",
            customerEmail: { not: null }
        },
        take: CRON_CONFIG.BATCH_SIZE
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
        delayMap[s.shop] = s.reviewRequestDelay || CRON_CONFIG.DEFAULT_DELAY_DAYS;
    });

    console.log(`🔍 Analyzing ${pendingOrders.length} candidates across ${uniqueShops.length} shops.`);

    // 4. Filter orders ready for sending based on fulfillment/delivery dates
    const readyOrders = pendingOrders.filter(order => {
        if (!order.customerEmail) return false;
        if (!order.fulfilledAt && !order.deliveredAt) return false;

        const delayDays = delayMap[order.shop] || CRON_CONFIG.DEFAULT_DELAY_DAYS;
        const sendThreshold = new Date();
        sendThreshold.setDate(sendThreshold.getDate() - delayDays);

        const baseDate = order.deliveredAt || order.fulfilledAt || order.createdAt;
        return baseDate <= sendThreshold;
    });

    console.log(`🚀 ${readyOrders.length} orders are ready for processing out of ${pendingOrders.length} pending.`);

    if (readyOrders.length === 0) {
        return json({ success: true, processed: 0, results: [] });
    }

    // 5. Fetch active campaigns for relevant shops
    const activeShops = [...new Set(readyOrders.map(o => o.shop))];
    const activeCampaigns = await prisma.campaign.findMany({
        where: { shop: { in: activeShops }, status: "active" }
    });
    const campaignMap: Record<string, any> = {};
    activeCampaigns.forEach(c => {
        campaignMap[c.shop] = c;
    });

    // 6. Process with rate limiting to prevent Resend blacklisting
    const batchResults = await sendWithRateLimit(
        readyOrders,
        async (order) => {
            // IDEMPOTENCY: Check if we already sent for this order+campaign combo
            const activeCampaign = campaignMap[order.shop];
            if (activeCampaign) {
                const existingSend = await prisma.campaignSend.findFirst({
                    where: {
                        orderId: order.id,
                        campaignId: activeCampaign.id
                    }
                });

                if (existingSend) {
                    console.log(`⏭️ Skipping duplicate send for order ${order.id}`);
                    // Mark as sent to avoid re-processing
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { reviewRequestStatus: "sent" }
                    });
                    return { orderId: order.id, status: "skipped_duplicate" };
                }
            }

            const subjectTemplate = activeCampaign?.subject || "How was your order from {{ store_name }}?";
            const bodyTemplate = activeCampaign?.body || "Hi {{ name }},\n\nWe hope you're loving your new order!\n\nCould you spare 30 seconds to help a small business grow? It would mean the world to us.\n\n{{ review_link }}";

            const reviewLink = activeCampaign
                ? `https://${order.shop}/account?campaignId=${activeCampaign.id}`
                : `https://${order.shop}/account`;
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

            // A. Create CampaignSend record BEFORE sending (for idempotency)
            let sendRecord = null;
            if (activeCampaign) {
                sendRecord = await prisma.campaignSend.create({
                    data: {
                        campaignId: activeCampaign.id,
                        customerEmail: order.customerEmail!,
                        orderId: order.id,
                        sentAt: new Date()
                    }
                });
            }

            // B. Send Email via Resend (with rate limiting + retries built-in)
            const emailResult = await sendCampaignEmail(
                order.shop,
                order.customerEmail as string,
                personalizedSubject,
                personalizedBody,
                sendRecord?.id || `cron-${order.id}`
            );

            if (emailResult.success) {
                // C. Update Order status
                await prisma.order.update({
                    where: { id: order.id },
                    data: {
                        reviewRequestStatus: "sent",
                        reviewRequestSentAt: new Date()
                    }
                });

                // D. Update campaign metrics
                if (activeCampaign) {
                    await prisma.campaignMetrics.upsert({
                        where: { campaignId: activeCampaign.id },
                        update: { totalSent: { increment: 1 } },
                        create: {
                            campaignId: activeCampaign.id,
                            totalSent: 1
                        }
                    });
                }

                // E. Update Shopify Timeline (non-critical, don't block on failure)
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

                    Sentry.captureException(shopifyError, {
                        tags: {
                            operation: 'shopify_timeline_update',
                            shop: order.shop,
                        },
                        extra: {
                            orderId: order.id,
                        }
                    });
                }

                return { orderId: order.id, status: "sent" };
            } else {
                // Clean up the send record if email failed
                if (sendRecord) {
                    await prisma.campaignSend.delete({ where: { id: sendRecord.id } }).catch(() => {});
                }

                await prisma.order.update({
                    where: { id: order.id },
                    data: { reviewRequestStatus: "failed" }
                });

                throw new Error(emailResult.error as string);
            }
        },
        {
            maxPerSecond: CRON_CONFIG.MAX_EMAILS_PER_SECOND,
            onProgress: (current, total) => {
                console.log(`📧 Processing: ${current}/${total} emails`);
            }
        }
    );

    // Collect results
    const results = batchResults.map(({ item, result, error }) => {
        if (error) {
            return { id: item.id, status: "failed", error: error.message || String(error) };
        }
        return result;
    });

    const sent = results.filter((r: any) => r.status === "sent").length;
    const failed = results.filter((r: any) => r.status === "failed").length;
    const skipped = results.filter((r: any) => r.status === "skipped_duplicate").length;

    console.log(`✅ CRON Complete: ${sent} sent, ${failed} failed, ${skipped} skipped (duplicates)`);

    return json({ success: true, processed: results.length, sent, failed, skipped, results });
};
