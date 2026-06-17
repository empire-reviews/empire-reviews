import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { verifyTrackingToken } from "../utils/crypto.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const sendId = params.id;
    const token = new URL(request.url).searchParams.get("t");

    // IDOR protection: only record the open if the token verifies for this sendId.
    // Always return the pixel either way so we don't leak validity.
    if (sendId && verifyTrackingToken(sendId, token)) {
        try {
            // Use a transaction to prevent race conditions on concurrent opens
            await prisma.$transaction(async (tx) => {
                const send = await tx.campaignSend.findUnique({ where: { id: sendId } });

                if (send && !send.openedAt) {
                    await tx.campaignSend.update({
                        where: { id: sendId },
                        data: { openedAt: new Date() }
                    });

                    // Atomically increment and recalculate in one transaction
                    const metrics = await tx.campaignMetrics.findUnique({
                        where: { campaignId: send.campaignId }
                    });

                    if (metrics) {
                        const newOpenRate = ((metrics.totalOpened + 1) / (metrics.totalSent || 1)) * 100;
                        await tx.campaignMetrics.update({
                            where: { campaignId: send.campaignId },
                            data: {
                                totalOpened: { increment: 1 },
                                openRate: newOpenRate
                            }
                        });
                    }
                }
            });
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
