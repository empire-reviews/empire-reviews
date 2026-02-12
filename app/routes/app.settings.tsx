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
    Box,
    InlineStack,
    Divider,
    Modal,
    Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { hasActivePayment, requirePayment, getPlanDetails, MONTHLY_PLAN } from "../billing.server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { ArrowLeftIcon } from "@shopify/polaris-icons";

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
    const { session, billing } = await authenticate.admin(request);
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

    const autoPublish = formData.get("autoPublish") === "true";
    const emailAlerts = formData.get("emailAlerts") === "true";
    const themeColor = formData.get("themeColor") as string;

    // Integrations
    const enableFlow = formData.get("enableFlow") === "true";
    const enableKlaviyo = formData.get("enableKlaviyo") === "true";
    const klaviyoApiKey = formData.get("klaviyoApiKey") as string;
    // Google Feed is PRO feature
    let enableGoogle = formData.get("enableGoogle") === "true";

    // Double check gating on server side
    const isPro = await hasActivePayment(request);
    if (!isPro && enableGoogle) {
        enableGoogle = false; // Force disable if not pro
    }

    const settings = await prisma.settings.update({
        where: { shop },
        data: {
            autoPublish,
            emailAlerts,
            themeColor,
            enableFlow,
            enableKlaviyo,
            klaviyoApiKey,
            enableGoogle
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

    // Integration States
    const [flowEnabled, setFlowEnabled] = useState(settings.enableFlow);
    const [klaviyoEnabled, setKlaviyoEnabled] = useState(settings.enableKlaviyo);
    const [klaviyoKey, setKlaviyoKey] = useState(settings.klaviyoApiKey || "");
    const [googleShoppingEnabled, setGoogleShoppingEnabled] = useState(settings.enableGoogle);

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
                enableFlow: String(flowEnabled),
                enableKlaviyo: String(klaviyoEnabled),
                klaviyoApiKey: klaviyoKey,
                enableGoogle: String(googleShoppingEnabled)
            },
            { method: "post" }
        );
        shopify.toast.show("Settings saved");
    };

    const handleReset = () => {
        fetcher.submit({ intent: "reset" }, { method: "post" });
        setResetModalActive(false);
        shopify.toast.show("App data wiped 🗑️");
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
            .empire-settings {
                 --empire-primary: #0f172a;
                 font-family: 'Inter', sans-serif;
            }
            .settings-hero {
                background: linear-gradient(135deg, #475569 0%, #1e293b 100%);
                color: white;
                padding: 3rem 2rem;
                border-radius: 16px;
                margin-bottom: 2rem;
            }
            .config-card {
                background: white;
                padding: 1.5rem;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                display: flex;
                flex-direction: column;
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }
            .card-3d {
                transform: perspective(1000px) rotateX(2deg);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                border: 1px solid rgba(168, 85, 247, 0.2);
                margin-top: auto; /* Push to bottom if needed */
            }
            .card-3d:hover {
                transform: perspective(1000px) rotateX(0deg) translateY(-5px);
                box-shadow: 0 25px 30px -5px rgba(168, 85, 247, 0.2);
            }
            /* Corrected Alignment logic */
            .Polaris-Layout__Section {
                display: flex !important;
                flex-direction: column;
            }
            .Polaris-Layout__Section > .Polaris-BlockStack {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .tip-fade {
                transition: opacity 0.5s ease-in-out;
            }
            .tip-text {
                font-size: 1rem !important;
                line-height: 1.4 !important;
                color: #1e293b;
            }
        `}</style>
            <Page fullWidth>
                <BlockStack gap="600">
                    <div className="settings-hero">
                        <BlockStack gap="400">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Button icon={ArrowLeftIcon} onClick={() => navigate("/app")} variant="plain" />
                                    <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Global Configuration ⚙️</h1>
                                </div>
                                <Badge tone={isPro ? "success" : "info"}>{isPro ? "EMPIRE PRO 💎" : "STARTER PLAN"}</Badge>
                            </div>
                            <p style={{ fontSize: '1.1rem', opacity: 0.9, maxWidth: '600px' }}>
                                Control how Empire Reviews behaves on your storefront and manages your data.
                            </p>
                            <Box paddingBlockStart="200">
                                <Button onClick={handleSave} size="large">Save All Changes</Button>
                            </Box>
                        </BlockStack>
                    </div>

                    <Layout>
                        {/* LEFT COL */}
                        <Layout.Section variant="oneHalf">
                            <BlockStack gap="400">
                                {/* AUTOMATION CARD */}
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">🤖 Automation Rules</Text>
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

                                {/* NEW: BILLING & PLAN CARD */}
                                <div className="config-card" style={{ borderLeft: '4px solid #10b981' }}>
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
                                            <Button fullWidth onClick={() => setBillingModalActive(true)}>You are an Empire Pro 💎</Button>
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
                                                Upgrade to Empire Pro 👑
                                            </button>
                                        )}
                                    </BlockStack>
                                </div>

                                {/* RE-ALIGNED: EMPIRE GROWTH TIPS (3D Effect) */}
                                <div className="config-card card-3d" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)', display: 'flex', flexDirection: 'column' }}>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">🚀 Grow Your Empire</Text>
                                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                                            Real-time conversion hacks and psychological tips.
                                        </p>
                                        <div style={{
                                            padding: '1.5rem',
                                            background: 'white',
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            minHeight: '80px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)'
                                        }}>
                                            <div className="tip-fade" style={{ opacity: fade ? 1 : 0 }}>
                                                <div className="tip-text">
                                                    <strong>💡 {GROWTH_TIPS[tipIndex]}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 'auto' }}>
                                            <Button variant="plain" onClick={() => navigate("/app/campaigns")} fullWidth>Optimize Campaigns →</Button>
                                        </div>
                                    </BlockStack>
                                </div>
                            </BlockStack>
                        </Layout.Section>

                        {/* RIGHT COL */}
                        <Layout.Section variant="oneHalf">
                            <BlockStack gap="400">
                                <div className="config-card">
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">🎨 Brand Identity</Text>
                                        <p style={{ color: '#64748b' }}>Customize the widget to match your store's theme.</p>
                                        <Divider />
                                        <TextField
                                            label="Accent Color (Hex)"
                                            value={themeColor}
                                            onChange={setThemeColor}
                                            autoComplete="off"
                                            prefix={<div style={{ width: 20, height: 20, background: themeColor, borderRadius: 4, border: '1px solid #ccc' }}></div>}
                                        />
                                    </BlockStack>
                                </div>

                                <div className="config-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">🔌 Ecosystem Integrations</Text>
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
                                                    <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock 💎</Button>
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

                                <div className="config-card" style={{ borderColor: '#fda4af', background: '#fff1f2', marginTop: 'auto' }}>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd" tone="critical">🚨 Danger Zone</Text>
                                        <p style={{ color: '#be123c' }}>Irreversible actions.</p>
                                        <Button
                                            tone="critical"
                                            onClick={() => setResetModalActive(true)}
                                        >
                                            Reset All App Data
                                        </Button>
                                    </BlockStack>
                                </div>
                            </BlockStack>
                        </Layout.Section>
                    </Layout>
                </BlockStack>
            </Page>

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
        </div>
    );
}
