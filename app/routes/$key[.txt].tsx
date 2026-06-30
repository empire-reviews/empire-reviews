import type { LoaderFunctionArgs } from "@remix-run/node";

import { indexNowKey } from "../utils/indexnow.server";

/**
 * IndexNow key-verification file, served at  /{KEY}.txt.
 *
 * Bing/Yandex fetch this after a ping to confirm we own the domain; the body
 * must be exactly the key. This dynamic route only answers for the real key —
 * any other "/*.txt" request 404s. (The static [robots.txt] route outranks
 * this for /robots.txt, so there's no collision.)
 */
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const key = indexNowKey();
  const requested = (params.key || "").toLowerCase();

  if (requested !== key) {
    throw new Response("Not found", { status: 404 });
  }

  return new Response(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
