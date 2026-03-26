import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // IMPORTANT: This try/catch is REQUIRED for Shopify embedded apps.
  // On client-side revalidations, Remix sends fetch requests that don't have
  // Shopify's query params yet. App Bridge intercepts these requests and adds
  // the session token, but ONLY after it has initialized. For App Bridge to
  // initialize, this layout route must render successfully first.
  // If we let authenticate.admin throw here, the page crashes before App Bridge
  // can load, creating an infinite failure loop.
  try {
    await authenticate.admin(request);
  } catch (error) {
    // Expected on client-side revalidation before App Bridge has loaded.
    // Let the page render so App Bridge can initialize and add tokens
    // to all future requests automatically.
    if (error instanceof Response) {
      // If Shopify's auth threw a Response (redirect), let it through
      throw error;
    }
    // For non-Response errors (missing params), allow render to proceed
    console.log("App layout: auth deferred to App Bridge");
  }

  return json({ apiKey: (process.env.SHOPIFY_API_KEY || "").trim() });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/campaigns">Email Campaigns</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
