import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { sendReviewRequest } from "../services/email.server";
import shopify, { sessionStorage } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // 1. Security Check
    // if (process.env.CRON_SECRET && request.headers.get("Authorization") !== \`Bearer \${process.env.CRON_SECRET}\`) {
    //     return json({ error: "Unauthorized" }, { status: 401 });
    // }

    console.log("⏱️ CRON: Processing Review Request Queue...");

    // 2. Fetch Pending Orders (Candidates)
    // We fetch a batch of "pending" orders regardless of date first, then filter by their shop's delay.
    // Optimization: Only fetch orders > 1 day old (minimum delay) to reduce set size.
    const minDelayThreshold = new Date();
    minDelayThreshold.setDate(minDelayThreshold.getDate() - 1);

    const pendingOrders = await prisma.order.findMany({
        where: {
            createdAt: { lt: minDelayThreshold },
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

    console.log(\`🔍 Analyzing \${pendingOrders.length} candidates across \${uniqueShops.length} shops.\`);
    const results = [];

    for (const order of pendingOrders) {
        if (!order.customerEmail) continue;

        // check delay
        const delayDays = delayMap[order.shop] || 3;
        const sendThreshold = new Date();
        sendThreshold.setDate(sendThreshold.getDate() - delayDays);

        // If order was created BEFORE the threshold (e.g. Created 5 days ago, Delay 3 days -> Send)
        if (order.createdAt > sendThreshold) {
            // Too soon
            // console.log(\`Skipping order \${order.id}: Too soon (Delay: \${delayDays} days)\`);
            continue;
        }

        const reviewLink = \`https://\${order.shop}/account\`; 

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

            // C. Integrate with Shopify Timeline
            try {
                const sessionId = shopify.session.getOfflineId(order.shop);
                const session = await sessionStorage.loadSession(sessionId);

                if (session) {
                    const client = new shopify.clients.Graphql({ session });
                    await client.request(
                        \`#graphql
                        mutation parse($id: ID!) {
                            orderUpdate(input: {id: $id, note: "📨 Empire Reviews: Review Request Email Sent"}) {
                                userErrors { field message }
                            }
                        }\`,
                        { variables: { id: order.id } }
                    );
                }
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
