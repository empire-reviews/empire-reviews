import { json, type LoaderFunctionArgs } from "@remix-run/node";

import { pingIndexNow } from "../utils/indexnow.server";
import { publicUrls } from "../utils/seo.server";

/**
 * Push every public URL (marketing root + /help + all help articles) to
 * IndexNow, so Bing — and therefore ChatGPT/Copilot — pick up changes fast
 * instead of waiting for the next organic crawl.
 *
 * Auth mirrors the cron routes: `Authorization: Bearer ${CRON_SECRET}`.
 * Trigger it after deploying new/edited help content, or wire it to a cron.
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/indexnow
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("❌ CRON_SECRET not set — cannot authorize IndexNow submit");
    return json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    console.warn(`⚠️ Unauthorized IndexNow submit attempt from IP: ${ip}`);
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = publicUrls().map((u) => u.loc);
  const result = await pingIndexNow(urls);

  console.log(
    `🔎 IndexNow: submitted ${result.submitted} URL(s) → status ${result.status}`,
  );

  return json({
    ok: result.ok,
    status: result.status,
    submitted: result.submitted,
  });
};
