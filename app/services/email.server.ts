import { Resend } from 'resend';

export const sendReviewRequest = async (toEmail: string, customerName: string, productTitle: string, reviewLink: string, shopDomain: string) => {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.error("Missing RESEND_API_KEY");
        return { success: false, error: "Configuration Error" };
    }

    const resend = new Resend(apiKey);

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
                        <a href="${reviewLink}?unsubscribe=true">Unsubscribe</a>
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
