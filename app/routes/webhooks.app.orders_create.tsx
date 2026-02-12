import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
        // The library handles this verification usually, but if we process unauthenticated webhooks differently...
        // Actually authenticate.webhook throws if invalid.
        return new Response();
    }

    // Payload type depends on the topic. For orders/create it's an Order resource.
    const order = payload as any;

    console.log(`Received ${topic} webhook for ${shop}`);

    // Determine Order ID (Standardize on GraphQL ID)
    // Webhooks often send integer ID. Convert to string or use admin_graphql_api_id if present.
    const orderId = order.admin_graphql_api_id || `gid://shopify/Order/${order.id}`;

    try {
        // Upsert Order data
        await prisma.order.upsert({
            where: { id: orderId },
            update: {
                totalPrice: parseFloat(order.total_price),
                currency: order.currency,
                customerEmail: order.email || order.customer?.email,
            },
            create: {
                id: orderId,
                shop: shop,
                totalPrice: parseFloat(order.total_price), // String in JSON, float in DB
                currency: order.currency, // e.g. "USD", "EUR"
                createdAt: new Date(order.created_at),
                customerEmail: order.email || order.customer?.email,
            }
        });
        console.log(`Processed order ${orderId} for shop ${shop}`);
    } catch (error) {
        console.error("Error processing order webhook:", error);
        // Return 200 to acknowledge receipt even if processing fails, to prevent retries loop
    }

    return new Response();
};
