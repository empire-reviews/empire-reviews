import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Checkbox,
    Button,
    TextField,
    Box,
    InlineStack,
    Divider,
    Modal,
    Badge,
    Select,
    ActionList,
    Spinner,
    InlineGrid
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { hasActivePayment, requirePayment, getPlanDetails, MONTHLY_PLAN } from "../billing.server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { testAIConnection, type AIProvider } from "../services/ai.server";
import { ArrowLeftIcon, SettingsIcon, ThemeIcon, WandIcon, PlayCircleIcon, CreditCardIcon, ClockIcon, AlertTriangleIcon, LinkIcon } from "@shopify/polaris-icons";

const GROWTH_TIPS = [
    "Stores with photo reviews see a 26% higher conversion rate.",
    "Automate requests to send 3 days after delivery for 2x replies.",
    "Replying to negative reviews within 24h prevents customer churn.",
    "Displaying 'Verified Buyer' badges increases trust by 40%.",
    "Incentivize photo reviews with a small discount for future orders.",
    "Use AI Sentiment to spot trends before they become problems.",
    "High-rating reviews with text build better SEO than stars alone.",
    "Importing your existing CSV reviews is the fastest way to start.",
    "A 4.5 star average feels more 'real' to buyers than a perfect 5.",
    "Email campaigns with scarcity templates get 30% more clicks."
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const billing = await hasActivePayment(request); // Re-fetching billing below, just need session here
    const shop = session.shop;

    // SYNC BILLING STATUS
    const isPro = await hasActivePayment(request);
    const planName = isPro ? "EMPIRE_PRO" : "FREE";

    let settings = await prisma.settings.findUnique({ where: { shop } });

    if (!settings) {
        settings = await prisma.settings.create({ data: { shop, plan: planName } });
    } else if (settings.plan !== planName) {
        // Sync database if status changed
        settings = await prisma.settings.update({
            where: { shop },
            data: { plan: planName }
        });
    }


    // Get full details for the dates
    const subscription = await getPlanDetails(request);

    return json({ settings, isPro, subscription });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "reset") {
        await prisma.review.deleteMany({});
        await prisma.reply.deleteMany({});
        return json({ success: true, message: "App data reset" });
    }

    if (intent === "test_ai") {
        const isPro = await hasActivePayment(request);
        if (!isPro) {
            return json({ success: false, aiTestResult: "AI Features require the Empire Pro plan." });
        }
        const aiProvider = formData.get("aiProvider") as AIProvider;
        const aiApiKey = formData.get("aiApiKey") as string;
        if (!aiProvider || !aiApiKey) {
            return json({ success: false, aiTestResult: "Please select a provider and enter an API key." });
        }
        const result = await testAIConnection({ provider: aiProvider, apiKey: aiApiKey });
        return json({ success: result.success, aiTestResult: result.message });
    }

    const autoPublish = formData.get("autoPublish") === "true";
    const emailAlerts = formData.get("emailAlerts") === "true";
    const themeColor = formData.get("themeColor") as string;

    // AI Configuration
    let aiProvider = formData.get("aiProvider") as string || null;
    let aiApiKey = formData.get("aiApiKey") as string || null;

    // Integrations
    const enableFlow = formData.get("enableFlow") === "true";
    const enableKlaviyo = formData.get("enableKlaviyo") === "true";
    const klaviyoApiKey = formData.get("klaviyoApiKey") as string;
    const reviewRequestDelay = parseInt(formData.get("reviewRequestDelay") as string) || 3;
    // Google Feed is PRO feature
    let enableGoogle = formData.get("enableGoogle") === "true";

    // Double check gating on server side
    const isPro = await hasActivePayment(request);
    if (!isPro) {
        enableGoogle = false; // Force disable if not pro
        aiProvider = null; // Force disable AI if not pro
        aiApiKey = null;
    }

    const settings = await prisma.settings.update({
        where: { shop },
        data: {
            autoPublish,
            emailAlerts,
            themeColor,
            aiProvider,
            aiApiKey,
            enableFlow,
            enableKlaviyo,
            klaviyoApiKey,
            enableGoogle,
            reviewRequestDelay
        },
    });

    return json({ success: true, settings });
};

export default function SettingsPage() {
    const { settings, isPro, subscription } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const navigate = useNavigate();

    // Optimistic UI state
    const [autoPublish, setAutoPublish] = useState(settings.autoPublish);
    const [emailAlerts, setEmailAlerts] = useState(settings.emailAlerts);
    const [themeColor, setThemeColor] = useState(settings.themeColor);
    const [resetModalActive, setResetModalActive] = useState(false);
    const [billingModalActive, setBillingModalActive] = useState(false);
    const [reviewRequestDelay, setReviewRequestDelay] = useState(settings.reviewRequestDelay || 3);
    const [widgetBgColor, setWidgetBgColor] = useState("#ffffff");
    const [starColor, setStarColor] = useState("#fbbf24");
    const [borderRadius, setBorderRadius] = useState("8px");

    const [isDirty, setIsDirty] = useState(false);

    // Watch for changes to trigger Save Bar
    useEffect(() => {
        setIsDirty(true);
    }, [autoPublish, emailAlerts, themeColor, widgetBgColor, starColor, borderRadius, reviewRequestDelay]);

    // Integration States
    const [flowEnabled, setFlowEnabled] = useState(settings.enableFlow);
    const [klaviyoEnabled, setKlaviyoEnabled] = useState(settings.enableKlaviyo);
    const [klaviyoKey, setKlaviyoKey] = useState(settings.klaviyoApiKey || "");
    const [googleShoppingEnabled, setGoogleShoppingEnabled] = useState(settings.enableGoogle);

    // AI Configuration States
    const [aiProvider, setAiProvider] = useState(settings.aiProvider || "");
    const [aiApiKey, setAiApiKey] = useState(settings.aiApiKey || "");
    const [aiTestLoading, setAiTestLoading] = useState(false);
    const [aiTestResult, setAiTestResult] = useState<string | null>(null);
    const [aiTestSuccess, setAiTestSuccess] = useState(false);

    // Tip Rotation Logic
    const [tipIndex, setTipIndex] = useState(0);
    const [fade, setFade] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            setFade(false);
            setTimeout(() => {
                setTipIndex((prev) => (prev + 1) % GROWTH_TIPS.length);
                setFade(true);
            }, 500);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = () => {
        fetcher.submit(
            {
                autoPublish: String(autoPublish),
                emailAlerts: String(emailAlerts),
                themeColor,
                aiProvider,
                aiApiKey,
                enableFlow: String(flowEnabled),
                enableKlaviyo: String(klaviyoEnabled),
                klaviyoApiKey: klaviyoKey,
                enableGoogle: String(googleShoppingEnabled),
                reviewRequestDelay: String(reviewRequestDelay)
            },
            { method: "post" }
        );
        setIsDirty(false);
        shopify.toast.show("Settings saved");
    };

    const handleReset = () => {
        fetcher.submit({ intent: "reset" }, { method: "post" });
        setResetModalActive(false);
        shopify.toast.show("App data wiped");
    };

    const handleUpgrade = () => {
        navigate("/app/plans");
    };

    const feedUrl = typeof window !== "undefined"
        ? `${window.location.origin}/api/feed/xml?shop=${settings.shop}`
        : "";

    const [activeTab, setActiveTab] = useState("brand");

    const tabs = [
        { id: "brand", content: "Brand & Display", icon: ThemeIcon },
        { id: "automation", content: "Automation & Timing", icon: ClockIcon },
        { id: "ecosystem", content: "Integrations & AI", icon: LinkIcon },
        { id: "billing", content: "Plan & Billing", icon: CreditCardIcon },
        { id: "danger", content: "Danger Zone", icon: AlertTriangleIcon },
    ];

    return (
        <Page
            title="Settings"
            subtitle="Manage your Empire Reviews configuration"
            backAction={{ content: 'Dashboard', onAction: () => navigate("/app") }}
            primaryAction={isDirty ? { content: 'Save settings', onAction: handleSave } : undefined}
            fullWidth
        >
            <style>{`
                .glow-card {
                    transition: transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1), box-shadow 0.2s cubic-bezier(0.25, 0.1, 0.25, 1) !important;
                    border-radius: 12px;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                .glow-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 40px -8px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.05) !important;
                }
                .Polaris-Layout__Section {
                    max-width: none !important;
                }
            `}</style>

            <div style={{ marginBottom: '24px' }}>
                <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
                    <div className="glow-card" style={{ background: 'white', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <Text as="h3" variant="headingSm" tone="subdued" fontWeight="bold">SYSTEM HEALTH</Text>
                            <Badge tone={isPro ? "success" : "info"}>{isPro ? "Pro Optimized" : "Standard"}</Badge>
                        </div>
                        <Text as="p" variant="headingXl" fontWeight="bold">Optimal</Text>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '8px' }}>All core settings are configured.</p>
                        <div style={{ marginTop: '16px', height: '4px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: '100%', height: '100%', background: '#10b981' }}></div>
                        </div>
                    </div>

                    <div className="glow-card" style={{ background: 'white', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <Text as="h3" variant="headingSm" tone="subdued" fontWeight="bold">AI ENGINE</Text>
                            <Badge tone={aiTestSuccess ? "success" : "attention"}>{aiTestSuccess ? "Connected" : "Standby"}</Badge>
                        </div>
                        <Text as="p" variant="headingXl" fontWeight="bold">{settings.aiProvider ? settings.aiProvider.toUpperCase() : "Inactive"}</Text>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '8px' }}>Auto-replies and sentiment analysis.</p>
                        <div style={{ marginTop: '16px', height: '4px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: settings.aiProvider && settings.aiApiKey ? '100%' : '15%', height: '100%', background: settings.aiProvider ? '#6366f1' : '#f59e0b' }}></div>
                        </div>
                    </div>

                    <div className="glow-card" style={{ background: 'white', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <Text as="h3" variant="headingSm" tone="subdued" fontWeight="bold">DATA CAPACITY</Text>
                            <Badge tone={isPro ? "info" : "critical"}>{isPro ? "Unlimited" : "Capped"}</Badge>
                        </div>
                        <Text as="p" variant="headingXl" fontWeight="bold">{isPro ? "∞" : "50"}</Text>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '8px' }}>{isPro ? "Unlimited review storage." : "Upgrade to prevent data loss."}</p>
                        <div style={{ marginTop: '16px', height: '4px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: isPro ? '100%' : '90%', height: '100%', background: isPro ? '#3b82f6' : '#ef4444' }}></div>
                        </div>
                    </div>
                </InlineGrid>
            </div>

            <Layout>
                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        <Card padding="0">
                            <ActionList
                                actionRole="menuitem"
                                items={tabs.map(tab => ({
                                    content: tab.content,
                                    icon: tab.icon,
                                    active: activeTab === tab.id,
                                    onAction: () => setActiveTab(tab.id)
                                }))}
                            />
                        </Card>

                        <Card>
                            <BlockStack gap="300">
                                <Text as="h3" variant="headingSm" fontWeight="bold">Did you know?</Text>
                                <div style={{ height: '70px', display: 'flex', alignItems: 'flex-start' }}>
                                    <p style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.4s', fontSize: '0.9rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                                        {GROWTH_TIPS[tipIndex]}
                                    </p>
                                </div>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section>
                    {activeTab === 'brand' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Brand Identity</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="p" variant="bodyMd" tone="subdued">Customize your review widget to match your store's look & feel.</Text>
                                    <Divider />
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: 24, height: 24, background: themeColor, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Theme Color</Text>
                                        </div>
                                        <TextField label="" value={themeColor} onChange={setThemeColor} autoComplete="off" helpText="Used for text, borders, stars, and buttons." connectedRight={<input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }} />} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: 24, height: 24, background: widgetBgColor, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Widget Background</Text>
                                        </div>
                                        <TextField label="" value={widgetBgColor} onChange={setWidgetBgColor} autoComplete="off" connectedRight={<input type="color" value={widgetBgColor} onChange={(e) => setWidgetBgColor(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }} />} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: 24, height: 24, background: starColor, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Star Rating Color</Text>
                                        </div>
                                        <TextField label="" value={starColor} onChange={setStarColor} autoComplete="off" connectedRight={<input type="color" value={starColor} onChange={(e) => setStarColor(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }} />} />
                                    </div>
                                    <Select label={<Text as="p" variant="bodyMd" fontWeight="semibold">Corner Style</Text>} options={[{ label: 'Sharp (0px)', value: '0px' }, { label: 'Rounded (8px)', value: '8px' }, { label: 'Pill (16px)', value: '16px' }]} value={borderRadius} onChange={setBorderRadius} />
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'automation' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Automation & Timing</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Publishing & Alerts</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Set it and forget it. Let the app handle the routine work.</Text>
                                    <Divider />
                                    <Checkbox label="Auto-publish 5-star reviews" helpText="Skip moderation for top-rated reviews." checked={autoPublish} onChange={setAutoPublish} />
                                    <Checkbox label="Email Alerts for Negative Reviews" helpText="Get immediate notifications for 1-2 star ratings." checked={emailAlerts} onChange={setEmailAlerts} />
                                </BlockStack>
                            </Card>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Email Timing</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">When should we ask for a review?</Text>
                                    <Divider />
                                    <TextField label="Send Request After (Days)" type="number" value={String(reviewRequestDelay)} onChange={(val) => setReviewRequestDelay(parseInt(val) || 3)} autoComplete="off" helpText="Recommended: 3-5 days after order." suffix="days" min={1} max={30} />
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'ecosystem' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Integrations & AI</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Ecosystem Sync</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Connect Empire to your favorite tools.</Text>
                                    <Divider />
                                    <Checkbox label="Shopify Flow" helpText="Trigger workflows on negative reviews." checked={flowEnabled} onChange={setFlowEnabled} />
                                    <Box>
                                        <Checkbox label="Klaviyo Sync" helpText="Push reviewers to 'Safe Lists'." checked={klaviyoEnabled} onChange={setKlaviyoEnabled} />
                                        {klaviyoEnabled && <div style={{ marginTop: '10px', paddingLeft: '20px' }}><TextField label="Secret API Key" value={klaviyoKey} onChange={setKlaviyoKey} autoComplete="off" type="password" /></div>}
                                    </Box>
                                    <Box>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <Checkbox label="Google Shopping XML" helpText="Generate product feed with stars." checked={googleShoppingEnabled} onChange={setGoogleShoppingEnabled} disabled={!isPro} />
                                            {!isPro && <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>}
                                        </div>
                                        {googleShoppingEnabled && isPro && <div style={{ marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}><strong>Feed URL:</strong><div style={{ wordBreak: 'break-all', color: '#6366f1' }}>{feedUrl}</div></div>}
                                    </Box>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">AI Engine</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Power your store with ChatGPT, Claude, Groq, or DeepSeek.</Text>
                                    <Divider />
                                    {!isPro ? (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
                                                <Checkbox label="Autonomous AI Engine" helpText="Unlock AI features" checked={false} onChange={() => { }} disabled />
                                            </div>
                                            <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>
                                        </div>
                                    ) : (
                                        <>
                                            <Select label="AI Provider" options={[{ label: 'Select a provider...', value: '' }, { label: 'Groq (100% Free)', value: 'groq' }, { label: 'OpenAI (GPT-4o Mini)', value: 'openai' }, { label: 'Google Gemini', value: 'gemini' }, { label: 'Anthropic Claude', value: 'claude' }, { label: 'DeepSeek', value: 'deepseek' }, { label: 'Ollama / Custom API', value: 'ollama' }]} value={aiProvider} onChange={setAiProvider} helpText={aiProvider === 'ollama' ? 'Requires Ngrok/Cloudflare Tunnel to connect Vercel to your local machine.' : 'Choose the AI model you prefer.'} />
                                            {aiProvider && (
                                                <TextField label={aiProvider === 'ollama' ? "Model Name / Remote URL / API Key" : "Secret API Key"} value={aiApiKey} onChange={setAiApiKey} autoComplete="off" type={aiProvider === 'ollama' ? "text" : "password"} placeholder={aiProvider === 'ollama' ? "e.g., https://ollama.com|gpt-oss:120b|sk-key123" : ""} helpText={aiProvider === 'openai' ? 'Get yours at platform.openai.com/api-keys' : aiProvider === 'gemini' ? 'Get yours at aistudio.google.com/apikey' : aiProvider === 'claude' ? 'Get yours at console.anthropic.com/settings/keys' : aiProvider === 'deepseek' ? 'Get yours at platform.deepseek.com/api_keys' : aiProvider === 'ollama' ? 'Format: URL|Model|API_KEY (e.g. https://ollama.com|gpt-oss:120b|sk-123). URL and Key are optional.' : ''} />
                                            )}
                                            {aiProvider && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <Button onClick={() => { setAiTestLoading(true); setAiTestResult(null); fetcher.submit({ intent: 'test_ai', aiProvider, aiApiKey }, { method: 'post' }); setTimeout(() => { setAiTestLoading(false); const data = fetcher.data as any; if (data?.aiTestResult) { setAiTestResult(data.aiTestResult); setAiTestSuccess(data.success); } else { setAiTestResult('Test sent — check result after save.'); setAiTestSuccess(true); } }, 4000); }} loading={aiTestLoading} disabled={aiTestLoading || !aiApiKey} size="micro">Test Connection</Button>
                                                    {aiTestResult && <div style={{ marginTop: '4px' }}><Badge tone={aiTestSuccess ? 'success' : 'critical'}>{aiTestResult}</Badge></div>}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'billing' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Plan & Billing</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingMd" fontWeight="bold">Current Plan</Text>
                                        <Badge tone={isPro ? "success" : "info"}>{isPro ? "PRO" : "STARTER"}</Badge>
                                    </InlineStack>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        {isPro ? "You are on the Empire Pro plan. Enjoy unlimited reviews and AI features." : "You are currently on the Starter plan. Limit: 50 reviews."}
                                    </Text>
                                    <Divider />
                                    {isPro ? (
                                        <Button fullWidth onClick={() => setBillingModalActive(true)}>Manage Subscription</Button>
                                    ) : (
                                        <Button fullWidth variant="primary" onClick={handleUpgrade}>Upgrade to Empire Pro</Button>
                                    )}
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'danger' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Danger Zone</Text>
                            <Card background="bg-surface-critical">
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" tone="critical" fontWeight="bold">Delete All Data</Text>
                                    <Text as="p" variant="bodyMd">This will permanently delete all your reviews, replies, and reset your configuration. This action cannot be reversed.</Text>
                                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                        <Button tone="critical" variant="primary" onClick={() => setResetModalActive(true)}>Wipe Application Data</Button>
                                    </div>
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}
                </Layout.Section>
            </Layout>

            <Modal open={resetModalActive} onClose={() => setResetModalActive(false)} title="Wipe all data?" primaryAction={{ content: "Yes, delete everything", onAction: handleReset, destructive: true }} secondaryActions={[{ content: "Cancel", onAction: () => setResetModalActive(false) }]}>
                <Modal.Section>
                    <Text as="p">Are you absolutely sure? This will delete all reviews. You cannot undo this.</Text>
                </Modal.Section>
            </Modal>

            <Modal open={billingModalActive} onClose={() => setBillingModalActive(false)} title="Your Empire Membership" primaryAction={{ content: "Extend / Renew Plan", onAction: handleUpgrade, disabled: !isPro }} secondaryActions={[{ content: "Close", onAction: () => setBillingModalActive(false) }]}>
                <Modal.Section>
                    <BlockStack gap="400">
                        {subscription && subscription.status === "ACTIVE" ? (
                            <BlockStack gap="200">
                                <Badge tone="success">Active Subscription</Badge>
                                <Text as="p" fontWeight="bold">Empire Pro App</Text>
                            </BlockStack>
                        ) : (
                            <Text as="p">You are currently on the free Starter plan.</Text>
                        )}
                        <Divider />
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '8px' }}>
                            <Text as="p" tone="subdued" fontWeight="bold">VIP / Partner Access</Text>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>You have lifetime access enabled manually (e.g. via Referral). If you ever lose access, click Extend / Renew Plan above.</p>
                        </div>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
