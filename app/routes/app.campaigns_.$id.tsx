import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, DataTable, Text, Badge, InlineStack, Button } from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { BackButton } from "../components/BackButton";
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
            fullWidth
            title={`Mission Control: ${campaign.name}`}
        >
            <BackButton to="/app/campaigns" label="← Back to Campaigns" />
            <style>{`
                .Polaris-Page { max-width: 1600px !important; }
                .holographic-void {
                    background: radial-gradient(circle at top right, #1e1b4b 0%, #0f172a 50%, #000000 100%);
                    color: white;
                    border-radius: 16px;
                    padding: 3rem;
                    min-height: 80vh;
                    box-shadow: inset 0 0 100px rgba(124, 58, 237, 0.1);
                }
                .prism-card {
                    background: rgba(255, 255, 255, 0.02);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 16px;
                    padding: 2rem;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
                    transition: transform 0.3s ease;
                }
                .prism-card:hover { border-color: rgba(139, 92, 246, 0.3); }
                
                .metric-value { 
                    font-size: 3.5rem; 
                    font-weight: 800; 
                    font-family: system-ui, -apple-system, sans-serif; 
                    background: linear-gradient(to right, #fff, #a78bfa); 
                    -webkit-background-clip: text; 
                    -webkit-text-fill-color: transparent; 
                    line-height: 1.1;
                    padding-bottom: 5px;
                    display: inline-block;
                }
                .metric-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; font-weight: 600; margin-top: 0.5rem; }
                
                .glow-table { width: 100%; border-collapse: separate; border-spacing: 0; }
                .glow-table th { text-align: left; padding: 1.2rem 1rem; color: #a78bfa; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.1em; border-bottom: 1px solid rgba(139, 92, 246, 0.2); }
                .glow-table td { padding: 1rem; color: #e2e8f0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.95rem; }
                .glow-table tbody tr { transition: all 0.2s; }
                .glow-table tbody tr:hover td { background: rgba(139, 92, 246, 0.05); }

                .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
                .status-badge.active { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
                .status-badge.paused { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
            `}</style>
            
            <div className="holographic-void">
                <InlineStack align="space-between" blockAlign="center">
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{campaign.name}</div>
                        <div style={{ color: '#94a3b8', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className={`status-badge ${campaign.status}`}>{campaign.status}</span>
                            <span>Strategy: {campaign.templateType.toUpperCase()}</span>
                        </div>
                    </div>
                </InlineStack>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '3rem' }}>
                    <div className="prism-card">
                        <div className="metric-value">{campaign.metrics?.totalSent || 0}</div>
                        <div className="metric-label">Transmissions Sent</div>
                    </div>
                    <div className="prism-card">
                        <div className="metric-value">{campaign.metrics?.totalOpened || 0}</div>
                        <div className="metric-label">Emails Opened</div>
                    </div>
                    <div className="prism-card">
                        <div className="metric-value">{campaign.metrics?.totalClicked || 0}</div>
                        <div className="metric-label">Review Links Clicked</div>
                    </div>
                    <div className="prism-card" style={{ boxShadow: '0 0 30px rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                        <div className="metric-value" style={{ background: 'linear-gradient(to right, #fff, #34d399)', WebkitBackgroundClip: 'text' }}>{campaign.metrics?.totalReviews || 0}</div>
                        <div className="metric-label" style={{ color: '#34d399' }}>Reviews Generated</div>
                    </div>
                </div>

                <div style={{ marginTop: '4rem' }}>
                    <Text as="h3" variant="headingLg" tone="magic" fontWeight="bold">
                        <span style={{ color: '#a78bfa' }}>Data Stream &gt;</span> Audience Activity
                    </Text>
                    
                    <div className="prism-card" style={{ marginTop: '1.5rem', padding: '0', overflow: 'hidden' }}>
                        {campaign.sends.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="glow-table">
                                    <thead>
                                        <tr>
                                            <th>Target Audience</th>
                                            <th>Email Vector</th>
                                            <th>Timestamp</th>
                                            <th>Engaged</th>
                                            <th>Converted</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaign.sends.map((send: any) => (
                                            <tr key={send.id}>
                                                <td style={{ fontWeight: 600 }}>{send.customerName}</td>
                                                <td style={{ color: '#94a3b8' }}>{send.customerEmail}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{new Date(send.sentAt).toLocaleString()}</td>
                                                <td>
                                                    {send.opened 
                                                        ? <span className="status-badge active">Opened</span> 
                                                        : <span className="status-badge" style={{ background: 'rgba(255,255,255,0.05)' }}>Delivered</span>
                                                    }
                                                </td>
                                                <td>
                                                    {send.clicked 
                                                        ? <span className="status-badge active">Clicked</span> 
                                                        : <span style={{ color: '#64748b' }}>-</span>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📡</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 500 }}>Awaiting Transmission Data...</div>
                                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>No automated emails have been dispatched for this strategy yet.</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Page>
    );
}
