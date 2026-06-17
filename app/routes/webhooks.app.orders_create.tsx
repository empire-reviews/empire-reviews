import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, admin, payload } = await authenticate.webhook(request);

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

    // Extract Primary Product
    const primaryItem = order.line_items?.[0];
    const productTitle = primaryItem?.name || primaryItem?.title || "your recent order";
    const productId = primaryItem?.product_id ? `gid://shopify/Product/${primaryItem.product_id}` : null;

    // Guard numeric/date parsing — order fields may be missing on partial payloads.
    const parsedPrice = parseFloat(order.total_price);
    const totalPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;
    const currency = order.currency ?? null;
    const customerEmail = order.email || order.customer?.email || null;
    const parsedCreatedAt = order.created_at ? new Date(order.created_at) : new Date();
    const createdAt = Number.isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt;

    try {
        // Upsert Order data
        await prisma.order.upsert({
            where: { id: orderId },
            update: {
                totalPrice,
                currency,
                customerEmail,
                productTitle,
                productId,
            },
            create: {
                id: orderId,
                shop: shop,
                totalPrice, // String in JSON, float in DB
                currency, // e.g. "USD", "EUR"
                createdAt,
                customerEmail,
                productTitle,
                productId,
            }
        });
        console.log(`Processed order ${orderId} for shop ${shop}`);
    } catch (error: any) {
        console.error("Error processing order webhook:", error);
        // Transient DB/connection errors (Prisma P1xxx) — return 500 so Shopify retries.
        if (typeof error?.code === "string" && error.code.startsWith("P1")) {
            return new Response("Database unavailable", { status: 500 });
        }
        // Expected/permanent failure (bad data, etc.) — ack with 200 to avoid retry loop.
    }

    return new Response();
};
