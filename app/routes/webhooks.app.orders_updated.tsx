import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
        return new Response();
    }

    // Payload for orders/updated and orders/fulfilled is the Order resource
    const order = payload as any;
    
    console.log(`Received ${topic} webhook for ${shop}`);

    // Determine Order ID (Standardize on GraphQL ID)
    const orderId = order.admin_graphql_api_id || `gid://shopify/Order/${order.id}`;

    // Extract Primary Product
    const primaryItem = order.line_items?.[0];
    const productTitle = primaryItem?.name || primaryItem?.title || undefined;
    const productId = primaryItem?.product_id ? `gid://shopify/Product/${primaryItem.product_id}` : undefined;

    // Try to find fulfillment and delivery dates
    let fulfilledAt: Date | null = null;
    let deliveredAt: Date | null = null;

    if (order.fulfillments && order.fulfillments.length > 0) {
        // Take the first fulfillment date
        const firstFulfillment = order.fulfillments[0];
        if (firstFulfillment.created_at) {
            const d = new Date(firstFulfillment.created_at);
            if (!Number.isNaN(d.getTime())) fulfilledAt = d;
        }

        // Some carriers update the shipment_status directly on the fulfillment
        // Possible values: label_printed, label_purchased, attempted_delivery, ready_for_pickup, confirmed, in_transit, out_for_delivery, delivered, failure
        const deliveredFulfillment = order.fulfillments.find((f: any) => f.shipment_status === "delivered");
        if (deliveredFulfillment && deliveredFulfillment.updated_at) {
            const d = new Date(deliveredFulfillment.updated_at);
            if (!Number.isNaN(d.getTime())) deliveredAt = d;
        }
    }

    // Guard numeric/date parsing — order fields may be missing on partial payloads.
    const parsedPrice = parseFloat(order.total_price);
    const totalPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;
    const currency = order.currency ?? null;
    const customerEmail = order.email || order.customer?.email || null;
    const parsedCreatedAt = order.created_at ? new Date(order.created_at) : new Date();
    const createdAt = Number.isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt;

    try {
        await prisma.order.upsert({
            where: { id: orderId },
            update: {
                totalPrice,
                currency,
                customerEmail,
                ...(productTitle && { productTitle }),
                ...(productId && { productId }),
                ...(fulfilledAt && { fulfilledAt }),
                ...(deliveredAt && { deliveredAt }),
            },
            create: {
                id: orderId,
                shop: shop,
                totalPrice,
                currency,
                createdAt,
                customerEmail,
                fulfilledAt,
                deliveredAt
            }
        });
        console.log(`Updated tracking for order ${orderId} on shop ${shop}`);
    } catch (error: any) {
        console.error(`Error processing ${topic} webhook:`, error);
        // Transient DB/connection errors (Prisma P1xxx) — return 500 so Shopify retries.
        if (typeof error?.code === "string" && error.code.startsWith("P1")) {
            return new Response("Database unavailable", { status: 500 });
        }
        // Expected/permanent failure (bad data, etc.) — ack with 200 to avoid retry loop.
    }

    return new Response();
};
