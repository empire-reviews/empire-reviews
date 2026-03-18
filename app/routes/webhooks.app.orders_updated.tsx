import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
        return new Response();
    }

    // Payload for orders/updated and orders/fulfilled is the Order resource
    const order = payload as any;
    
    console.log(`Received ${topic} webhook for ${shop}`);

    const orderId = order.admin_graphql_api_id || `gid://shopify/Order/${order.id}`;

    // Try to find fulfillment and delivery dates
    let fulfilledAt: Date | null = null;
    let deliveredAt: Date | null = null;

    if (order.fulfillments && order.fulfillments.length > 0) {
        // Take the first fulfillment date
        const firstFulfillment = order.fulfillments[0];
        if (firstFulfillment.created_at) {
            fulfilledAt = new Date(firstFulfillment.created_at);
        }
        
        // Some carriers update the shipment_status directly on the fulfillment
        // Possible values: label_printed, label_purchased, attempted_delivery, ready_for_pickup, confirmed, in_transit, out_for_delivery, delivered, failure
        const deliveredFulfillment = order.fulfillments.find((f: any) => f.shipment_status === "delivered");
        if (deliveredFulfillment && deliveredFulfillment.updated_at) {
            deliveredAt = new Date(deliveredFulfillment.updated_at);
        }
    }

    try {
        await prisma.order.upsert({
            where: { id: orderId },
            update: {
                totalPrice: parseFloat(order.total_price),
                currency: order.currency,
                customerEmail: order.email || order.customer?.email,
                ...(fulfilledAt && { fulfilledAt }),
                ...(deliveredAt && { deliveredAt }),
            },
            create: {
                id: orderId,
                shop: shop,
                totalPrice: parseFloat(order.total_price),
                currency: order.currency,
                createdAt: new Date(order.created_at),
                customerEmail: order.email || order.customer?.email,
                fulfilledAt,
                deliveredAt
            }
        });
        console.log(`Updated tracking for order ${orderId} on shop ${shop}`);
    } catch (error) {
        console.error(`Error processing ${topic} webhook:`, error);
    }

    return new Response();
};
