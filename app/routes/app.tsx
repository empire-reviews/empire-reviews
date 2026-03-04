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
  // Non-blocking auth for the layout route.
  // On the initial iframe load, auth succeeds (shop/host/embedded params present).
  // On subsequent Remix client-side navigations (revalidations), these params are
  // ABSENT because they are fetch requests that App Bridge hasn't intercepted yet.
  // If we block here, those revalidations would redirect to /auth/login.
  // By catching the error, we let AppProvider render and App Bridge initialize,
  // which will intercept future fetch requests with the session token.
  try {
    await authenticate.admin(request);
  } catch (error) {
    // Auth failed — this is expected on client-side revalidation requests
    // where App Bridge hasn't intercepted yet. Let the page render so
    // App Bridge can initialize and add tokens to future requests.
    console.log("App layout: auth deferred (App Bridge will handle)");
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
