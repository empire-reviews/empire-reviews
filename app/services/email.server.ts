import { Resend } from 'resend';
import prisma from '../db.server';

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
    const appUrl = (process.env.SHOPIFY_APP_URL || "https://empire-reviews.vercel.app").trim();
    const unsubscribeLink = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(toEmail)}&shop=${encodeURIComponent(shopDomain)}`;

    try {
        const { data, error } = await resend.emails.send({
            from: `Empire Reviews <reviews@${process.env.verified_domain || 'empirereviews.com'}>`, // Needs verified domain
            to: [toEmail],
            subject: `How was your order from ${shopDomain}?`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Hi ${customerName || 'there'},</h2>
                    <p>Thank you for buying <strong>${productTitle}</strong>.</p>
                    <p>We'd love to hear what you think!</p>
                    <br/>
                    <a href="${reviewLink}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Write a Review</a>
                    <br/><br/>
                    <p style="font-size: 12px; color: #aaa;">
                        <a href="${unsubscribeLink}">Unsubscribe</a>
                    </p>
                </div>
            `
        });

        if (error) {
            console.error("Resend Error:", error);
            return { success: false, error };
        }

        return { success: true, id: data?.id };
    } catch (e) {
        console.error("Email Send Exception:", e);
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
    const appUrl = (process.env.SHOPIFY_APP_URL || "https://empire-reviews.vercel.app").trim();
    const unsubscribeLink = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(toEmail)}&shop=${encodeURIComponent(shopDomain)}`;

    try {
        // Convert newlines to breaks for simple text bodies if needed, 
        // but usually we pass HTML or perform simple formatting.
        // For compliance, always include unsubscribe link.
        const footer = `
            <br/><br/>
            <hr style="border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 11px; color: #aaa; text-align: center;">
                Sent by ${shopDomain} via Empire Reviews.<br/>
                <a href="${unsubscribeLink}">Unsubscribe</a>
            </p>
        `;

        const { data, error } = await resend.emails.send({
            from: `Empire Reviews <reviews@${process.env.verified_domain || 'empirereviews.com'}>`,
            to: [toEmail],
            subject: subject,
            html: `<div style="font-family: sans-serif; color: #333;">${bodyHtml.replace(/\n/g, '<br/>')}</div>${footer}`
        });

        if (error) {
            console.error("Campaign Resend Error:", error);
            return { success: false, error };
        }
        return { success: true, id: data?.id };

    } catch (e) {
        console.error("Campaign Send Exception:", e);
        return { success: false, error: e };
    }
};
