import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import { useEffect } from "react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Global Error Boundary
 *
 * Handles two classes of errors:
 *  1. Stale JS Chunk Errors — triggered after a Vercel deployment while a user
 *     still has the old version open. Auto-reloads after 2 seconds.
 *  2. All other runtime errors — shows a user-friendly recovery screen with a
 *     manual reload button.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Detect stale chunk / module loading failures (common after Vercel redeploys)
  const isChunkError =
    errorMessage.includes("Failed to fetch dynamically imported module") ||
    errorMessage.includes("Importing a module script failed") ||
    errorMessage.includes("error loading dynamically imported module") ||
    errorMessage.includes("ChunkLoadError") ||
    errorMessage.includes("Loading chunk") ||
    errorMessage.includes("Load failed");

  useEffect(() => {
    if (isChunkError) {
      // Auto-reload after a short delay so the user isn't stuck
      const timer = setTimeout(() => {
        window.location.reload();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isChunkError]);

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Empire Reviews</title>
        <style>{`
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .error-card {
            background: white;
            border-radius: 16px;
            padding: 2.5rem;
            max-width: 480px;
            width: 90%;
            text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            border: 1px solid #e2e8f0;
          }
          .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          .error-title { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin: 0 0 0.5rem; }
          .error-msg { color: #64748b; font-size: 0.95rem; margin: 0 0 1.5rem; line-height: 1.6; }
          .reload-btn {
            display: inline-block;
            background: linear-gradient(to right, #2563eb, #3b82f6);
            color: white;
            font-weight: 700;
            font-size: 0.95rem;
            padding: 0.75rem 2rem;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            text-decoration: none;
          }
          .reload-btn:hover { opacity: 0.9; }
          .auto-note { color: #94a3b8; font-size: 0.8rem; margin-top: 1rem; }
        `}</style>
      </head>
      <body>
        <div className="error-card">
          {isChunkError ? (
            <>
              <div className="error-icon">🔄</div>
              <h1 className="error-title">New Version Available</h1>
              <p className="error-msg">
                A new version of Empire Reviews has been deployed. The app is
                refreshing automatically to load the latest version.
              </p>
              <p className="auto-note">Refreshing in 2 seconds…</p>
            </>
          ) : (
            <>
              <div className="error-icon">⚠️</div>
              <h1 className="error-title">Something went wrong</h1>
              <p className="error-msg">
                Empire Reviews hit an unexpected error. Click below to reload and
                get back on track.<br/><br/>
                <strong style={{ color: '#ef4444' }}>Trace:</strong> {errorMessage}
              </p>
              <button className="reload-btn" onClick={() => window.location.reload()}>
                Reload App
              </button>
            </>
          )}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
