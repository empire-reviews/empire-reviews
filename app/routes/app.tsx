import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
  } catch (error) {
    if (error instanceof Response) throw error;
    // We explicitly swallow non-Response errors here so that
    // Vercel cold starts/network glitches do not trigger a fatal 500
    console.log("App layout: auth deferred to App Bridge UI initialization");
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

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "Unknown error";
  let errorStack = "";

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "";
  } else if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText} - ${error.data}`;
  } else {
    errorMessage = String(error);
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1 style={{ color: "red" }}>GLOBAL CRASH!</h1>
      <p style={{ fontWeight: "bold" }}>{errorMessage}</p>
      <pre style={{ background: "#eee", padding: "1rem", overflowX: "auto" }}>
        {errorStack}
      </pre>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
