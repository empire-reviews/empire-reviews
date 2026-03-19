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
    const results = [];

    for (const order of pendingOrders) {
        if (!order.customerEmail) continue;

        let fulfilledAt = order.fulfilledAt;
        let deliveredAt = order.deliveredAt;

        // If we don't know the dates yet, fetch them from Shopify
        if (!fulfilledAt && !deliveredAt) {
            try {
                const { admin } = await unauthenticated.admin(order.shop);
                const response = await admin.graphql(
                    `#graphql
                    query getOrderFulfillment($id: ID!) {
                        order(id: $id) {
                            fulfillments {
                                createdAt
                                events(first: 10) {
                                    nodes {
                                        status
                                        happenedAt
                                    }
                                }
                            }
                        }
                    }`,
                    { variables: { id: order.id } }
                );
                
                const data = await response.json();
                const shopifyOrder = data?.data?.order;
                
                if (shopifyOrder?.fulfillments && shopifyOrder.fulfillments.length > 0) {
                    const firstFulfillment = shopifyOrder.fulfillments[0];
                    if (firstFulfillment.createdAt) {
                        fulfilledAt = new Date(firstFulfillment.createdAt);
                    }
                    
                    for (const f of shopifyOrder.fulfillments) {
                        if (f.events?.nodes) {
                            const deliveredEvent = f.events.nodes.find((e: any) => e.status === 'DELIVERED');
                            if (deliveredEvent && deliveredEvent.happenedAt) {
                                deliveredAt = new Date(deliveredEvent.happenedAt);
                            }
                        }
                    }

                    // Save back to DB so we don't have to keep querying if it's already fulfilled but just waiting on the delay
                    await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            ...(fulfilledAt && { fulfilledAt }),
                            ...(deliveredAt && { deliveredAt }),
                        }
                    });
                }
            } catch (error) {
                console.error(`Failed to fetch fulfillment status for ${order.id}:`, error);
            }
        }

        // If we STILL don't have shipping dates after the API check, it hasn't shipped yet. Wait.
        if (!fulfilledAt && !deliveredAt) {
            continue;
        }

        const delayDays = delayMap[order.shop] || 3;
        const sendThreshold = new Date();
        sendThreshold.setDate(sendThreshold.getDate() - delayDays);

        // Determine the base date to measure the delay from.
        // Priority: Delivered date > Fulfilled date > Created date (fallback)
        const baseDate = deliveredAt || fulfilledAt || order.createdAt;

        // If the base date is newer than the threshold, it hasn't been long enough
        if (baseDate > sendThreshold) {
            continue;
        }

        // Fetch active psychology template
        const activeCampaign = await prisma.campaign.findFirst({
            where: { shop: order.shop, status: "active" }
        });

        const subjectTemplate = activeCampaign?.subject || "How was your order from {{ store_name }}?";
        const bodyTemplate = activeCampaign?.body || "Hi {{ name }},\n\nWe hope you're loving your new order!\n\nCould you spare 30 seconds to help a small business grow? It would mean the world to us.\n\n{{ review_link }}";

        let reviewLink = activeCampaign ? `https://${order.shop}/account?campaignId=${activeCampaign.id}` : `https://${order.shop}/account`;
        let resolvedProductTitle = (order as any).productTitle || "your recent order";

        // Generate product-specific review link if we know the product
        if ((order as any).productId) {
            try {
                const { admin } = await unauthenticated.admin(order.shop);
                const response = await admin.graphql(
                    `#graphql
                    query getProductHandle($id: ID!) {
                        product(id: $id) {
                            handle
                        }
                    }`,
                    { variables: { id: order.productId } }
                );
                const pData = await response.json();
                const handle = pData?.data?.product?.handle;
                if (handle) {
                    reviewLink = activeCampaign 
                        ? `https://${order.shop}/products/${handle}?campaignId=${activeCampaign.id}#empire-reviews`
                        : `https://${order.shop}/products/${handle}#empire-reviews`;
                }
            } catch (err) {
                console.error(`Failed to fetch product handle for ${(order as any).productId}`, err);
            }
        }

        const buttonHtml = `<div style="text-align: center; margin-top: 30px;"><a href="${reviewLink}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px; text-decoration: none; display: inline-block;">Write a Review</a></div>`;

        const personalizedBody = bodyTemplate
            .replace(/\\\\n/g, '\\n') // Handle escaped newlines from DB
            .replace(/\\n/g, '<br/>')
            .replace(/\n/g, '<br/>')
            .replace(/{{ name }}/g, "Customer")
            .replace(/{{ store_name }}/g, order.shop)
            .replace(/{{ product_title }}/g, resolvedProductTitle)
            .replace(/{{ review_link }}/g, buttonHtml);

        const personalizedSubject = subjectTemplate
            .replace(/{{ store_name }}/g, order.shop)
            .replace(/{{ product_title }}/g, resolvedProductTitle);

        // A. Send Email via Resend using Campaign logic
        const emailResult = await sendCampaignEmail(
            order.shop,
            order.customerEmail,
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

            // C. Integrate with Shopify Timeline (unauthenticated admin access for cron)
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
                console.error("Failed to update Shopify Order:", shopifyError);
            }

            results.push({ id: order.id, status: "sent" });
        } else {
            await prisma.order.update({
                where: { id: order.id },
                data: { reviewRequestStatus: "failed" }
            });
            results.push({ id: order.id, status: "failed", error: emailResult.error });
        }
    }

    return json({ success: true, processed: results.length, results });
};
