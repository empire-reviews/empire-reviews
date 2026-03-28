import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
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
    Divider,
    Modal,
    Badge,
    Select,
    ActionList,
    InlineGrid
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { hasActivePayment, getPlanDetails } from "../billing.server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { testAIConnection, type AIProvider } from "../services/ai.server";
import { ThemeIcon, CreditCardIcon, ClockIcon, AlertTriangleIcon, LinkIcon } from "@shopify/polaris-icons";
import { BackButton } from "../components/BackButton";

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
    const { billing, session } = await authenticate.admin(request);
    const shop = session.shop;

    // SAFE SYNC: Only promote to EMPIRE_PRO, NEVER demote to FREE.
    // If billing.check() times out (cold start), isPro=false would otherwise
    // overwrite a VIP referral-code user's plan to FREE permanently.
    // Downgrades only happen via the uninstall webhook, not here.
    const isPro = await hasActivePayment(billing, session);

    let settings = await prisma.settings.findUnique({ where: { shop } });

    if (!settings) {
        // First time: create with current plan
        const initialPlan = isPro ? "EMPIRE_PRO" : "FREE";
        settings = await prisma.settings.create({ data: { shop, plan: initialPlan } });
    } else if (isPro && settings.plan !== "EMPIRE_PRO") {
        // Only upgrade, never downgrade — downgrade handled by uninstall webhook only
        settings = await prisma.settings.update({
            where: { shop },
            data: { plan: "EMPIRE_PRO" }
        });
    }

    // Get full details for the dates
    const subscription = await getPlanDetails(billing);

    return json({ settings, isPro, subscription });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { billing, session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "reset") {
        await prisma.review.deleteMany({ where: { shop } });
        await prisma.reply.deleteMany({ where: { review: { shop } } });
        return json({ success: true, message: "App data reset" });
    }

    if (intent === "test_ai") {
        const isPro = await hasActivePayment(billing, session);
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

    const publishMode = formData.get("publishMode") as string || "none"; // none | five_star | all
    const autoPublish = publishMode !== "none"; // backwards compat — true if any auto-publish is active
    const emailAlerts = formData.get("emailAlerts") === "true";
    const themeColor = formData.get("themeColor") as string;
    const widgetBgColor = formData.get("widgetBgColor") as string || "#ffffff";
    const starColor = formData.get("starColor") as string || "#fbbf24";
    const borderRadius = formData.get("borderRadius") as string || "8px";
    const physicalAddress = (formData.get("physicalAddress") as string) || null;

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
    const isPro = await hasActivePayment(billing, session);
    if (!isPro) {
        enableGoogle = false; // Force disable if not pro
        aiProvider = null; // Force disable AI if not pro
        aiApiKey = null;
    }

    const settings = await prisma.settings.update({
        where: { shop },
        data: {
            autoPublish,
            publishMode,
            emailAlerts,
            themeColor,
            widgetBgColor,
            starColor,
            borderRadius,
            aiProvider,
            aiApiKey,
            enableFlow,
            enableKlaviyo,
            klaviyoApiKey,
            enableGoogle,
            reviewRequestDelay,
            physicalAddress,
        } as any,
    });

    return json({ success: true, settings });
};

export default function SettingsPage() {
    const { settings, isPro, subscription } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const navigate = useNavigate();

    // Optimistic UI state
    const [publishMode, setPublishMode] = useState((settings as any).publishMode || (settings.autoPublish ? "five_star" : "none"));
    const [emailAlerts, setEmailAlerts] = useState(settings.emailAlerts);
    const [themeColor, setThemeColor] = useState(settings.themeColor);
    const [resetModalActive, setResetModalActive] = useState(false);
    const [billingModalActive, setBillingModalActive] = useState(false);
    const [reviewRequestDelay, setReviewRequestDelay] = useState(settings.reviewRequestDelay || 3);
    const [widgetBgColor, setWidgetBgColor] = useState((settings as any).widgetBgColor || "#ffffff");
    const [starColor, setStarColor] = useState((settings as any).starColor || "#fbbf24");
    const [borderRadius, setBorderRadius] = useState((settings as any).borderRadius || "8px");
    const [physicalAddress, setPhysicalAddress] = useState((settings as any).physicalAddress || "");

    const [isDirty, setIsDirty] = useState(false);

    // Watch for changes to trigger Save Bar
    useEffect(() => {
        setIsDirty(true);
    }, [publishMode, emailAlerts, themeColor, widgetBgColor, starColor, borderRadius, reviewRequestDelay]);

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
                publishMode,
                emailAlerts: String(emailAlerts),
                themeColor,
                widgetBgColor,
                starColor,
                borderRadius,
                aiProvider,
                aiApiKey,
                enableFlow: String(flowEnabled),
                enableKlaviyo: String(klaviyoEnabled),
                klaviyoApiKey: klaviyoKey,
                enableGoogle: String(googleShoppingEnabled),
                reviewRequestDelay: String(reviewRequestDelay),
                physicalAddress,
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
            primaryAction={isDirty ? { content: 'Save settings', onAction: handleSave } : undefined}
            fullWidth
        >
            <BackButton />
            <style>{`
                .stat-card {
                    background: white;
                    padding: 1.5rem;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid #e2e8f0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .stat-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 40px -8px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.05) !important;
                    border-color: #6366f1;
                }
                .stat-value { font-size: 2.5rem; font-weight: 800; color: #0f172a; line-height: 1; margin: 0.5rem 0; }
                .stat-label { font-size: 0.875rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
                .Polaris-Layout__Section {
                    max-width: none !important;
                }
            `}</style>

            <div style={{ marginBottom: '24px' }}>
                <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
                    <div className="stat-card">
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div className="stat-label">SYSTEM HEALTH</div>
                                <Badge tone={isPro ? "success" : "info"}>{isPro ? "Pro Optimized" : "Standard"}</Badge>
                            </div>
                            <div className="stat-value">Optimal</div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '8px' }}>All core settings are configured.</p>
                        </div>
                        <div style={{ marginTop: '16px', height: '4px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: '100%', height: '100%', background: '#10b981' }}></div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div className="stat-label">AI ENGINE</div>
                                <Badge tone={aiTestSuccess ? "success" : "attention"}>{aiTestSuccess ? "Connected" : "Standby"}</Badge>
                            </div>
                            <div className="stat-value">{settings.aiProvider ? settings.aiProvider.toUpperCase() : "Inactive"}</div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '8px' }}>Auto-replies and sentiment analysis.</p>
                        </div>
                        <div style={{ marginTop: '16px', height: '4px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: settings.aiProvider && settings.aiApiKey ? '100%' : '15%', height: '100%', background: settings.aiProvider ? '#6366f1' : '#f59e0b' }}></div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div className="stat-label">DATA CAPACITY</div>
                                <Badge tone={isPro ? "info" : "critical"}>{isPro ? "Unlimited" : "Capped"}</Badge>
                            </div>
                            <div className="stat-value">{isPro ? "∞" : "50"}</div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '8px' }}>{isPro ? "Unlimited review storage." : "Upgrade to prevent data loss."}</p>
                        </div>
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
                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <Text as="p" variant="bodyMd" tone="subdued">Customize your review widget to match your store's look & feel.</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Theme Color</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Used for primary text and buttons.</p>
                                        </div>
                                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px', width: '220px' }}>
                                            <div style={{ flex: 1 }}><TextField labelHidden label="Theme Color" value={themeColor} onChange={setThemeColor} autoComplete="off" /></div>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: themeColor, border: '1px solid #e2e8f0', overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                                                <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} style={{ position: 'absolute', top: '-10px', left: '-10px', width: '60px', height: '60px', border: 'none', cursor: 'pointer', opacity: 0 }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Widget Background</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Background color of the review displays.</p>
                                        </div>
                                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px', width: '220px' }}>
                                            <div style={{ flex: 1 }}><TextField labelHidden label="Widget Background" value={widgetBgColor} onChange={setWidgetBgColor} autoComplete="off" /></div>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: widgetBgColor, border: '1px solid #e2e8f0', overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                                                <input type="color" value={widgetBgColor} onChange={(e) => setWidgetBgColor(e.target.value)} style={{ position: 'absolute', top: '-10px', left: '-10px', width: '60px', height: '60px', border: 'none', cursor: 'pointer', opacity: 0 }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Star Rating Color</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>The fill color for rating stars.</p>
                                        </div>
                                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px', width: '220px' }}>
                                            <div style={{ flex: 1 }}><TextField labelHidden label="Star Rating Color" value={starColor} onChange={setStarColor} autoComplete="off" /></div>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: starColor, border: '1px solid #e2e8f0', overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                                                <input type="color" value={starColor} onChange={(e) => setStarColor(e.target.value)} style={{ position: 'absolute', top: '-10px', left: '-10px', width: '60px', height: '60px', border: 'none', cursor: 'pointer', opacity: 0 }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Corner Style</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Adjust the roundness of widget edges.</p>
                                        </div>
                                        <div style={{ flexShrink: 0, width: '220px' }}>
                                            <Select labelHidden label="Corner Style" options={[{ label: 'Sharp (0px)', value: '0px' }, { label: 'Rounded (8px)', value: '8px' }, { label: 'Pill (16px)', value: '16px' }]} value={borderRadius} onChange={setBorderRadius} />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'automation' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Automation & Timing</Text>
                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Publishing & Alerts</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Set it and forget it. Let the app handle the routine work.</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Review Publishing Mode</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>
                                                {publishMode === 'none' && '✋ All new reviews go to pending — approve each one manually in War Room.'}
                                                {publishMode === 'five_star' && '⭐ Only 5-star reviews auto-approve. Lower ratings go to pending.'}
                                                {publishMode === 'all' && '🚀 All new reviews are instantly live on your storefront.'}
                                            </p>
                                        </div>
                                        <div style={{ flexShrink: 0, width: '240px' }}>
                                            <Select
                                                labelHidden
                                                label="Publishing Mode"
                                                value={publishMode}
                                                onChange={setPublishMode}
                                                options={[
                                                    { label: '✋ Manual Approval', value: 'none' },
                                                    { label: '⭐ Auto-publish 5-star only', value: 'five_star' },
                                                    { label: '🚀 Auto-publish all reviews', value: 'all' },
                                                ]}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Email Alerts</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Get immediate notifications for negative 1-2 star ratings.</p>
                                        </div>
                                        <div style={{ flexShrink: 0 }}>
                                            <Checkbox labelHidden label="Email Alerts" checked={emailAlerts} onChange={setEmailAlerts} />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Email Timing</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">When should we ask for a review?</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Send Request After Delivery (Days)</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Recommended: 3-5 days after the order is delivered.</p>
                                        </div>
                                        <div style={{ flexShrink: 0, width: '120px' }}>
                                            <TextField labelHidden label="Days" type="number" value={String(reviewRequestDelay)} onChange={(val) => setReviewRequestDelay(parseInt(val) || 3)} autoComplete="off" suffix="days" min={1} max={30} align="right" />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Text as="h3" variant="headingMd" fontWeight="bold">Business Address</Text>
                                        {!physicalAddress && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' }}>⚠️ REQUIRED FOR CAN-SPAM</span>}
                                    </div>
                                    <Text as="p" variant="bodyMd" tone="subdued">Your business mailing address. Displayed in every email footer as required by CAN-SPAM law.</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <TextField
                                        label="Mailing Address"
                                        labelHidden
                                        value={physicalAddress}
                                        onChange={setPhysicalAddress}
                                        autoComplete="off"
                                        placeholder="e.g. 123 Main St, Suite 100, New York, NY 10001, USA"
                                        helpText="Required by US CAN-SPAM Act. Will appear in the footer of all review request emails."
                                    />
                                </div>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'ecosystem' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Integrations & AI</Text>
                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Ecosystem Sync</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Connect Empire to your favorite tools.</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Shopify Flow</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Trigger workflows on negative reviews.</p>
                                        </div>
                                        <div style={{ flexShrink: 0 }}>
                                            <Checkbox labelHidden label="Shopify Flow" checked={flowEnabled} onChange={setFlowEnabled} />
                                        </div>
                                    </div>
                                    {/* Klaviyo integration removed temporarily (Phantom Feature) */}
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Google Shopping XML</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 12px' }}>Generate live product review feed for ads.</p>
                                            {googleShoppingEnabled && isPro && (
                                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #e2e8f0' }}>
                                                    <strong style={{ display: 'block', marginBottom: '4px' }}>Feed URL:</strong>
                                                    <div style={{ wordBreak: 'break-all', color: '#6366f1' }}>{feedUrl}</div>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {!isPro && <Button size="micro" onClick={handleUpgrade}>Unlock Pro</Button>}
                                            <Checkbox labelHidden label="Google Shopping XML" checked={googleShoppingEnabled} onChange={setGoogleShoppingEnabled} disabled={!isPro} />
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <Text as="h3" variant="headingMd" fontWeight="bold">AI Engine</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Power your store with ChatGPT, Claude, Groq, or DeepSeek.</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" fontWeight="medium">Autonomous AI Capabilities</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 12px' }}>Enable automated replies and sentiment tracking.</p>
                                            {isPro && (
                                                <BlockStack gap="300">
                                                    <Select labelHidden label="AI Provider" options={[{ label: 'Select a provider...', value: '' }, { label: 'Groq (100% Free)', value: 'groq' }, { label: 'OpenAI (GPT-4o Mini)', value: 'openai' }, { label: 'Google Gemini', value: 'gemini' }, { label: 'Anthropic Claude', value: 'claude' }, { label: 'DeepSeek', value: 'deepseek' }, { label: 'Ollama / Custom API', value: 'ollama' }]} value={aiProvider} onChange={setAiProvider} helpText={aiProvider === 'ollama' ? 'Requires Ngrok/Cloudflare Tunnel to connect Vercel to your local machine.' : 'Choose the AI model you prefer.'} />
                                                    {aiProvider && (
                                                        <TextField labelHidden label={aiProvider === 'ollama' ? "Model Name / Remote URL / API Key" : "Secret API Key"} value={aiApiKey} onChange={setAiApiKey} autoComplete="off" type={aiProvider === 'ollama' ? "text" : "password"} placeholder={aiProvider === 'ollama' ? "API Details" : "Secret Key"} helpText={aiProvider === 'openai' ? 'Get yours at platform.openai.com' : aiProvider === 'gemini' ? 'Get yours at aistudio.google.com' : aiProvider === 'claude' ? 'Get yours at console.anthropic.com' : aiProvider === 'deepseek' ? 'Get yours at platform.deepseek.com' : aiProvider === 'ollama' ? 'Format: URL|Model|API_KEY (e.g. https://ollama.com|gpt-oss:120b|sk-123). URL and Key are optional.' : ''} />
                                                    )}
                                                    {aiProvider && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <Button onClick={() => { setAiTestLoading(true); setAiTestResult(null); fetcher.submit({ intent: 'test_ai', aiProvider, aiApiKey }, { method: 'post' }); setTimeout(() => { setAiTestLoading(false); const data = fetcher.data as any; if (data?.aiTestResult) { setAiTestResult(data.aiTestResult); setAiTestSuccess(data.success); } else { setAiTestResult('Test sent — check result after save.'); setAiTestSuccess(true); } }, 4000); }} loading={aiTestLoading} disabled={aiTestLoading || !aiApiKey} size="micro">Test Connection</Button>
                                                            {aiTestResult && <div style={{ marginTop: '0px' }}><Badge tone={aiTestSuccess ? 'success' : 'critical'}>{aiTestResult}</Badge></div>}
                                                        </div>
                                                    )}
                                                </BlockStack>
                                            )}
                                        </div>
                                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {!isPro && <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>}
                                            <Checkbox labelHidden label="AI Features" checked={isPro && !!aiProvider} onChange={() => { }} disabled />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'billing' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Plan & Billing</Text>
                            <Card padding="0">
                                <div style={{ padding: '20px 20px 0' }}>
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Subscription</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Manage your Empire Reviews account limits.</Text>
                                </div>
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', borderTop: '1px solid #f1f5f9' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Text as="h3" variant="headingSm" fontWeight="medium">{isPro ? "Empire Pro" : "Starter Plan"}</Text>
                                                <Badge tone={isPro ? "success" : "info"}>{isPro ? "PRO" : "FREE"}</Badge>
                                            </div>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>
                                                {isPro ? "Unlimited reviews, autonomous AI, and Google Shopping feed." : "Basic features. Capped at 50 review storage."}
                                            </p>
                                        </div>
                                        <div style={{ flexShrink: 0 }}>
                                            {isPro ? (
                                                <Button onClick={() => setBillingModalActive(true)}>Manage Plan</Button>
                                            ) : (
                                                <Button variant="primary" onClick={handleUpgrade}>Upgrade Now</Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'danger' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Danger Zone</Text>
                            <Card background="bg-surface-critical" padding="0">
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <Text as="h3" variant="headingSm" tone="critical" fontWeight="bold">Delete All Data</Text>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Permanently wipe all your reviews, replies, and configuration. Cannot be reversed.</p>
                                        </div>
                                        <div style={{ flexShrink: 0 }}>
                                            <Button tone="critical" variant="primary" onClick={() => setResetModalActive(true)}>Wipe Application</Button>
                                        </div>
                                    </div>
                                </div>
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
