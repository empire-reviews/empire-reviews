import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    // 🛡️ GDPR Mandatory Webhooks
    // Shopify requires these endpoints to return 200 OK.

    console.log(`Received GDPR webhook: ${topic} for shop: ${shop}`);

    try {
        if (topic === "CUSTOMERS_DATA_REQUEST") {
            // 📩 Customer is requesting their data.
            // Payload contains: { "customer": { "id": ... }, "orders_requested": ... }
            // We should email the merchant with the data we have, or provide it via API.
            // For now, we acknowledge receipt.
            console.log("Processing Customer Data Request for", payload);
        }

        if (topic === "CUSTOMERS_REDACT") {
            // 🗑️ Customer data must be erased.
            // Payload: { "customer": { "id": ... }, "orders_to_redact": ... }
            // We should delete reviews/orders associated with this customer email/id.
            console.log("Processing Customer Redact Request for", payload);

            // Example Logic (Commented out until fully implemented logic is decided)
            // await prisma.review.deleteMany({ where: { customerEmail: payload.customer.email } });
        }

        if (topic === "SHOP_REDACT") {
            // 🏪 Shop uninstalled 48 hours ago and requested data erasure.
            // We should delete all data for this shop.
            console.log("Processing Shop Redact Request for", shop);

            // await prisma.session.deleteMany({ where: { shop } });
            // await prisma.review.deleteMany({ where: { shop } });
            // await prisma.order.deleteMany({ where: { shop } });
        }

    } catch (error) {
        console.error(`Error processing GDPR webhook ${topic}:`, error);
        // Still return 200 to prevent retries (standard Shopify practice for compliance if we can't process)
    }

    return new Response("Webhook processed", { status: 200 });
};
