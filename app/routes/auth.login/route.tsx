import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

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
import { Form } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Button, TextField } from "@shopify/polaris";
import { useState } from "react";

export default function Login() {
  const [shop, setShop] = useState("");

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h1" variant="headingLg">
                Empire Reviews Core
              </Text>
              <Text as="p">
                This app is an embedded Shopify app. You should open it directly from your <b>Shopify Admin Apps dashboard</b>.
              </Text>
              <Text as="p" tone="subdued">
                If you want to install or log in manually, enter your <code>.myshopify.com</code> domain below:
              </Text>
              <Form method="post">
                <BlockStack gap="300">
                  <TextField
                    label="Shopify Store Domain"
                    name="shop"
                    value={shop}
                    onChange={setShop}
                    placeholder="your-store.myshopify.com"
                    autoComplete="off"
                  />
                  <Button submit variant="primary">
                    Install / Log In
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
