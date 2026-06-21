import type { LoaderFunctionArgs } from "@remix-run/node";

import { HELP_ARTICLES } from "../lib/help-articles";

function baseUrl(): string {
  const raw =
    process.env.SHOPIFY_APP_URL?.trim() || "https://empire-reviews.vercel.app";
  return raw.replace(/\/+$/, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const loader = async (_args: LoaderFunctionArgs) => {
  const base = baseUrl();

  const urls: { loc: string; lastmod?: string }[] = [
    { loc: base },
    { loc: `${base}/help` },
    ...HELP_ARTICLES.map((a) => ({
      loc: `${base}/help/${a.slug}`,
      lastmod: a.updated,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => {
    const lastmod = u.lastmod ? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${lastmod}\n  </url>`;
  })
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
