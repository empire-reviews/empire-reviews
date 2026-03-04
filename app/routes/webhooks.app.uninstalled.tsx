import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    try {
      // Clean up all shop data (order matters for FK constraints)

      // 1. Get campaign IDs for this shop
      const campaigns = await db.campaign.findMany({
        where: { shop },
        select: { id: true },
      });
      const campaignIds = campaigns.map((c) => c.id);

      // 2. Delete campaign children first
      if (campaignIds.length > 0) {
        await db.campaignMetrics.deleteMany({
          where: { campaignId: { in: campaignIds } },
        });
        await db.campaignSend.deleteMany({
          where: { campaignId: { in: campaignIds } },
        });
        await db.campaign.deleteMany({ where: { shop } });
      }

      // 3. Delete reviews (ReviewMedia & Reply cascade via onDelete: Cascade)
      await db.review.deleteMany({ where: { shop } });

      // 4. Delete orders
      await db.order.deleteMany({ where: { shop } });

      // 5. Delete analytics events
      await db.analyticsEvent.deleteMany({ where: { shop } });

      // 6. Delete settings
      await db.settings.deleteMany({ where: { shop } });

      // 7. Delete sessions last
      await db.session.deleteMany({ where: { shop } });

      console.log(`Shop uninstalled: ${shop}. All data cleaned up.`);
    } catch (error) {
      console.error(`Error cleaning up data for ${shop}:`, error);
      // Still delete sessions as fallback
      await db.session.deleteMany({ where: { shop } });
    }
  }

  return new Response();
};
