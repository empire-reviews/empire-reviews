import prisma from "../db.server";
export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const shop = url.searchParams.get("shop");
    if (!email || !shop) {
        return new Response("Missing parameters.", { status: 400 });
    }
    try {
        await prisma.unsubscriber.upsert({
            where: {
                email_shop: { email, shop }
            },
            update: {},
            create: { email, shop }
        });
        // Simple HTML response confirming unsubscribe
        return new Response(`<html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>Unsubscribed Successfully</h2>
                    <p>You will no longer receive emails from ${shop}.</p>
                    <p>You can close this window.</p>
                </body>
            </html>`, { headers: { "Content-Type": "text/html" } });
    }
    catch (error) {
        console.error("Unsubscribe Error:", error);
        return new Response("Failed to process unsubscribe request. Please try again later.", { status: 500 });
    }
};
