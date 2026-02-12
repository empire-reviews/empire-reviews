import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);

    // Fetch last 10 marketing events
    const response = await (admin as any).rest.resources.MarketingEvent.all({
        session: session,
        limit: 10,
    });

    return json({
        shop: session.shop,
        events: response.data.map((e: any) => ({
            id: e.id,
            manage_url: e.manage_url,
            preview_url: e.preview_url,
            started_at: e.started_at,
            utm_campaign: e.utm_campaign
        }))
    });
};
