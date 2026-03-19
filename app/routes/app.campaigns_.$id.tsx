import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, DataTable, Text, Badge, InlineStack, Button } from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    
    const campaignId = params.id;
    if (!campaignId) throw new Error("Missing campaign ID");

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId, shop: session.shop },
        include: { 
            metrics: true,
            sends: {
                orderBy: { sentAt: 'desc' }
            }
        }
    });

    if (!campaign) {
        throw new Response("Campaign Not Found", { status: 404 });
    }

    return json({ campaign });
};

export default function CampaignDetailsPage() {
    const { campaign } = useLoaderData<typeof loader>();
    const navigate = useNavigate();

    const rows = campaign.sends.map((send: any) => [
        send.customerName,
        send.customerEmail,
        new Date(send.sentAt).toLocaleString(),
        send.opened ? <Badge tone="success">Opened</Badge> : <Badge tone="info">Sent</Badge>,
        send.clicked ? <Badge tone="success">Clicked</Badge> : <Badge>No</Badge>
    ]);

    return (
        <Page 
            backAction={{ content: 'Campaigns', onAction: () => navigate('/app/campaigns') }}
            title={`Analytics: ${campaign.name}`}
            subtitle={campaign.status === 'active' ? 'Currently Active Automation' : 'Paused Automation'}
            titleMetadata={campaign.status === 'active' ? <Badge tone="success">Active Element</Badge> : <Badge>Paused</Badge>}
        >
            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="h2" variant="headingMd">Performance</Text>
                                <InlineStack gap="400" align="start">
                                    <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <Text as="p" variant="headingLg">{campaign.metrics?.totalSent || 0}</Text>
                                        <Text as="p" tone="subdued">Emails Sent</Text>
                                    </div>
                                    <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <Text as="p" variant="headingLg">{campaign.metrics?.totalOpened || 0}</Text>
                                        <Text as="p" tone="subdued">Opens</Text>
                                    </div>
                                    <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <Text as="p" variant="headingLg">{campaign.metrics?.totalClicked || 0}</Text>
                                        <Text as="p" tone="subdued">Clicks</Text>
                                    </div>
                                    <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '8px' }}>
                                        <Text as="p" variant="headingLg" tone="success">{campaign.metrics?.totalReviews || 0}</Text>
                                        <Text as="p" tone="success">Reviews Generated</Text>
                                    </div>
                                </InlineStack>
                            </BlockStack>
                        </Card>

                        <Card padding="0">
                            <div style={{ padding: '16px', borderBottom: '1px solid #ebeef0' }}>
                                <Text as="h2" variant="headingMd">Audience Activity Log</Text>
                            </div>
                            {campaign.sends.length > 0 ? (
                                <DataTable
                                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                                    headings={['Customer', 'Email', 'Sent At', 'Open Status', 'Clicked Link']}
                                    rows={rows}
                                />
                            ) : (
                                <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                                    <Text as="p">No emails have been dispatched for this automation yet.</Text>
                                </div>
                            )}
                        </Card>
                    </BlockStack>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                    <Card>
                        <BlockStack gap="300">
                            <Text as="h2" variant="headingMd">Strategy Configuration</Text>
                            <div>
                                <Text as="p" fontWeight="bold">Template Mode</Text>
                                <Text as="p" tone="subdued">{campaign.templateType.toUpperCase()}</Text>
                            </div>
                            <div>
                                <Text as="p" fontWeight="bold">Subject Line</Text>
                                <Text as="p" tone="subdued">{campaign.subject}</Text>
                            </div>
                            <div>
                                <Text as="p" fontWeight="bold">Email Body</Text>
                                <div style={{ fontSize: '13px', background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '4px', whiteSpace: 'pre-wrap', color: '#475569' }}>
                                    {campaign.body.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n')}
                                </div>
                            </div>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
