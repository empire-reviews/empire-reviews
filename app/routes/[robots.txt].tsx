import type { LoaderFunctionArgs } from "@remix-run/node";

import { baseUrl } from "../utils/seo.server";

/**
 * robots.txt — lets every crawler (Google, Bing/ChatGPT/Copilot, etc.)
 * auto-discover the sitemap, and keeps them out of the authenticated admin,
 * API, auth and webhook paths (nothing indexable there, and they require auth).
 */
export const loader = async (_args: LoaderFunctionArgs) => {
  const base = baseUrl();

  const body = [
    "User-agent: *",
    "Disallow: /app",
    "Disallow: /api",
    "Disallow: /auth",
    "Disallow: /webhooks",
    "Allow: /help",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
