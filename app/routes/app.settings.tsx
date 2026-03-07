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
    Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { hasActivePayment, requirePayment, getPlanDetails, MONTHLY_PLAN } from "../billing.server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { testAIConnection, type AIProvider } from "../services/ai.server";
import { ArrowLeftIcon, SettingsIcon, ThemeIcon, WandIcon, PlayCircleIcon, ClockIcon, AlertTriangleIcon, LinkIcon } from "@shopify/polaris-icons";

const GROWTH_TIPS = [
    "Stores with photo reviews see a 26% higher conversion rate. 📸",
    "Automate requests to send 3 days after delivery for 2x replies. 🕒",
    "Replying to negative reviews within 24h prevents customer churn. 🛡️",
    "Displaying 'Verified Buyer' badges increases trust by 40%. 🥇",
    "Incentivize photo reviews with a small discount for future orders. 🎁",
    "Use AI Sentiment to spot trends before they become problems. 🧠",
    "High-rating reviews with text build better SEO than stars alone. 🔍",
    "Importing your existing CSV reviews is the fastest way to start. 🚢",
    "A 4.5 star average feels more 'real' to buyers than a perfect 5. ⭐",
    "Email campaigns with scarcity templates get 30% more clicks. 🔥"
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

    return (
        <div className="empire-settings">
            <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            
            .empire-settings {
                 --empire-primary: #0f172a;
            }
            .Polaris-Page *, .Polaris-Text--root {
                font-family: 'Inter', system-ui, sans-serif !important;
            }
            /* Make headings bold and attractive */
            h1, h2, h3, .Polaris-Text--headingMd, .Polaris-Text--headingLg {
                font-weight: 800 !important;
                letter-spacing: -0.035em !important;
                color: #0f172a !important;
            }
            .top-row {
                display: flex;
                gap: 1rem;
                margin-bottom: 0;
            }
            .top-row > * {
                flex: 1;
                min-width: 0;
            }
            .settings-hero {
                background: #0f172a;
                color: white;
                padding: 1.5rem 2rem;
                border-radius: 8px;
            }
            .config-card {
                background: white;
                padding: 1.5rem;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
                display: flex;
                flex-direction: column;
            }
            .danger-zone {
                background: #fef2f2;
                border: 1px solid #fecaca;
                margin-top: 2rem;
            }
            /* Alignment: stretch columns so cards fill evenly */
            .Polaris-Layout__Section {
                display: flex !important;
                flex-direction: column;
            }
            .Polaris-Layout__Section > .Polaris-BlockStack {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .Polaris-Layout__Section > .Polaris-BlockStack > .config-card:last-child {
                flex: 1;
            }
            .tip-fade {
                transition: opacity 0.5s ease-in-out;
            }
            .tip-text {
                font-size: 0.95rem !important;
                line-height: 1.4 !important;
                color: #1e293b;
            }
            .save-bar {
                position: fixed;
                bottom: 2rem;
                left: 50%;
                transform: translateX(-50%);
                background: #0f172a;
                color: white;
                padding: 12px 24px;
                border-radius: 50px;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
                z-index: 999;
                transition: opacity 0.3s, transform 0.3s;
            }
        `}</style>
            <Page fullWidth>
                {isDirty && (
                    <div className="save-bar">
                        <p style={{ fontWeight: 500, color: 'white', margin: 0, fontSize: '0.95rem' }}>Unsaved changes</p>
                        <Button variant="primary" onClick={handleSave} size="large">Save</Button>
                    </div>
                )}
                <BlockStack gap="400">
                    {/* TOP ROW: Hero + Grow Your Empire side by side */}
                    <div className="top-row">
                        <div className="settings-hero">
                            <BlockStack gap="300">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Button icon={ArrowLeftIcon} onClick={() => navigate("/app")} variant="plain" />
                                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Global Configuration ⚙️</h1>
                                    </div>
                                    <Badge tone={isPro ? "success" : "info"}>{isPro ? "EMPIRE PRO" : "STARTER PLAN"}</Badge>
                                </div>
                                <p style={{ fontSize: '0.95rem', opacity: 0.9 }}>
                                    Control how Empire Reviews behaves on your storefront and manages your data.
                                </p>
                            </BlockStack>
                        </div>

                        <div className="config-card">
                            <BlockStack gap="300">
                                <InlineStack align="space-between">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Button icon={PlayCircleIcon} variant="plain" />
                                        <Text as="h3" variant="headingMd">Grow Your Empire</Text>
                                    </div>
                                    <Button variant="plain" onClick={() => navigate("/app/campaigns")}>Optimize Campaigns →</Button>
                                </InlineStack>
                                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                    Real-time conversion hacks & psychological tips — auto-rotates every 5 seconds.
                                </p>
                                <div style={{
                                    padding: '1rem',
                                    background: 'white',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    minHeight: '50px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
                                    flex: 1
                                }}>
                                    <div className="tip-fade" style={{ opacity: fade ? 1 : 0 }}>
                                        <div className="tip-text">
                                            <strong>💡 {GROWTH_TIPS[tipIndex]}</strong>
                                        </div>
                                    </div>
                                </div>
                            </BlockStack>
                        </div>
                    </div>

                    <Layout>
                        {/* LEFT COL */}
                        <Layout.Section variant="oneHalf">
                            <BlockStack gap="400">
                                {/* BRAND IDENTITY — EXPANDED COLOR PICKERS */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Button icon={ThemeIcon} variant="plain" />
                                            <Text as="h3" variant="headingMd">Brand Identity</Text>
                                        </div>
                                        <p style={{ color: '#64748b' }}>Customize your review widget to match your store's look & feel.</p>
                                        <Divider />

                                        {/* Primary Color */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <div style={{ width: 24, height: 24, background: themeColor, borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                                                <Text as="p" variant="bodyMd" fontWeight="semibold">Theme Color</Text>
                                            </div>
                                            <TextField
                                                label=""
                                                value={themeColor}
                                                onChange={setThemeColor}
                                                autoComplete="off"
                                                helpText="Used for text, borders, stars, and buttons."
                                                connectedRight={
                                                    <input
                                                        type="color"
                                                        value={themeColor}
                                                        onChange={(e) => setThemeColor(e.target.value)}
                                                        style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }}
                                                    />
                                                }
                                            />
                                        </div>

                                        {/* Widget Background */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <div style={{ width: 24, height: 24, background: widgetBgColor, borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                                                <Text as="p" variant="bodyMd" fontWeight="semibold">Widget Background</Text>
                                            </div>
                                            <TextField
                                                label=""
                                                value={widgetBgColor}
                                                onChange={setWidgetBgColor}
                                                autoComplete="off"
                                                connectedRight={
                                                    <input
                                                        type="color"
                                                        value={widgetBgColor}
                                                        onChange={(e) => setWidgetBgColor(e.target.value)}
                                                        style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }}
                                                    />
                                                }
                                            />
                                        </div>

                                        {/* Star Rating Color */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <div style={{ width: 24, height: 24, background: starColor, borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                                                <Text as="p" variant="bodyMd" fontWeight="semibold">Star Rating Color</Text>
                                            </div>
                                            <TextField
                                                label=""
                                                value={starColor}
                                                onChange={setStarColor}
                                                autoComplete="off"
                                                connectedRight={
                                                    <input
                                                        type="color"
                                                        value={starColor}
                                                        onChange={(e) => setStarColor(e.target.value)}
                                                        style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }}
                                                    />
                                                }
                                            />
                                        </div>

                                        {/* Border Radius */}
                                        <Select
                                            label={<Text as="p" variant="bodyMd" fontWeight="semibold">Corner Style</Text>}
                                            options={[
                                                { label: 'Sharp (0px)', value: '0px' },
                                                { label: 'Rounded (8px)', value: '8px' },
                                                { label: 'Pill (16px)', value: '16px' }
                                            ]}
                                            value={borderRadius}
                                            onChange={setBorderRadius}
                                        />

                                    </BlockStack>
                                </div>

                                {/* AUTOMATION CARD */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Button icon={SettingsIcon} variant="plain" />
                                            <Text as="h3" variant="headingMd">Automation Rules</Text>
                                        </div>
                                        <p style={{ color: '#64748b' }}>Set it and forget it. Let the app handle the routine work.</p>
                                        <Divider />
                                        <Checkbox
                                            label="Auto-publish 5-star reviews"
                                            helpText="Skip moderation for top-rated reviews."
                                            checked={autoPublish}
                                            onChange={setAutoPublish}
                                        />
                                        <Checkbox
                                            label="Email Alerts for Negative Reviews"
                                            helpText="Get immediate notifications for 1-2 star ratings."
                                            checked={emailAlerts}
                                            onChange={setEmailAlerts}
                                        />
                                    </BlockStack>
                                </div>

                                {/* EMAIL TIMING */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Button icon={ClockIcon} variant="plain" />
                                            <Text as="h3" variant="headingMd">Email Timing</Text>
                                        </div>
                                        <p style={{ color: '#64748b' }}>When should we ask for a review?</p>
                                        <Divider />
                                        <TextField
                                            label="Send Request After (Days)"
                                            type="number"
                                            value={String(reviewRequestDelay)}
                                            onChange={(val) => setReviewRequestDelay(parseInt(val) || 3)}
                                            autoComplete="off"
                                            helpText="Recommended: 3-5 days after order."
                                            suffix="days"
                                            min={1}
                                            max={30}
                                        />
                                    </BlockStack>
                                </div>
                            </BlockStack>
                        </Layout.Section>

                        {/* RIGHT COL */}
                        <Layout.Section variant="oneHalf">
                            <BlockStack gap="400">
                                {/* BILLING & PLAN */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <InlineStack align="space-between">
                                            <Text as="h3" variant="headingMd">💳 Plan & Billing</Text>
                                            <Badge tone={isPro ? "success" : "attention"}>{isPro ? "PRO" : "FREE"}</Badge>
                                        </InlineStack>
                                        <p style={{ color: '#64748b' }}>
                                            {isPro
                                                ? "You are on the Empire Pro plan. Enjoy unlimited reviews and AI features."
                                                : "You are currently on the Starter plan. Limit: 50 reviews."}
                                        </p>
                                        <Divider />
                                        {isPro ? (
                                            <Button fullWidth onClick={() => setBillingModalActive(true)}>You are an Empire Pro</Button>
                                        ) : (
                                            <button
                                                onClick={handleUpgrade}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: 'linear-gradient(to right, #a855f7, #ec4899)',
                                                    color: 'white',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Upgrade to Empire Pro
                                            </button>
                                        )}
                                    </BlockStack>
                                </div>

                                {/* INTEGRATIONS */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Button icon={LinkIcon} variant="plain" />
                                            <Text as="h3" variant="headingMd">Ecosystem Integrations</Text>
                                        </div>
                                        <p style={{ color: '#64748b' }}>Connect Empire to your favorite tools.</p>
                                        <Divider />
                                        <Checkbox
                                            label="Shopify Flow"
                                            helpText="Trigger workflows on negative reviews."
                                            checked={flowEnabled}
                                            onChange={setFlowEnabled}
                                        />
                                        <Box>
                                            <Checkbox
                                                label="Klaviyo Sync"
                                                helpText="Push reviewers to 'Safe Lists'."
                                                checked={klaviyoEnabled}
                                                onChange={setKlaviyoEnabled}
                                            />
                                            {klaviyoEnabled && (
                                                <div style={{ marginTop: '10px', paddingLeft: '20px' }}>
                                                    <TextField
                                                        label="Private API Key"
                                                        value={klaviyoKey}
                                                        onChange={setKlaviyoKey}
                                                        autoComplete="off"
                                                        type="password"
                                                    />
                                                </div>
                                            )}
                                        </Box>
                                        <Box>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <Checkbox
                                                    label="Google Shopping XML"
                                                    helpText="Generate product feed with stars."
                                                    checked={googleShoppingEnabled}
                                                    onChange={setGoogleShoppingEnabled}
                                                    disabled={!isPro}
                                                />
                                                {!isPro && (
                                                    <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>
                                                )}
                                            </div>

                                            {googleShoppingEnabled && isPro && (
                                                <div style={{ marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                                    <strong>Feed URL:</strong>
                                                    <div style={{ wordBreak: 'break-all', color: '#6366f1' }}>{feedUrl}</div>
                                                </div>
                                            )}
                                        </Box>
                                    </BlockStack>
                                </div>

                                {/* AI CONFIGURATION CARD */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Button icon={WandIcon} variant="plain" />
                                            <Text as="h3" variant="headingMd">AI Configuration</Text>
                                        </div>
                                        <p style={{ color: '#64748b' }}>Connect your API keys to enable auto-replies...</p>
                                        <Divider />

                                        {!isPro ? (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <div style={{ filter: 'opacity(0.6)', pointerEvents: 'none' }}>
                                                    <Checkbox
                                                        label="Custom AI Integration"
                                                        helpText="Power your store with ChatGPT, Claude, Groq, or DeepSeek."
                                                        checked={false}
                                                        onChange={() => { }}
                                                        disabled={true}
                                                    />
                                                </div>
                                                <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>
                                            </div>
                                        ) : (
                                            <>
                                                <Select
                                                    label="AI Provider"
                                                    options={[
                                                        { label: 'Select a provider...', value: '' },
                                                        { label: '⚡ Groq (100% Free)', value: 'groq' },
                                                        { label: '🟢 OpenAI (GPT-4o Mini)', value: 'openai' },
                                                        { label: '🔵 Google Gemini', value: 'gemini' },
                                                        { label: '🟠 Anthropic Claude', value: 'claude' },
                                                        { label: '🟣 DeepSeek', value: 'deepseek' },
                                                        { label: '⚫ Ollama / Custom API', value: 'ollama' },
                                                    ]}
                                                    value={aiProvider}
                                                    onChange={setAiProvider}
                                                    helpText={aiProvider === 'ollama' ? 'Requires Ngrok/Cloudflare Tunnel to connect Vercel to your local machine.' : 'Choose the AI model you prefer.'}
                                                />

                                                {aiProvider && (
                                                    <TextField
                                                        label={aiProvider === 'ollama' ? "Model Name / Remote URL / API Key" : "API Key"}
                                                        value={aiApiKey}
                                                        onChange={setAiApiKey}
                                                        autoComplete="off"
                                                        type={aiProvider === 'ollama' ? "text" : "password"}
                                                        placeholder={aiProvider === 'ollama' ? "e.g., https://ollama.com|gpt-oss:120b|sk-key123" : ""}
                                                        helpText={
                                                            aiProvider === 'openai' ? 'Get yours at platform.openai.com/api-keys' :
                                                                aiProvider === 'gemini' ? 'Get yours at aistudio.google.com/apikey' :
                                                                    aiProvider === 'claude' ? 'Get yours at console.anthropic.com/settings/keys' :
                                                                        aiProvider === 'deepseek' ? 'Get yours at platform.deepseek.com/api_keys' :
                                                                            aiProvider === 'ollama' ? 'Format: URL|Model|API_KEY (e.g. https://ollama.com|gpt-oss:120b|sk-123). URL and Key are optional.' : ''
                                                        }
                                                    />
                                                )}

                                                {aiProvider && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <Button
                                                            onClick={() => {
                                                                setAiTestLoading(true);
                                                                setAiTestResult(null);
                                                                fetcher.submit(
                                                                    { intent: 'test_ai', aiProvider, aiApiKey },
                                                                    { method: 'post' }
                                                                );
                                                                setTimeout(() => {
                                                                    setAiTestLoading(false);
                                                                    const data = fetcher.data as any;
                                                                    if (data?.aiTestResult) {
                                                                        setAiTestResult(data.aiTestResult);
                                                                        setAiTestSuccess(data.success);
                                                                    } else {
                                                                        setAiTestResult('Test sent — check result after save.');
                                                                        setAiTestSuccess(true);
                                                                    }
                                                                }, 4000);
                                                            }}
                                                            loading={aiTestLoading}
                                                            disabled={aiTestLoading || !aiApiKey}
                                                            variant="primary"
                                                            size="micro"
                                                        >
                                                            ⚡ Test Connection
                                                        </Button>
                                                        {aiTestResult && (
                                                            <div style={{
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                color: aiTestSuccess ? '#16a34a' : '#dc2626',
                                                                background: aiTestSuccess ? '#f0fdf4' : '#fef2f2',
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                            }}>
                                                                {aiTestSuccess ? '✅' : '❌'} {aiTestResult}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </BlockStack>
                                </div>

                            </BlockStack>
                        </Layout.Section>
                    </Layout>

                    {/* DANGER ZONE (MOVED TO BOTTOM FULL WIDTH) */}
                    <div className="danger-zone config-card">
                        <BlockStack gap="400">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Button icon={AlertTriangleIcon} variant="plain" tone="critical" />
                                <Text as="h3" variant="headingMd" tone="critical">Danger Zone</Text>
                            </div>
                            <p style={{ color: '#be123c' }}>Irreversible actions.</p>
                            <div style={{ alignSelf: 'flex-start' }}>
                                <Button
                                    tone="critical"
                                    onClick={() => setResetModalActive(true)}
                                >
                                    Reset All App Data
                                </Button>
                            </div>
                        </BlockStack>
                    </div>

                </BlockStack >
            </Page >

            <Modal
                open={resetModalActive}
                onClose={() => setResetModalActive(false)}
                title="Are you sure?"
                primaryAction={{
                    content: "Delete Everything",
                    onAction: handleReset,
                    destructive: true,
                }}
                secondaryActions={[{ content: "Cancel", onAction: () => setResetModalActive(false) }]}
            >
                <Modal.Section>
                    <p>This will delete ALL reviews and settings. This cannot be undone.</p>
                </Modal.Section>
            </Modal>

            {/* BILLING DETAILS MODAL */}
            <Modal
                open={billingModalActive}
                onClose={() => setBillingModalActive(false)}
                title="Your Empire Membership 💎"
                primaryAction={{
                    content: "Extend / Renew Plan",
                    onAction: handleUpgrade,
                }}
                secondaryActions={[{ content: "Close", onAction: () => setBillingModalActive(false) }]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                            <h3 style={{ fontWeight: 'bold', color: '#166534', marginBottom: '8px' }}>Active Subscription</h3>
                            <p style={{ fontSize: '0.95rem' }}>You have full access to all Empire Pro features.</p>
                        </div>

                        <BlockStack gap="200">
                            <InlineStack align="space-between">
                                <Text as="p" fontWeight="bold">Plan Name:</Text>
                                <Text as="p">Empire Pro (Monthly)</Text>
                            </InlineStack>

                            {subscription ? (
                                <>
                                    <Divider />
                                    <InlineStack align="space-between">
                                        <Text as="p" fontWeight="medium">Started On:</Text>
                                        <Text as="p" tone="subdued">{new Date(subscription.createdAt).toLocaleDateString()}</Text>
                                    </InlineStack>
                                    <InlineStack align="space-between">
                                        <Text as="p" fontWeight="medium">Renews On:</Text>
                                        <Text as="p" tone="success" fontWeight="bold">
                                            {subscription.currentPeriodEnd
                                                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                                                : "Auto-renewing"}
                                        </Text>
                                    </InlineStack>
                                </>
                            ) : (
                                <>
                                    <Divider />
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '8px' }}>
                                        <Text as="p" tone="subdued" fontWeight="bold">
                                            🌟 VIP / Partner Access
                                        </Text>
                                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                                            You have lifetime access enabled manually (e.g. via Referral).
                                            No billing dates apply.
                                        </p>
                                    </div>
                                </>
                            )}
                        </BlockStack>

                        <div style={{ marginTop: '10px' }}>
                            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                <strong>Note:</strong> Clicking "Extend / Renew" below will switch you to a standard 30-day Shopify billing cycle ($9.99/mo).
                            </p>
                        </div>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </div >
    );
}
