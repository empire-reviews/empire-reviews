import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form } from "@remix-run/react";
import { useState } from "react";

// With managed installation + token exchange (unstable_newEmbeddedAuthStrategy),
// users should NEVER see a login page. They install and open the app entirely
// from Shopify Admin. If something redirects here, just bounce them to /app
// which will handle auth via the embedded flow.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // If we know the shop, redirect to /app with the shop param so auth can work
  if (shop) {
    const host = url.searchParams.get("host") || "";
    return redirect(`/app?shop=${shop}&host=${host}&embedded=1`);
  }

  // If there's no shop parameter, the user visited the bare URL directly.
  // Instead of infinite looping back to /app, we let the route render the login UI.
  return null;
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  // If a form was submitted to login, redirect to /app
  const formData = await request.formData();
  const shop = formData.get("shop") as string;
  if (shop) {
    const cleanShop = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
    return redirect(`/app?shop=${cleanShop}&embedded=1`);
  }
  return redirect("/app");
};

export default function Login() {
  const [shop, setShop] = useState("");

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center', 
      minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white', padding: '2rem', borderRadius: '8px', 
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', maxWidth: '400px', width: '100%'
      }}>
        <h1 style={{ margin: '0 0 1rem 0', color: '#0f172a', fontSize: '1.5rem', fontWeight: 600 }}>
          Empire Reviews Core
        </h1>
        
        <div style={{ marginBottom: '1.5rem', color: '#475569', lineHeight: 1.5 }}>
          <p style={{ marginBottom: '1rem' }}>
            This is an embedded Shopify app. You should open it directly from your <b>Shopify Admin Apps dashboard</b>.
          </p>
          <p style={{ fontSize: '0.875rem' }}>
            To install or log in manually, enter your <code>.myshopify.com</code> domain below:
          </p>
        </div>

        <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1e293b', fontSize: '0.875rem', fontWeight: 500 }}>
              Shopify Store Domain
            </label>
            <input
              type="text"
              name="shop"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="your-store.myshopify.com"
              autoComplete="off"
              style={{
                width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', 
                borderRadius: '4px', fontSize: '1rem', boxSizing: 'border-box'
              }}
            />
          </div>
          <button 
            type="submit"
            style={{
              backgroundColor: '#2563eb', color: 'white', border: 'none', 
              padding: '0.75rem', borderRadius: '4px', fontSize: '1rem', 
              fontWeight: 500, cursor: 'pointer', outline: 'none'
            }}
          >
            Install / Log In
          </button>
        </Form>
      </div>
    </div>
  );
}
