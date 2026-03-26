import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { verifyUnsubscribeToken } from "../utils/crypto.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const shop = url.searchParams.get("shop");
    const token = url.searchParams.get("token");

    if (!email || !shop || !token) {
        return new Response(
            `<html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>⚠️ Invalid Request</h2>
                    <p>Missing required parameters. Please use the link from the original email.</p>
                </body>
            </html>`,
            { headers: { "Content-Type": "text/html" }, status: 400 }
        );
    }

    // SECURITY: Verify signed token to prevent URL tampering
    if (!verifyUnsubscribeToken(email, shop, token)) {
        console.warn(`⚠️ Invalid unsubscribe token attempt for ${email} on ${shop}`);
        return new Response(
            `<html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>⚠️ Invalid Unsubscribe Link</h2>
                    <p>This unsubscribe link is invalid or has been tampered with.</p>
                    <p>Please use the link from the original email.</p>
                </body>
            </html>`,
            { headers: { "Content-Type": "text/html" }, status: 400 }
        );
    }

    try {
        await prisma.unsubscriber.upsert({
            where: {
                email_shop: { email, shop }
            },
            update: {},
            create: { email, shop }
        });

        const safeShop = shop.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c] as string));

        return new Response(
            `<html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>✅ Unsubscribed Successfully</h2>
                    <p>You will no longer receive emails from ${safeShop}.</p>
                    <p>You can close this window.</p>
                </body>
            </html>`,
            { headers: { "Content-Type": "text/html" } }
        );
    } catch (error) {
        console.error("Unsubscribe Error:", error);
        return new Response(
            "Failed to process unsubscribe request. Please try again later.",
            { status: 500 }
        );
    }
};
