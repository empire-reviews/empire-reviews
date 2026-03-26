import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const sendId = params.id;
    const url = new URL(request.url);
    let targetUrl = url.searchParams.get("target") || "/";

    if (sendId) {
        try {
            // Use a transaction to prevent race conditions on concurrent clicks
            await prisma.$transaction(async (tx) => {
                const send = await tx.campaignSend.findUnique({ 
                    where: { id: sendId },
                    include: { campaign: { select: { shop: true } } }
                });

                if (send) {
                    // Open Redirect Protection: Only allow relative, shopify, or the merchant's domain
                    try {
                        const parsedTarget = new URL(targetUrl, "http://dummy.com");
                        if (parsedTarget.hostname !== "dummy.com" && 
                            !parsedTarget.hostname.endsWith(".myshopify.com") && 
                            !parsedTarget.hostname.includes(send.campaign.shop)) {
                            targetUrl = `https://${send.campaign.shop}`;
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
