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
  let errorMessage = "An unexpected error occurred.";
  let isAuthError = false;

  if (error instanceof Error) {
    errorMessage = error.message;
    isAuthError = /authentication failed|invalid.*credentials|database.*credentials/i.test(errorMessage);
    // Log full details server-side only; never expose stack to users
    console.error("[app] ErrorBoundary caught:", error.message);
  } else if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} — ${error.statusText}`;
    console.error("[app] ErrorBoundary route error:", error.status, error.data);
  } else {
    console.error("[app] ErrorBoundary unknown error:", error);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "2rem", fontFamily: "system-ui", textAlign: "center",
    }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#202223", marginBottom: "0.5rem" }}>
        {isAuthError ? "Database connection error" : "Something went wrong"}
      </h1>
      <p style={{ color: "#6d7175", maxWidth: 480, marginBottom: "1.5rem" }}>
        {isAuthError
          ? "The app couldn't connect to the database. This is usually a configuration issue — please contact support."
          : "An unexpected error occurred. Please refresh the page and try again."}
      </p>
      <a
        href="/app"
        style={{
          display: "inline-block", padding: "0.6rem 1.5rem", borderRadius: "8px",
          background: "#008060", color: "white", fontWeight: 600, textDecoration: "none",
        }}
      >
        Reload app
      </a>
      <p style={{
        marginTop: "1.5rem", fontSize: "0.7rem", color: "#babec3",
        fontFamily: "monospace", maxWidth: 520, wordBreak: "break-word",
      }}>
        {errorMessage}
      </p>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
