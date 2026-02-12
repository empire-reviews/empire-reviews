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

    const apiKey = process.env.SHOPIFY_API_KEY || "05be213c4c2c36c447c9d2532cbd900f";
    const targetUrl = `https://${shop}/admin/apps/${apiKey}/app/campaigns?highlight=${id}`;

    console.log(`[ManageRedirect] Breaking out to: ${targetUrl}`);

    const html = `
        <!DOCTYPE html>
        <html>
            <head>
                <script>
                    // Force top-level navigation to Shopify Admin
                    window.top.location.href = "${targetUrl}";
                </script>
            </head>
            <body>
                Redirecting to Campaign Manager...
            </body>
        </html>
    `;

    return new Response(html, {
        headers: { "Content-Type": "text/html" }
    });
};
