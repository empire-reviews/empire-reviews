import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs, type LinksFunction } from "@remix-run/node";
import campaignStyles from "../styles/campaigns.css?url";
import { CAMPAIGN_TEMPLATES } from "../lib/campaign-templates";

export const links: LinksFunction = () => [
    { rel: "stylesheet", href: campaignStyles }
];
import { useLoaderData, useFetcher, useNavigate, Link } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Button,
    TextField,
    Box,
    InlineStack,
    Badge,
    Divider,
    Select,
    Banner,
    Tooltip,
    ProgressBar,
    Modal,

} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendCampaignEmail } from "../services/email.server";
import { callAIForCampaign } from "../services/ai.server";
import { useState, useCallback, useEffect } from "react";
import {
    ArrowLeftIcon,
    EmailIcon,
    MagicIcon,
    SendIcon,
    ClockIcon,
    CheckIcon,
    ChartVerticalIcon,
    EditIcon,
    LockIcon
} from "@shopify/polaris-icons";
import { BackButton } from "../components/BackButton";
import { isPlanPro } from "../billing.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const isPro = await isPlanPro(session.shop);

    // 1. Fetch campaigns from DB
    const dbCampaigns = await prisma.campaign.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: 'desc' },
        include: { metrics: true }
    });

    // 2. Fetch True Audience Size & Live Mock Data
    const potentialAudience = await prisma.order.count({ where: { shop: session.shop } });

    const orderResponse = await admin.graphql(
        `#graphql
        query getLatestOrder {
            orders(first: 1, reverse: true) {
                nodes {
                    customer { firstName }
                    lineItems(first: 1) { nodes { product { title } } }
                }
            }
        }`
    );
    const orderData = await orderResponse.json();
    const latestOrder = orderData.data?.orders?.nodes?.[0];
    const mockCustomerName = latestOrder?.customer?.firstName || "Valued Customer";
    const mockProductTitle = latestOrder?.lineItems?.nodes?.[0]?.product?.title || "Premium Item";

    // 3. Calculate Aggregate Stats
    const totalSent = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalSent || 0), 0);
    const totalOpened = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalOpened || 0), 0);
    const totalClicked = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalClicked || 0), 0);
    const totalReviews = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalReviews || 0), 0);

    // Avoid division by zero
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

    return json({
        stats: { openRate, clickRate, generatedReviews: totalReviews, potentialAudience },
        mockData: { customerName: mockCustomerName, productTitle: mockProductTitle, storeName: session.shop },
        activeCampaigns: dbCampaigns.map((c: any) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            sent: c.metrics?.totalSent || 0,
            openRate: c.metrics?.openRate ? `${c.metrics.openRate.toFixed(1)}%` : "0%"
        })),
        isPro
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, billing, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "delete") {
        const campaignId = formData.get("campaignId") as string;

        // Transactional delete to handle Foreign Key Constraints
        await prisma.$transaction([
            prisma.campaignMetrics.deleteMany({ where: { campaignId } }),
            prisma.campaignSend.deleteMany({ where: { campaignId } }),
            prisma.campaign.deleteMany({ where: { id: campaignId } })
        ]);

        return json({ success: true, deletedId: campaignId });
    }

    if (intent === "activate") {
        const campaignId = formData.get("campaignId") as string;
        
        // Deactivate all others
        await prisma.campaign.updateMany({
            where: { shop: session.shop, status: "active" },
            data: { status: "paused" }
        });

        // Activate the selected one
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: "active" }
        });
        return json({ success: true, activatedId: campaignId });
    }

    if (intent === "rename") {
        const campaignId = formData.get("campaignId") as string;
        const newName = formData.get("newName") as string;

        await prisma.campaign.update({
            where: { id: campaignId },
            data: { name: newName }
        });

        return json({ success: true, renamedId: campaignId });
    }

    // 1. Resolve subject & body (AI-generated or manual)
    const templateType = formData.get("templateType") as string;
    const rawDiscount = formData.get("discount") as string;
    const discount = rawDiscount ? (isNaN(parseInt(rawDiscount)) ? null : parseInt(rawDiscount)) : null;

    let subject = formData.get("subject") as string;
    let body = formData.get("body") as string;
    const audience = formData.get("audience") as string;

    // AI template: generate subject + body using merchant's configured AI provider
    if (templateType === "ai") {
        const isPro = await isPlanPro(session.shop);
        if (!isPro) {
            return json({ error: "AI Features require Empire Pro." }, { status: 403 });
        }

        const aiPrompt = formData.get("aiPrompt") as string;
        const settings = await prisma.settings.findFirst({ where: { shop: session.shop } });

        if (settings?.aiProvider && settings?.aiApiKey && aiPrompt) {
            try {
                const generated = await callAIForCampaign(
                    { provider: settings.aiProvider as any, apiKey: settings.aiApiKey },
                    aiPrompt
                );
                subject = generated.subject;
                body = generated.body;
            } catch (err) {
                console.error("AI Campaign generation failed:", err);
                subject = subject || "We'd love your feedback!";
                body = body || "Hi {{ name }},\n\nThank you for your recent order. We'd love to hear what you think!";
            }
        } else {
            subject = subject || "We'd love your feedback!";
            body = body || "Hi {{ name }},\n\nThank you for your recent order. We'd love to hear what you think!";
        }
    }

    if (intent === "test") {
        let sessionEmail = "test@empirereviews.com";
        try {
            const emailResponse = await admin.graphql(`
                #graphql
                query {
                    shop {
                        email
                    }
                }
            `);
            const shopData = await emailResponse.json();
            if (shopData.data?.shop?.email) {
                sessionEmail = shopData.data.shop.email;
            }
        } catch (e) {
            console.error("Failed to fetch shop email from GraphQL", e);
        }
        const dummyProduct = "Sample Product";
        const dummyReviewLink = `https://${session.shop}/apps/empire-reviews`;
        const testButtonHtml = `<div style="text-align: center; margin-top: 30px;"><a href="${dummyReviewLink}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px; text-decoration: none; display: inline-block;">Write a Review</a></div>`;
        
        const personalizedBody = body
            .replace(/\\\\n/g, '<br/>')
            .replace(/\\n/g, '<br/>')
            .replace(/\n/g, '<br/>')
            .replace(/{{ name }}/g, "Test User")
            .replace(/{{ store_name }}/g, session.shop)
            .replace(/{{ product_title }}/g, dummyProduct)
            .replace(/{{ review_link }}/g, testButtonHtml);

        await sendCampaignEmail(
            session.shop,
            sessionEmail,
            subject.replace(/{{ store_name }}/g, session.shop),
            personalizedBody,
            "test-campaign-" + Date.now()
        );
        return json({ success: true, testMode: true });
    }

    // Deactivate any currently active campaigns for this shop
    await prisma.campaign.updateMany({
        where: { shop: session.shop, status: "active" },
        data: { status: "paused" }
    });

    const campaign = await prisma.campaign.create({
        data: {
            shop: session.shop,
            name: `Campaign - ${new Date().toLocaleDateString()}`,
            subject,
            body,
            templateType,
            discount,
            status: "active", // Now cleanly acts as the live automation template!
            metrics: {
                create: { totalSent: 0 }
            }
        }
    });

    return json({ success: true, campaignId: campaign.id });
};

export default function CampaignsPage() {
    const { stats, activeCampaigns, mockData, isPro } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const navigate = useNavigate();

    const [selectedTab, setSelectedTab] = useState(0);
    const [templateType, setTemplateType] = useState("reciprocity");

    // Rename State
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameId, setRenameId] = useState("");
    const [renameValue, setRenameValue] = useState("");

    // Email Builder State
    const [subject, setSubject] = useState("How did we do? 🌟");
    const [body, setBody] = useState("Hi {{ name }},\\n\\nWe hope you're loving your new order! \\n\\nCould you spare 30 seconds to help a small business grow? It would mean the world to us.\\n\\n{{ review_link }}");
    const [discount, setDiscount] = useState("");
    const [audience, setAudience] = useState("recent");
    const [testing, setTesting] = useState(false);
    // AI Template State
    const [aiPrompt, setAiPrompt] = useState("");

    // Listen for Fetcher Responses (like Test Email success)
    useEffect(() => {
        if (fetcher.data && fetcher.state === "idle") {
            const data = fetcher.data as any;
            if (data.testMode && data.success) {
                shopify.toast.show("✅ Test email delivered to your inbox!");
            } else if (data.error) {
                shopify.toast.show("❌ Error: " + data.error);
            }
        }
    }, [fetcher.data, fetcher.state]);

    const handleTemplateChange = (val: string) => {
        setTemplateType(val);
        setSubject(CAMPAIGN_TEMPLATES[val].subject);
        setBody(CAMPAIGN_TEMPLATES[val].body);
    };

    const handleLaunch = () => {
        const payload: Record<string, string> = {
            subject,
            body,
            templateType,
            discount,
            // Audience is kept to potentially restrict automation, but defaults rule now
        };
        if (templateType === "ai") payload.aiPrompt = aiPrompt;
        fetcher.submit(payload, { method: "post" });
        shopify.toast.show(templateType === "ai" ? "AI Automation Activated! 🤖🚀" : "Automation Activated! 🚀");
        setSelectedTab(0);
    };

    const handleTest = () => {
        setTesting(true);
        const payload: Record<string, string> = {
            intent: "test", subject, body, templateType, discount
        };
        fetcher.submit(payload, { method: "post" });
        shopify.toast.show("Sending test email to your inbox...");
        setTimeout(() => setTesting(false), 2000);
    };

    const handleLaunchConfirm = () => {
        if (confirm("Set this as your active background sequence for all future orders?")) {
            handleLaunch();
        }
    };

    return (
        <div className="holographic-void">
            <Page fullWidth>
                <BackButton />
                <div className="holo-header">
                    <h1 className="holo-title">Email Campaigns</h1>
                    <p className="holo-subtitle">Automated review requests designed to convert.</p>
                </div>

                {/* FLOATING DOCK */}
                <div className="holo-dock">
                    <button className={`dock-item ${selectedTab === 0 ? 'active' : ''}`} onClick={() => setSelectedTab(0)}>
                        <ChartVerticalIcon style={{ width: 16 }} /> Dashboard
                    </button>
                    <button className={`dock-item ${selectedTab === 1 ? 'active' : ''}`} onClick={() => setSelectedTab(1)}>
                        <MagicIcon style={{ width: 16 }} /> Create Campaign
                    </button>
                </div>

                {selectedTab === 0 && (
                    <>
                        <div className="prism-grid">
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark"></span>Audience Size</div>
                                <div className="prism-val">{stats.potentialAudience.toLocaleString()}</div>
                                <Badge tone="info">Shopify Customers</Badge>
                            </div>
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark" style={{ background: '#ec4899', boxShadow: '0 0 8px #ec4899' }}></span>Open Rate</div>
                                <div className="prism-val">{stats.openRate}%</div>
                                <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '10px' }}>
                                    <div style={{ height: '100%', width: `${stats.openRate}%`, background: '#ec4899', borderRadius: '2px' }}></div>
                                </div>
                            </div>
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark" style={{ background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>Click Rate</div>
                                <div className="prism-val">{stats.clickRate}%</div>
                                <Badge tone="success">High Intent</Badge>
                            </div>
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark" style={{ background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }}></span>Reviews</div>
                                <div className="prism-val">{stats.generatedReviews}</div>
                                <Badge tone="attention">+12 This Week</Badge>
                            </div>
                        </div>

                        <div className="forge-panel" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ padding: '2rem', borderBottom: '1px solid var(--glass-border)' }}>
                                <Text as="h3" variant="headingLg" tone="magic">Recent Activity</Text>
                            </div>
                            <div style={{ padding: '2rem' }}>
                                {activeCampaigns.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                                        <InlineStack align="center" gap="200">
                                            <SendIcon style={{ width: 32, opacity: 0.3 }} />
                                            <div style={{ fontSize: '1.2rem' }}>No campaigns sent yet.</div>
                                        </InlineStack>
                                    </div>
                                ) : (
                                    <div className="beam-container">
                                        {activeCampaigns.map(c => (
                                            <div 
                                                key={c.id} 
                                                className={`transmission-beam ${c.status === 'active' ? 'beam-active' : ''}`}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => navigate(`/app/campaigns/${c.id}`)}
                                            >
                                                <div>
                                                    <div className="tb-name">{c.name}</div>
                                                    <div className="tb-meta">STATUS: <span style={{ color: c.status === 'active' ? '#34d399' : '#f59e0b' }}>{c.status.toUpperCase()}</span></div>
                                                </div>
                                                <div>
                                                    <div className="tb-stat-val">{c.sent}</div>
                                                    <div className="tb-stat-label">SENT</div>
                                                </div>
                                                <div>
                                                    <div className="tb-stat-val">{c.openRate}</div>
                                                    <div className="tb-stat-label">OPEN RATE</div>
                                                </div>
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <InlineStack gap="200">
                                                        {c.status !== "active" && (
                                                            <Button variant="plain" onClick={() => {
                                                                fetcher.submit({ intent: "activate", campaignId: c.id }, { method: "post" });
                                                                shopify.toast.show("Automation engine switched!");
                                                            }}>Activate Engine</Button>
                                                        )}
                                                        <Button variant="plain" icon={EditIcon} onClick={() => {
                                                            setRenameId(c.id);
                                                            setRenameValue(c.name);
                                                            setRenameModalOpen(true);
                                                        }} />
                                                        <Button variant="plain" tone="critical" onClick={() => {
                                                            if(confirm("Are you sure you want to delete this campaign and all its history?")) {
                                                                fetcher.submit({ intent: "delete", campaignId: c.id }, { method: "post" });
                                                            }
                                                        }}>Delete</Button>
                                                    </InlineStack>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {selectedTab === 1 && (
                    <div className="forge-grid">
                        {/* LEFT: STRATEGY */}
                        <div className="forge-panel">
                            <Text as="h3" variant="headingMd" tone="magic">1. Select Strategy</Text>
                            <div className="neuro-chip-grid">
                                <div
                                    className={`neuro-chip ${templateType === 'reciprocity' ? 'selected' : ''}`}
                                    onClick={() => handleTemplateChange('reciprocity')}
                                >
                                    <span className="chip-icon">🎁</span>
                                    <div className="chip-name">Reciprocity</div>
                                </div>
                                <div
                                    className={`neuro-chip ${templateType === 'altruism' ? 'selected' : ''}`}
                                    onClick={() => handleTemplateChange('altruism')}
                                >
                                    <span className="chip-icon">🌱</span>
                                    <div className="chip-name">Altruism</div>
                                </div>
                                <div
                                    className={`neuro-chip ${templateType === 'scarcity' ? 'selected' : ''}`}
                                    onClick={() => handleTemplateChange('scarcity')}
                                >
                                    <span className="chip-icon">⏳</span>
                                    <div className="chip-name">Scarcity</div>
                                </div>
                                <div
                                    className={`neuro-chip ${templateType === 'ai' ? 'selected' : ''}`}
                                    onClick={() => {
                                        setTemplateType('ai');
                                        setSubject("(AI will write this)");
                                        setBody("(AI will write this based on your prompt)");
                                    }}
                                    style={{ borderColor: templateType === 'ai' ? '#7c3aed' : undefined }}
                                >
                                    <span className="chip-icon">🤖</span>
                                    <div className="chip-name">AI Write</div>
                                </div>
                            </div>

                            <div style={{ margin: '2rem 0', padding: '1.5rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                                <Text as="p" tone="magic" fontWeight="bold">
                                    {templateType === 'ai'
                                        ? '🤖 AI Write: Describe the email you want — your AI assistant will write the subject and body automatically.'
                                        : CAMPAIGN_TEMPLATES[templateType]?.hint
                                    }
                                </Text>
                            </div>

                            <div className="locked-container">
                                {templateType === 'ai' && !isPro && (
                                    <div className="pro-overlay">
                                        <div className="pro-upsell-card">
                                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                                            <Text as="h2" variant="headingLg" fontWeight="bold">Unlock AI Power</Text>
                                            <p style={{ color: '#64748b', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                                Empire Pro members can use AI to instantly write high-converting review requests.
                                            </p>
                                            <Link to="/app/plans" className="pro-btn-3d">
                                                Upgrade to Pro
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                <div className={templateType === 'ai' && !isPro ? 'is-locked' : ''}>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd" tone="magic">2. Audience Segmentation</Text>
                                        <Select
                                            label="Target Audience"
                                            options={[{ label: "Recent Buyers (Last 30 Days)", value: "recent" }]}
                                            value={audience}
                                            onChange={setAudience}
                                            helpText="We automatically exclude customers who have already reviewed or unsubscribed."
                                        />
                                    </BlockStack>
                                    <br/>

                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd" tone="magic">3. Customize Content</Text>
                                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                                            <strong>Available merge tags:</strong> <code style={{background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px'}}>{"{{ name }}"}</code>, <code style={{background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px'}}>{"{{ store_name }}"}</code>, <code style={{background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px'}}>{"{{ product_title }}"}</code>, <code style={{background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px'}}>{"{{ review_link }}"}</code>
                                        </div>
                                        {templateType === 'reciprocity' && (
                                            <TextField
                                                label="Discount Code Name (e.g. SAVE15)"
                                                value={discount}
                                                onChange={(v) => {
                                                    setDiscount(v);
                                                }}
                                                autoComplete="off"
                                                helpText="Make sure to manually create this exact code in your Shopify Admin -> Discounts."
                                            />
                                        )}
                                        {templateType === 'ai' ? (
                                            <TextField
                                                label="What should the AI write? (Your prompt)"
                                                value={aiPrompt}
                                                onChange={setAiPrompt}
                                                multiline={4}
                                                autoComplete="off"
                                                placeholder="e.g. Write a friendly review request email for a skincare brand. Mention we care about honest feedback and offer a 10% discount on next order."
                                                helpText="Your AI provider configured in Settings will generate the subject line and email body."
                                            />
                                        ) : (
                                            <>
                                                <TextField label="Subject Line" value={subject} onChange={setSubject} autoComplete="off" />
                                                <TextField label="Email Body" value={body} onChange={setBody} multiline={6} autoComplete="off" />
                                            </>
                                        )}
                                    </BlockStack>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '2.5rem' }}>
                                        <button className="test-btn" onClick={handleTest} disabled={testing}>
                                            {testing ? "Sending..." : "Send Test 📧"}
                                        </button>
                                        <button className="ignite-btn" onClick={handleLaunchConfirm} disabled={fetcher.state === "submitting"}>
                                            {fetcher.state === "submitting" ? "Activating Automations..." : "Activate Setup 🚀"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: HOLO-PROJECTOR */}
                        <div className="holo-form">
                            <div className="projector-beam"></div>
                            <div className="iphone-holo">
                                <div className="holo-screen">
                                    <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100px', height: '26px', background: '#000', borderBottomLeftRadius: '14px', borderBottomRightRadius: '14px', zIndex: 10 }}></div>

                                    <div className="email-mockup-header" style={{ paddingTop: '40px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8e8e93', marginBottom: '10px', padding: '0 10px' }}>
                                            <span>9:41</span>
                                            <span>5G</span>
                                        </div>
                                        <Divider />
                                        <div style={{ padding: '10px 0' }}>
                                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{mockData.storeName}</div>
                                            <div style={{ fontSize: '13px', color: '#333' }}>{subject.replace(/{{ store_name }}/g, mockData.storeName).replace(/{{ product_title }}/g, mockData.productTitle)}</div>
                                            <div style={{ fontSize: '12px', color: '#8e8e93' }}>To: You</div>
                                        </div>
                                        <Divider />
                                    </div>

                                    <div className="holo-email-body">
                                        {body
                                            .replace(/{{ name }}/g, mockData.customerName)
                                            .replace(/{{ store_name }}/g, mockData.storeName)
                                            .replace(/{{ product_title }}/g, mockData.productTitle)
                                            .replace(/{{ review_link }}/g, '')
                                            .split('\\n').map((line, i) => (
                                                <p key={i} style={{ marginBottom: line ? '1em' : '0' }}>{line}</p>
                                            ))
                                        }

                                        <div style={{ textAlign: 'center', marginTop: '30px' }}>
                                            <div style={{
                                                background: '#000',
                                                color: '#fff',
                                                padding: '12px 24px',
                                                borderRadius: '8px',
                                                display: 'inline-block',
                                                fontWeight: 'bold',
                                                fontSize: '14px'
                                            }}>
                                                Write a Review
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center', marginTop: '30px', color: '#999', fontSize: '11px' }}>
                                            <p>Sent with Empire Reviews</p>
                                            <p>Unsubscribe</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--neon-cyan)', fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                Live Mobile Preview
                            </div>
                        </div>
                    </div>
                )}

                <Modal
                    open={renameModalOpen}
                    onClose={() => setRenameModalOpen(false)}
                    title="Rename Campaign"
                    primaryAction={{
                        content: 'Save',
                        onAction: () => {
                            fetcher.submit({ intent: "rename", campaignId: renameId, newName: renameValue }, { method: "post" });
                            setRenameModalOpen(false);
                        },
                    }}
                    secondaryActions={[{ content: 'Cancel', onAction: () => setRenameModalOpen(false) }]}
                >
                    <Modal.Section>
                        <TextField label="Campaign Name" value={renameValue} onChange={setRenameValue} autoComplete="off" />
                    </Modal.Section>
                </Modal>
            </Page>
        </div>
    );
}
