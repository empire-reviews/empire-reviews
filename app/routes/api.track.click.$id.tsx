import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const sendId = params.id;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("target") || "/";

    if (sendId) {
        try {
            const send = await prisma.campaignSend.findUnique({ where: { id: sendId } });

            if (send) {
                const updates: any = {};
                const metricUpdates: any = {
                    totalClicked: { increment: 1 }
                };

                // 1. Always track the click
                if (!send.clickedAt) {
                    updates.clickedAt = new Date();
                }

                // 2. INFER OPEN: If they clicked, they must have opened it
                // This fixes cases where pixels are blocked
                if (!send.openedAt) {
                    updates.openedAt = new Date();
                    metricUpdates.totalOpened = { increment: 1 };
                }

                if (Object.keys(updates).length > 0) {
                    await prisma.campaignSend.update({
                        where: { id: sendId },
                        data: updates
                    });

                    // Update aggregate metrics
                    await prisma.campaignMetrics.update({
                        where: { campaignId: send.campaignId },
                        data: metricUpdates
                    });

                    // Recalculate rates
                    const metrics = await prisma.campaignMetrics.findUnique({ where: { campaignId: send.campaignId } });
                    if (metrics) {
                        const newClickRate = metrics.totalSent > 0 ? (metrics.totalClicked / metrics.totalSent) * 100 : 0;
                        const newOpenRate = metrics.totalSent > 0 ? (metrics.totalOpened / metrics.totalSent) * 100 : 0;

                        await prisma.campaignMetrics.update({
                            where: { id: metrics.id },
                            data: {
                                clickRate: newClickRate,
                                openRate: newOpenRate
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Failed to track click:", error);
        }
    }

    return redirect(targetUrl);
};
