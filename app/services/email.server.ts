import { Resend } from 'resend';
import prisma from '../db.server';
import { generateUnsubscribeToken, generateTrackingToken } from '../utils/crypto.server';
import { Sentry } from '../utils/sentry.server';

// Escape user/merchant-supplied values before interpolating into email HTML.
// Prevents broken markup / injection from names, product titles, addresses, etc.
function esc(value: string | null | undefined): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export const sendReviewRequest = async (toEmail: string, customerName: string, productTitle: string, reviewLink: string, shopDomain: string) => {
    // Normalize email to lowercase so unsubscribe suppression matches regardless of
    // how Shopify cased it on different orders (CAN-SPAM). The unsubscribe link, token,
    // and the address we send to all derive from this normalized value.
    toEmail = (toEmail || "").trim().toLowerCase();
    // 1. Check if user is unsubscribed
    const isUnsubscribed = await prisma.unsubscriber.findUnique({
        where: { email_shop: { email: toEmail, shop: shopDomain } }
    });
    if (isUnsubscribed) {
        console.log(`Skipping email to ${toEmail}: User has unsubscribed.`);
        return { success: false, error: "User unsubscribed" };
    }

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.error("Missing RESEND_API_KEY");
        return { success: false, error: "Configuration Error" };
    }

    const resend = new Resend(apiKey);
    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl) {
        console.error("Missing SHOPIFY_APP_URL");
        return { success: false, error: "Configuration Error" };
    }

    // Signed unsubscribe link to prevent URL tampering
    const token = generateUnsubscribeToken(toEmail, shopDomain);
    const unsubscribeLink = `${appUrl.trim()}/api/unsubscribe?token=${token}&email=${encodeURIComponent(toEmail)}&shop=${encodeURIComponent(shopDomain)}`;

    try {
        // Fetch the store owner's email and physical address
        const shopSettings = await prisma.settings.findFirst({
            where: { shop: shopDomain },
            select: { physicalAddress: true } as any
        });
        const shopSession = await prisma.session.findFirst({
            where: { shop: shopDomain },
            select: { email: true }
        });
        const replyToEmail = shopSession?.email || "support@empirereviews.com";
        const physicalAddress = (shopSettings as any)?.physicalAddress;

        // CAN-SPAM requirement: physical address is mandatory before sending
        if (!physicalAddress) {
            console.warn(`[email] Skipping email send to ${toEmail} for shop ${shopDomain}: physicalAddress not configured (CAN-SPAM requirement). Set it in Settings > Automation.`);
            return { success: false, error: "physicalAddress not configured" };
        }

        // CAN-SPAM compliant footer with actual physical address
        const footer = buildComplianceFooter(shopDomain, unsubscribeLink, physicalAddress);

        let data, error;
        for (let attempt = 1; attempt <= 3; attempt++) {
            const res = await resend.emails.send({
                from: `${shopDomain} <reviews@${process.env.verified_domain || 'empirereviews.com'}>`,
                replyTo: replyToEmail,
                to: [toEmail],
                subject: `How was your order from ${shopDomain}?`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="text-align:center; padding: 24px 0 16px;">
                            <img src="${(process.env.SHOPIFY_APP_URL || '').trim()}/logo-full.png" alt="Empire Reviews" style="height: 56px; width: auto;" />
                        </div>
                        <h2>Hi ${esc(customerName || 'there')},</h2>
                        <p>Thank you for buying <strong>${esc(productTitle)}</strong>.</p>
                        <p>We'd love to hear what you think!</p>
                        <br/>
                        <a href="${esc(reviewLink)}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Write a Review</a>
                        ${footer}
                    </div>
                `,
                headers: {
                    'List-Unsubscribe': `<${unsubscribeLink}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                }
            });
            data = res.data;
            error = res.error;

            if (!error || (error as any).statusCode < 500) break; // Don't retry client errors
            if (attempt < 3) {
                console.warn(`Resend failed (attempt ${attempt}/3). Retrying...`);
                await new Promise(r => setTimeout(r, attempt * 1000)); // Exponential backoff
            }
        }

        if (error) {
            console.error("Resend Error after retries:", error);
            return { success: false, error };
        }

        return { success: true, id: data?.id };
    } catch (e) {
        console.error("Email Send Exception:", e);

        Sentry.captureException(e, {
            tags: {
                operation: 'review_request_send',
                shop: shopDomain,
            },
            extra: {
                toEmail,
                customerName,
                productTitle,
            }
        });

        return { success: false, error: e };
    }
};

export const sendCampaignEmail = async (shopDomain: string, toEmail: string, subject: string, bodyHtml: string, trackingId: string) => {
    // Normalize email to lowercase so unsubscribe suppression matches regardless of case.
    toEmail = (toEmail || "").trim().toLowerCase();
    // 1. Check if user is unsubscribed
    const isUnsubscribed = await prisma.unsubscriber.findUnique({
        where: { email_shop: { email: toEmail, shop: shopDomain } }
    });
    if (isUnsubscribed) {
        console.log(`Skipping campaign email to ${toEmail}: User has unsubscribed.`);
        return { success: false, error: "User unsubscribed" };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { success: false, error: "Configuration Error" };

    const resend = new Resend(apiKey);
    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl) return { success: false, error: "Configuration Error" };

    // Signed unsubscribe link to prevent URL tampering
    const token = generateUnsubscribeToken(toEmail, shopDomain);
    const unsubscribeLink = `${appUrl.trim()}/api/unsubscribe?token=${token}&email=${encodeURIComponent(toEmail)}&shop=${encodeURIComponent(shopDomain)}`;

    try {
        // Fetch physical address for CAN-SPAM compliance
        const shopSettings = await prisma.settings.findFirst({
            where: { shop: shopDomain },
            select: { physicalAddress: true } as any
        });
        const physicalAddress = (shopSettings as any)?.physicalAddress;

        // CAN-SPAM requirement: physical address is mandatory before sending
        if (!physicalAddress) {
            console.warn(`[email] Skipping campaign email to ${toEmail} for shop ${shopDomain}: physicalAddress not configured (CAN-SPAM requirement). Set it in Settings > Automation.`);
            return { success: false, error: "physicalAddress not configured" };
        }

        // CAN-SPAM compliant footer with actual physical address
        const footer = buildComplianceFooter(shopDomain, unsubscribeLink, physicalAddress);

        // Fetch the store owner's email to use as Reply-To
        const shopSession = await prisma.session.findFirst({
            where: { shop: shopDomain },
            select: { email: true }
        });
        const replyToEmail = shopSession?.email || "support@empirereviews.com";

        // Signed open-tracking pixel. The token prevents anyone from inflating
        // open/click metrics by hitting the tracking endpoints with a guessed sendId.
        let trackingPixel = '';
        if (trackingId) {
            const trackingToken = generateTrackingToken(trackingId);
            const pixelUrl = `${appUrl.trim()}/api/track/open/${encodeURIComponent(trackingId)}?t=${trackingToken}`;
            trackingPixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
        }

        const payload: any = {
            from: `${shopDomain} <reviews@${process.env.verified_domain || 'empirereviews.com'}>`,
            replyTo: replyToEmail,
            to: [toEmail],
            subject: subject,
            html: `<div style="font-family: sans-serif; color: #333;">${bodyHtml.replace(/\\n/g, '<br/>')}</div>${footer}${trackingPixel}`,
            headers: {
                'List-Unsubscribe': `<${unsubscribeLink}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
        };

        if (trackingId) {
            payload.tags = [{ name: "sendId", value: trackingId }];
        }

        let data, error;
        for (let attempt = 1; attempt <= 3; attempt++) {
            const res = await resend.emails.send(payload);
            data = res.data;
            error = res.error;

            if (!error || (error as any).statusCode < 500) break;
            if (attempt < 3) {
                console.warn(`Campaign Resend failed (attempt ${attempt}/3). Retrying...`);
                await new Promise(r => setTimeout(r, attempt * 1000));
            }
        }

        if (error) {
            console.error("Campaign Resend Error after retries:", error);
            return { success: false, error };
        }
        return { success: true, id: data?.id };

    } catch (e) {
        console.error("Campaign Send Exception:", e);

        Sentry.captureException(e, {
            tags: {
                operation: 'campaign_email_send',
                shop: shopDomain,
            },
            extra: {
                toEmail,
                subject,
                trackingId,
            }
        });

        return { success: false, error: e };
    }
};

/**
 * Send a loyalty reward (discount code) to a shopper after their review is approved.
 * This is a TRANSACTIONAL email (triggered by the customer's own action), so unlike
 * marketing campaigns it does not hard-require a physical address. It still honors
 * unsubscribe suppression as a courtesy.
 */
export const sendRewardEmail = async (
    toEmail: string,
    shopDomain: string,
    discountCode: string,
    amountLabel: string
) => {
    toEmail = (toEmail || "").trim().toLowerCase();
    if (!toEmail) return { success: false, error: "No recipient" };

    const isUnsubscribed = await prisma.unsubscriber.findUnique({
        where: { email_shop: { email: toEmail, shop: shopDomain } },
    });
    if (isUnsubscribed) return { success: false, error: "User unsubscribed" };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { success: false, error: "Configuration Error" };
    const appUrl = (process.env.SHOPIFY_APP_URL || "").trim();

    const resend = new Resend(apiKey);
    try {
        const shopSession = await prisma.session.findFirst({
            where: { shop: shopDomain },
            select: { email: true },
        });
        const replyToEmail = shopSession?.email || "support@empirereviews.com";

        const { error } = await resend.emails.send({
            from: `${shopDomain} <reviews@${process.env.verified_domain || "empirereviews.com"}>`,
            replyTo: replyToEmail,
            to: [toEmail],
            subject: `Your reward from ${shopDomain} 🎁`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; text-align:center;">
                    ${appUrl ? `<div style="padding: 24px 0 8px;"><img src="${appUrl}/logo-full.png" alt="Empire Reviews" style="height: 48px; width:auto;" /></div>` : ""}
                    <h2>Thank you for your review!</h2>
                    <p>As a thank-you, here's <strong>${esc(amountLabel)} off</strong> your next order:</p>
                    <div style="margin: 20px auto; display:inline-block; border:2px dashed #6d28d9; border-radius:10px; padding:14px 28px; font-size:1.4rem; font-weight:800; letter-spacing:2px; color:#6d28d9;">
                        ${esc(discountCode)}
                    </div>
                    <p style="color:#666; font-size:0.9rem;">Apply this code at checkout. One use per customer.</p>
                </div>
            `,
        });

        if (error) {
            console.error("Reward email error:", error);
            return { success: false, error };
        }
        return { success: true };
    } catch (e) {
        console.error("Reward email exception:", e);
        return { success: false, error: e };
    }
};

/**
 * Build a CAN-SPAM compliant email footer.
 * Includes shop identity, physical address, and unsubscribe link.
 */
function buildComplianceFooter(shopDomain: string, unsubscribeLink: string, physicalAddress?: string | null): string {
    const addressLine = physicalAddress
        ? `<p style="margin: 0 0 8px 0;">${esc(physicalAddress)}</p>`
        : `<p style="margin: 0 0 8px 0; color: #f59e0b;">⚠️ Please add your business address in Settings &gt; Automation to comply with CAN-SPAM.</p>`;

    return `
        <br/><br/>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 11px; color: #888; line-height: 1.6;">
            <tr>
                <td align="center">
                    <p style="margin: 0 0 8px 0;">Sent by <strong>${esc(shopDomain)}</strong> via Empire Reviews</p>
                    ${addressLine}
                    <p style="margin: 0;">
                        <a href="${unsubscribeLink}" style="color: #888; text-decoration: underline;">
                            Unsubscribe from future emails
                        </a>
                    </p>
                </td>
            </tr>
        </table>
    `;
}

