import { Resend } from 'resend';
import prisma from '../db.server';
import { generateUnsubscribeToken } from '../utils/crypto.server';
import { Sentry } from '../utils/sentry.server';

export const sendReviewRequest = async (toEmail: string, customerName: string, productTitle: string, reviewLink: string, shopDomain: string) => {
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
            select: { email: true, physicalAddress: true } as any
        });
        const shopSession = await prisma.session.findFirst({
            where: { shop: shopDomain },
            select: { email: true }
        });
        const replyToEmail = shopSession?.email || "support@empirereviews.com";
        const physicalAddress = (shopSettings as any)?.physicalAddress;

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
                        <h2>Hi ${customerName || 'there'},</h2>
                        <p>Thank you for buying <strong>${productTitle}</strong>.</p>
                        <p>We'd love to hear what you think!</p>
                        <br/>
                        <a href="${reviewLink}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Write a Review</a>
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

        // CAN-SPAM compliant footer with actual physical address
        const footer = buildComplianceFooter(shopDomain, unsubscribeLink, physicalAddress);

        // Fetch the store owner's email to use as Reply-To
        const shopSession = await prisma.session.findFirst({
            where: { shop: shopDomain },
            select: { email: true }
        });
        const replyToEmail = shopSession?.email || "support@empirereviews.com";

        const payload: any = {
            from: `${shopDomain} <reviews@${process.env.verified_domain || 'empirereviews.com'}>`,
            replyTo: replyToEmail,
            to: [toEmail],
            subject: subject,
            html: `<div style="font-family: sans-serif; color: #333;">${bodyHtml.replace(/\\n/g, '<br/>')}</div>${footer}`,
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
 * Build a CAN-SPAM compliant email footer.
 * Includes shop identity, physical address, and unsubscribe link.
 */
function buildComplianceFooter(shopDomain: string, unsubscribeLink: string, physicalAddress?: string | null): string {
    const addressLine = physicalAddress
        ? `<p style="margin: 0 0 8px 0;">${physicalAddress}</p>`
        : `<p style="margin: 0 0 8px 0; color: #f59e0b;">⚠️ Please add your business address in Settings &gt; Automation to comply with CAN-SPAM.</p>`;

    return `
        <br/><br/>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 11px; color: #888; line-height: 1.6;">
            <tr>
                <td align="center">
                    <p style="margin: 0 0 8px 0;">Sent by <strong>${shopDomain}</strong> via Empire Reviews</p>
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

