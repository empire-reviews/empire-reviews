import { HELP_ARTICLES } from "../lib/help-articles";

/**
 * Single source of truth for the public (crawlable) URL set.
 * Consumed by the sitemap, robots.txt, and the IndexNow submitter so the
 * three never drift apart.
 *
 * Vercel injects stray CRLF/whitespace into env vars — always `.trim()`.
 */
export function baseUrl(): string {
  const raw =
    process.env.SHOPIFY_APP_URL?.trim() || "https://empire-reviews.vercel.app";
  return raw.replace(/\/+$/, "");
}

export type PublicUrl = { loc: string; lastmod?: string };

/** Every public, indexable URL: marketing root, /help index, each article. */
export function publicUrls(): PublicUrl[] {
  const base = baseUrl();
  return [
    { loc: base },
    { loc: `${base}/help` },
    ...HELP_ARTICLES.map((a) => ({
      loc: `${base}/help/${a.slug}`,
      lastmod: a.updated,
    })),
  ];
}
