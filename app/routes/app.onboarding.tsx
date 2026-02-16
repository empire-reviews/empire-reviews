import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form } from "@remix-run/react";
import { Card, Page, Layout, BlockStack, Text, Button } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    // Mark onboarding as complete
    await prisma.settings.upsert({
        where: { shop: session.shop },
        update: { hasCompletedOnboarding: true },
        create: { shop: session.shop, hasCompletedOnboarding: true },
    });

    return redirect("/app");
};

export default function Onboarding() {
    return (
        <Page title="Welcome to Empire Reviews!" narrowWidth>
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">
                                🎉 Let's Get Started!
                            </Text>
                            <Text as="p">
                                Welcome to Empire Reviews! You're just one click away from turning customer
                                reviews into a powerful sales engine for your store.
                            </Text>
                            <Text as="p" tone="subdued">
                                Your review collection system is ready. Let's set up your first campaign!
                            </Text>
                            <Form method="post">
                                <Button submit variant="primary">
                                    Complete Setup →
                                </Button>
                            </Form>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
