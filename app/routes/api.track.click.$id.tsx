import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import prisma from "../db.server";
import { verifyTrackingToken } from "../utils/crypto.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const sendId = params.id;
    const url = new URL(request.url);
    let targetUrl = url.searchParams.get("target") || "/";
    const token = url.searchParams.get("t");

    // IDOR protection: only record the click if the token verifies for this sendId.
    if (sendId && verifyTrackingToken(sendId, token)) {
        try {
            // Use a transaction to prevent race conditions on concurrent clicks
            await prisma.$transaction(async (tx) => {
                const send = await tx.campaignSend.findUnique({ 
                    where: { id: sendId },
                    include: { campaign: { select: { shop: true } } }
                });

                if (send) {
                    // Open Redirect Protection: Only allow relative paths, *.myshopify.com,
                    // or the merchant's exact domain. Use exact/suffix matching (not
                    // .includes) so `shop.myshopify.com.evil.com` is rejected, and only
                    // permit http(s) schemes so javascript:/data: targets are blocked.
                    try {
                        const parsedTarget = new URL(targetUrl, "http://dummy.com");
                        const host = parsedTarget.hostname;
                        const shop = send.campaign.shop;
                        const isRelative = host === "dummy.com";
                        const allowedScheme =
                            isRelative ||
                            parsedTarget.protocol === "https:" ||
                            parsedTarget.protocol === "http:";
                        const allowedHost =
                            isRelative ||
                            host.endsWith(".myshopify.com") ||
                            host === shop ||
                            host.endsWith("." + shop);
                        if (!allowedScheme || !allowedHost) {
                            targetUrl = `https://${shop}`;
                        }
                    } catch (e) { targetUrl = "/"; }
                    const updates: any = {};
                    const metricIncrements: any = {
                        totalClicked: { increment: 1 }
                    };

                    // 1. Always track the click
                    if (!send.clickedAt) {
                        updates.clickedAt = new Date();
                    }

                    // 2. INFER OPEN: If they clicked, they must have opened it
                    if (!send.openedAt) {
                        updates.openedAt = new Date();
                        metricIncrements.totalOpened = { increment: 1 };
                    }

                    if (Object.keys(updates).length > 0) {
                        await tx.campaignSend.update({
                            where: { id: sendId },
                            data: updates
                        });

                        // Fetch current metrics for rate recalculation
                        const metrics = await tx.campaignMetrics.findUnique({
                            where: { campaignId: send.campaignId }
                        });

                        if (metrics) {
                            const newTotalClicked = metrics.totalClicked + 1;
                            const newTotalOpened = metricIncrements.totalOpened
                                ? metrics.totalOpened + 1
                                : metrics.totalOpened;
                            const totalSent = metrics.totalSent || 1;

                            await tx.campaignMetrics.update({
                                where: { campaignId: send.campaignId },
                                data: {
                                    ...metricIncrements,
                                    clickRate: (newTotalClicked / totalSent) * 100,
                                    openRate: (newTotalOpened / totalSent) * 100
                                }
                            });
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Failed to track click:", error);
        }
    }

    return redirect(targetUrl);
};
