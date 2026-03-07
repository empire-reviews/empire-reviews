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
        // 2. Fetch ALL Orders via cursor-based pagination
        let allOrders: any[] = [];
        let hasNextPage = true;
        let cursor: string | null = null;
        const MAX_PAGES = 10; // Safety cap: 10 pages × 250 = 2500 orders max
        let page = 0;

        while (hasNextPage && page < MAX_PAGES) {
            const gqlResponse: any = await admin.graphql(
                `#graphql
                query getOrders($query: String!, $cursor: String) {
                    orders(first: 250, query: $query, after: $cursor) {
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
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }`,
                { variables: { query: createdAtQuery, cursor } }
            );

            const data: any = await gqlResponse.json();
            const orders = data.data.orders.edges;
            const pageInfo: any = data.data.orders.pageInfo;

            allOrders = allOrders.concat(orders);
            hasNextPage = pageInfo.hasNextPage;
            cursor = pageInfo.endCursor;
            page++;
        }

        console.log(`Syncing ${allOrders.length} orders from ${createdAtQuery} (${page} pages)`);

        // 3. Upsert into Prisma
        let count = 0;
        for (const edge of allOrders) {
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
