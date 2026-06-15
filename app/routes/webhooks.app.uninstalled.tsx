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
      // Fetch merchant's email before we log out their session
      const sessionData = await db.session.findFirst({ where: { shop } });
      const merchantEmail = sessionData?.email;

      if (merchantEmail) {
        // Send the 7-day retention warning email
        const { Resend } = await import("resend");
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const resend = new Resend(apiKey);
          await resend.emails.send({
            from: "Empire Reviews <hello@empirereviews.com>",
            to: merchantEmail,
            subject: "Action Required: Your Empire Reviews Data will be permanently deleted in 7 days",
            html: `
              <h2>We're sorry to see you go!</h2>
              <p>You recently uninstalled Empire Reviews from <strong>${shop}</strong>.</p>
              <p><strong>Your reviews and settings are currently safe.</strong> However, per Shopify's data protection requirements, all of your app data will be permanently and irreversibly deleted in exactly 7 days.</p>
              <p>If you uninstalled by mistake, or if you need to reinstall to fix a billing issue, simply reinstall the app before the 7 days are up, and all your data will be restored instantly.</p>
              <p>If you meant to leave, no further action is required.</p>
            `
          });
          console.log(`Sent 7-day retention warning email to ${merchantEmail}`);
        }
      }

      // We only delete the active user session so they are logged out.
      // WE DO NOT DELETE APP DATA HERE. That is exclusively handled by SHOP_REDACT after 48h-7days.
      await db.session.deleteMany({ where: { shop } });

      console.log(`Shop uninstalled: ${shop}. Session wiped, data retained for 7 days.`);
    } catch (error) {
      console.error(`Error processing uninstall for ${shop}:`, error);
      // Fallback
      await db.session.deleteMany({ where: { shop } });
    }
  }

  return new Response("Webhook processed", { status: 200 });
};
