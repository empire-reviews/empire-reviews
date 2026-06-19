import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import prisma from "../db.server";
import { verifyTrackingToken } from "../utils/crypto.server";

/**
 * Open-redirect guard. Returns a SAFE redirect target derived from the
 * attacker-controllable `target` param. Only relative paths, *.myshopify.com,
 * or the merchant's exact domain (when known) are honored. Uses exact/suffix
 * matching (not .includes) so `shop.myshopify.com.evil.com` is rejected, and
 * only permits http(s) schemes so javascript:/data: targets are blocked.
 *
 * @param rawTarget the raw `?target=` value
 * @param shop      the verified merchant domain, or null when there's no valid send/shop context
 * @returns a validated URL string that is always safe to redirect to
 */
function safeRedirectTarget(rawTarget: string, shop: string | null): string {
    try {
        const parsedTarget = new URL(rawTarget, "http://dummy.com");
        const host = parsedTarget.hostname;
        const isRelative = host === "dummy.com";
        const allowedScheme =
            isRelative ||
            parsedTarget.protocol === "https:" ||
            parsedTarget.protocol === "http:";
        const allowedHost =
            isRelative ||
            host.endsWith(".myshopify.com") ||
            (!!shop && (host === shop || host.endsWith("." + shop)));
        if (allowedScheme && allowedHost) {
            // Relative path: return path+query as-is. Absolute: return parsed href.
            return isRelative ? `${parsedTarget.pathname}${parsedTarget.search}` : parsedTarget.href;
        }
    } catch (e) { /* fall through to safe default */ }
    // Validation failed — never redirect to the raw attacker URL.
    return shop ? `https://${shop}` : "/";
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const sendId = params.id;
    const url = new URL(request.url);
    const rawTarget = url.searchParams.get("target") || "/";
    const token = url.searchParams.get("t");

    // Track the shop derived from a verified send so the redirect can be
    // validated against the merchant's own domain. Stays null on the
    // invalid/absent-token path → only relative/myshopify targets are allowed.
    let verifiedShop: string | null = null;

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
                    verifiedShop = send.campaign.shop;
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

    // Validate UNCONDITIONALLY before any redirect — including the invalid/absent-token
    // path. On failure (or no valid shop context) this returns a safe default, never
    // the raw attacker-supplied URL.
    return redirect(safeRedirectTarget(rawTarget, verifiedShop));
};
