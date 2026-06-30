import { baseUrl } from "./seo.server";

/**
 * IndexNow — instant indexing protocol pushed by Microsoft (Bing), Yandex and
 * DuckDuckGo. One ping to api.indexnow.org notifies ALL participating engines
 * (they share the submission). Because ChatGPT search and Microsoft Copilot
 * lean on Bing's index, getting URLs into Bing fast is the practical lever for
 * AI-assistant visibility — that's what this gives us over a plain sitemap.
 *
 * How it works:
 *  1. We host a key file at  {base}/{KEY}.txt  whose body is exactly the key.
 *  2. We POST { host, key, keyLocation, urlList } to the IndexNow endpoint.
 *  3. Bing fetches the key file to verify we own the domain, then crawls.
 *
 * The key is a 32-char hex string. It can be overridden per-deploy via the
 * INDEXNOW_KEY env var (Vercel corrupts env vars, so we `.trim()`), but the
 * baked default keeps the key file and the ping in lockstep with no config.
 */
const DEFAULT_KEY = "ff48a98ac6fdefd01c9ee76d3211ebd2";

export function indexNowKey(): string {
  return (process.env.INDEXNOW_KEY?.trim() || DEFAULT_KEY).toLowerCase();
}

function host(): string {
  return new URL(baseUrl()).host;
}

export type IndexNowResult = {
  ok: boolean;
  status: number;
  submitted: number;
};

/**
 * Submit a batch of URLs to IndexNow. Filters to absolute http(s) URLs and
 * caps at the protocol's 10,000-URL limit. Never throws — returns a result the
 * caller can log; a failed ping must not break the request that triggered it.
 */
export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = indexNowKey();
  const base = baseUrl();
  const urlList = urls
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 10000);

  if (urlList.length === 0) {
    return { ok: false, status: 0, submitted: 0 };
  }

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: host(),
        key,
        keyLocation: `${base}/${key}.txt`,
        urlList,
      }),
    });
    return { ok: res.ok, status: res.status, submitted: urlList.length };
  } catch (err) {
    console.error("IndexNow ping failed:", err);
    return { ok: false, status: 0, submitted: urlList.length };
  }
}
