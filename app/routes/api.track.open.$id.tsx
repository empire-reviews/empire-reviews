import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
    const sendId = params.id;

    if (sendId) {
        try {
            // Update the openedAt timestamp only if it hasn't been opened yet (unique opens)
            // or update last opened. For simplicity, we just update it.
            const send = await prisma.campaignSend.findUnique({ where: { id: sendId } });

            if (send && !send.openedAt) {
                await prisma.campaignSend.update({
                    where: { id: sendId },
                    data: { openedAt: new Date() }
                });

                // Update the aggregate metrics
                await prisma.campaignMetrics.update({
                    where: { campaignId: send.campaignId },
                    data: {
                        totalOpened: { increment: 1 },
                        openRate: { set: 0 } // Re-calc needed
                    }
                });

                // Recalculate rates (Separate query to be accurate)
                // In a real high-scale app, we'd use a background job.
                const metrics = await prisma.campaignMetrics.findUnique({ where: { campaignId: send.campaignId } });
                if (metrics) {
                    const newOpenRate = (metrics.totalOpened / (metrics.totalSent || 1)) * 100;
                    await prisma.campaignMetrics.update({
                        where: { id: metrics.id },
                        data: { openRate: newOpenRate }
                    });
                }
            }
        } catch (error) {
            console.error("Failed to track open:", error);
        }
    }

    // Return a 1x1 transparent GIF
    const transparentGif = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64"
    );

    return new Response(transparentGif, {
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    });
};
