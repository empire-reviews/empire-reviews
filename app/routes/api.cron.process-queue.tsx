import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { sendReviewRequest } from "../services/email.server";
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

        const reviewLink = `https://${order.shop}/account`;

        // A. Send Email via Resend
        const emailResult = await sendReviewRequest(
            order.customerEmail,
            "Customer",
            "your recent order",
            reviewLink,
            order.shop
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
