import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// With managed installation + token exchange (unstable_newEmbeddedAuthStrategy),
// users should NEVER see a login page. They install and open the app entirely
// from Shopify Admin. If something redirects here, just bounce them to /app
// which will handle auth via the embedded flow.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // If we know the shop, redirect to /app with the shop param so auth can work
  if (shop) {
    const host = url.searchParams.get("host") || "";
    return redirect(`/app?shop=${shop}&host=${host}&embedded=1`);
  }

  // No shop param — redirect to /app and let auth handle it
  return redirect("/app");
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  // If a form was submitted to login, redirect to /app
  const formData = await request.formData();
  const shop = formData.get("shop") as string;
  if (shop) {
    const cleanShop = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
    return redirect(`/app?shop=${cleanShop}&embedded=1`);
  }
  return redirect("/app");
};
