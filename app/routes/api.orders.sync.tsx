import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);

    // 1. Calculate Date (60 Days Ago)
    const date = new Date();
    date.setDate(date.getDate() - 60);
    const createdAtQuery = `created_at:>=${date.toISOString()}`;

    try {
        // 2. Fetch Orders via GraphQL
        const response = await admin.graphql(
            `#graphql
            query getOrders($query: String!) {
                orders(first: 50, query: $query) {
                    edges {
                        node {
                            id
                            createdAt
                            totalPriceSet {
                                shopMoney {
                                    amount
                                    currencyCode
                                }
                            }
                            email
                            customer {
                                email
                            }
                        }
                    }
                }
            }`,
            { variables: { query: createdAtQuery } }
        );

        const data = await response.json();
        const orders = data.data.orders.edges;

        console.log(`Syncing ${orders.length} orders from ${createdAtQuery}`);

        // 3. Upsert into Prisma
        let count = 0;
        for (const edge of orders) {
            const node = edge.node;
            const price = parseFloat(node.totalPriceSet.shopMoney.amount);
            const currency = node.totalPriceSet.shopMoney.currencyCode;
            const email = node.email || node.customer?.email;

            await prisma.order.upsert({
                where: { id: node.id },
                update: {
                    totalPrice: price,
                    currency: currency,
                    customerEmail: email
                },
                create: {
                    id: node.id,
                    shop: session.shop,
                    totalPrice: price,
                    currency: currency,
                    createdAt: new Date(node.createdAt),
                    customerEmail: email
                }
            });
            count++;
        }

        return json({ success: true, count, message: `Synced ${count} orders` });

    } catch (error) {
        console.error("Order Sync Error:", error);
        return json({ success: false, error: "Failed to sync orders" }, { status: 500 });
    }
};
