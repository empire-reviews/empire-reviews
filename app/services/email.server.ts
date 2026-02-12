import nodemailer from "nodemailer";

export async function sendCampaignEmail(
    shop: string,
    to: string,
    subject: string,
    body: string,
    trackingId: string
) {
    const appUrl = process.env.SHOPIFY_APP_URL || "https://example.com";

    // Insert tracking pixel and click tracking
    const trackingPixel = `<img src="${appUrl}/api/track/open/${trackingId}" width="1" height="1" style="display:none;" />`;

    // Wrap links for click tracking
    const trackedBody = body.replace(
        /href=["']([^"']*)["']/g,
        `href="${appUrl}/api/track/click/${trackingId}?target=$1"`
    ) + trackingPixel;

    // Convert newlines to <br> for HTML email
    const htmlBody = trackedBody.replace(/\n/g, '<br>');

    // 1. Setup Transporter (Titan Mail / SMTP)
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.titan.email",
        port: parseInt(process.env.SMTP_PORT || "465"),
        secure: true, // true for 465, false for 587
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    try {
        // 2. Send Real Email
        const info = await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'Empire Reviews'}" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: htmlBody,
        });

        console.log(`[Email Service] Sent to ${to}. MessageId: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error("[Email Service] Failed to send email:", error);
        return false;
    }
}
