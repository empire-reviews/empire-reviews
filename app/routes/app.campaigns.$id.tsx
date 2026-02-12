import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
//     const { id } = params;
//     
//     // Redirect to the main campaigns list with a highlight parameter
//     return redirect(`/app/campaigns?highlight=${id}`);
// };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    // BYPASS: Do not authenticate here. 
    // This route is hit from an external context (Shopify Admin Link).
    // We just want to forward the user to the App Bridge (embedded app) which handles auth.

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const { id } = params;

    // Critical: Forward the 'shop' param so the destination knows where to auth.
    if (shop) {
        return redirect(`/app/campaigns?highlight=${id}&shop=${shop}`);
    }

    // Fallback if shop is missing (shouldn't happen with our new create logic)
    return redirect(`/app/campaigns?highlight=${id}`);
};
