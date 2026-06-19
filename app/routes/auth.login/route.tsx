import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    const host = url.searchParams.get("host") || "";
    return redirect(`/app?shop=${shop}&host=${host}`);
  }

  return redirect("/app");
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  // login(request) reads the shop from form data, validates it, and returns
  // a redirect Response to Shopify's OAuth install page.
  return login(request);
};
