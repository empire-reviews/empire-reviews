import { type LoaderFunctionArgs, redirect } from "@remix-run/node";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const { id } = params;

    console.log(`[ManageRedirect] Hit for ID: ${id}, Shop: ${shop}`);
    console.log(`[ManageRedirect] Full URL: ${request.url}`);

    if (!shop) {
        console.warn("[ManageRedirect] Missing shop parameter!");
        // Try to get it from session or fallback to home
        return redirect("/");
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    if (!apiKey || !/^[a-z0-9.-]+\.myshopify\.com$/.test(shop)) {
        console.warn("[ManageRedirect] Invalid shop format or missing API key.");
        return redirect("/");
    }

    const targetUrl = `https://${shop}/admin/apps/${apiKey}/app/campaigns?highlight=${id}`;

    console.log(`[ManageRedirect] Redirecting to: ${targetUrl}`);

    return redirect(targetUrl);
};
