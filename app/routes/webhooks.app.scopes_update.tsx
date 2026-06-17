import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    try {
        const current = (payload.current as string[]) ?? [];
        if (session) {
            // updateMany instead of update: the session row may not exist yet
            // (Prisma update throws P2025 "record not found" in that case).
            await db.session.updateMany({
                where: { id: session.id },
                data: { scope: current.toString() },
            });
        }
    } catch (error) {
        console.error(`Error processing ${topic} webhook for ${shop}:`, error);
        return new Response("Internal Server Error", { status: 500 });
    }

    return new Response();
};
