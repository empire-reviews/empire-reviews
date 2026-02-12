import { type LoaderFunctionArgs, redirect } from "@remix-run/node";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    // This route is OUTSIDE the "app" layout, so it has no automatic auth.
    // It exists solely to catch the "Manage" click from Shopify Admin,
    // and redirect to the proper Shopify OAuth flow that will embed the app.

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const { id } = params;

    if (!shop) {
        // Without shop, we can't do anything. Redirect to a generic error or home.
        return redirect("/");
    }

    // Redirect to the app's campaigns page with shop context
    // The app route will handle authentication via App Bridge
    return redirect(`/app/campaigns?highlight=${id}&shop=${shop}`);
};
