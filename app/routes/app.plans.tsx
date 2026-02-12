import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
    Page,
    Badge,
    Box,
    InlineStack,
    BlockStack,
    Text,
    Grid,
    Card,
    Divider,
    Button,
    Modal,
    TextField
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { hasActivePayment, requirePayment } from "../billing.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const isPro = await hasActivePayment(request);

    // Sync DB
    const planName = isPro ? "EMPIRE_PRO" : "FREE";
    // @ts-ignore
    await prisma.settings.update({
        where: { shop: session.shop },
        // @ts-ignore
        data: { plan: planName }
    });

    return json({ isPro });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "referral") {
        const code = formData.get("code") as string;
        if (code === "saundryam@1121") {
            await prisma.settings.update({
                where: { shop: session.shop },
                data: { plan: "EMPIRE_PRO" }
            });
            return json({ success: true, message: "VIP Access Granted: Empire Pro Unlocked 💎" });
        }
        return json({ success: false, message: "Invalid access code." });
    }

    return await requirePayment(request);
};

export default function PlansPage() {
    const { isPro } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();

    const handleUpgrade = () => {
        fetcher.submit({}, { method: "POST" });
    };

    // Referral State
    const [referralOpen, setReferralOpen] = useState(false);
    const [referralCode, setReferralCode] = useState("");

    const handleReferralSubmit = () => {
        fetcher.submit({ intent: "referral", code: referralCode }, { method: "POST" });
        setReferralOpen(false);
        setReferralCode("");
    };

    useEffect(() => {
        const data = fetcher.data as any;
        if (data && data.message) {
            shopify.toast.show(data.message);
        }
    }, [fetcher.data]);

    return (
        <Page fullWidth>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;600;800&display=swap');



                .zenith-vault {
                    font-family: 'Inter', sans-serif;
                    background: #0f172a;
                    color: #f1f5f9;
                    min-height: 100vh;
                    display: grid;
                    grid-template-columns: 42% 58%;
                    position: relative;
                    overflow: hidden;
                }

                /* Animated background beam */
                .zenith-vault::after {
                    content: "";
                    position: absolute;
                    top: -20%;
                    left: 20%;
                    width: 60vw;
                    height: 120vh;
                    background: radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%);
                    transform: skewX(-20deg);
                    pointer-events: none;
                    z-index: 1;
                }

                /* LEFT PANEL: The Pitch & Specs */
                .mastery-deck {
                    padding: 4rem 5rem;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    border-right: 1px solid rgba(255, 255, 255, 0.05);
                    position: relative;
                    z-index: 10;
                    background: rgba(15, 23, 42, 0.4);
                }

                .mastery-title {
                    font-family: 'Outfit', sans-serif;
                    font-size: 3.5rem;
                    font-weight: 800;
                    letter-spacing: -0.04em;
                    line-height: 1;
                    margin-bottom: 1.5rem;
                    background: linear-gradient(135deg, #fff 30%, #3b82f6 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .mastery-subtitle {
                    font-size: 1.1rem;
                    color: #94a3b8;
                    font-weight: 300;
                    max-width: 400px;
                    line-height: 1.6;
                    margin-bottom: 3.5rem;
                }

                /* Technical Spec Table */
                .spec-table {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .spec-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                }

                .spec-label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                }

                .spec-val-starter {
                    font-size: 0.9rem;
                    color: #475569;
                    font-weight: 500;
                    text-align: right;
                    width: 80px;
                }

                .spec-val-pro {
                    font-size: 1rem;
                    color: #3b82f6;
                    font-weight: 700;
                    text-align: right;
                    width: 80px;
                }

                /* RIGHT PANEL: The Slabs */
                .zenith-slabs {
                    padding: 4rem;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 2rem;
                    align-content: center;
                    position: relative;
                    z-index: 10;
                }

                .zenith-slab {
                    background: rgba(30, 41, 59, 0.4);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    padding: 2.5rem;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                    height: fit-content;
                }

                .zenith-slab:hover {
                    border-color: rgba(255, 255, 255, 0.15);
                    transform: translateY(-4px);
                    box-shadow: 0 40px 100px -20px rgba(0,0,0,0.5);
                }

                .slab-pro {
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(30, 41, 59, 0.4) 100%);
                }

                .slab-pro:hover {
                    border-color: rgba(59, 130, 246, 0.4);
                    box-shadow: 0 0 40px rgba(59, 130, 246, 0.1);
                }

                .slab-header {
                    margin-bottom: 2rem;
                }

                .slab-name {
                    font-family: 'Outfit', sans-serif;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 0.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .slab-desc {
                    font-size: 0.9rem;
                    color: #64748b;
                }

                .slab-price {
                    font-family: 'Outfit', sans-serif;
                    margin-bottom: 2.5rem;
                }

                .price-val {
                    font-size: 3rem;
                    font-weight: 800;
                    color: #fff;
                    letter-spacing: -0.04em;
                }

                .price-curr {
                    font-size: 0.9rem;
                    color: #475569;
                    margin-left: 0.5rem;
                    font-weight: 500;
                    text-transform: uppercase;
                }

                .trial-badge {
                    display: inline-block;
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: #10b981;
                    background: rgba(16, 185, 129, 0.1);
                    padding: 4px 10px;
                    border-radius: 6px;
                    margin-top: 0.5rem;
                    letter-spacing: 0.05em;
                }

                .slab-features {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    margin-bottom: 3rem;
                }

                .feature-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    font-size: 0.85rem;
                    color: #94a3b8;
                }

                .feature-item.active {
                    color: #cbd5e1;
                }

                .dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #334155;
                }

                .dot.active {
                    background: #3b82f6;
                    box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
                }

                .zenith-btn {
                    width: 100%;
                    padding: 18px;
                    border-radius: 14px;
                    font-size: 0.95rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .btn-starter {
                    background: transparent;
                    color: #64748b;
                }

                .btn-starter:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.03);
                    color: #fff;
                    border-color: rgba(255, 255, 255, 0.2);
                }

                .btn-pro {
                    background: linear-gradient(to right, #2563eb, #3b82f6);
                    color: #fff;
                    border: none;
                    box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
                }

                .btn-pro:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(37, 99, 235, 0.5);
                }

                .btn-pro:active:not(:disabled) {
                    transform: translateY(1px);
                }

                .btn-disabled {
                    opacity: 0.4;
                    cursor: default;
                }

                @media (max-width: 1200px) {
                    .zenith-vault { grid-template-columns: 1fr; }
                    .mastery-deck { padding: 4rem 2rem; border-right: none; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
                    .zenith-slabs { padding: 4rem 2rem; }
                }
            `}</style>

            <div className="zenith-vault">
                <div className="mastery-deck">
                    <h1 className="mastery-title">Unlock The Zenith Of Social Proof.</h1>
                    <p className="mastery-subtitle">
                        Stop asking for reviews. Start building an empire of automated trust and hyper-convert every visitor.
                    </p>

                    <div className="spec-table">
                        <SpecRow label="Review Volume" starter="50" pro="UNLIMITED" isProVal />
                        <SpecRow label="Photo & Video" starter="TEXT" pro="4K MOTION" isProVal />
                        <SpecRow label="AI Intelligence" starter="BASIC" pro="REAL-TIME" isProVal />
                        <SpecRow label="Direct Google Feed" starter="NO" pro="YES" isProVal />
                        <SpecRow label="Klaviyo Dynamics" starter="NO" pro="YES" isProVal />
                        <SpecRow label="Growth Concierge" starter="EMAIL" pro="VIP 24/7" isProVal />
                    </div>

                    <div style={{ marginTop: '4rem', opacity: 0.2 }}>
                        <InlineStack gap="600">
                            <Text as="p" variant="bodyXs" fontWeight="bold">SECURE ENCRYPTION</Text>
                            <Text as="p" variant="bodyXs" fontWeight="bold">NATIVE INTEGRATION</Text>
                        </InlineStack>
                    </div>
                </div>

                <div className="zenith-slabs">
                    {/* STARTER */}
                    <div className="zenith-slab">
                        <div className="slab-header">
                            <div className="slab-name">Starter Plan</div>
                            <div className="slab-desc">Essential tools for emerging brands.</div>
                        </div>

                        <div className="slab-price">
                            <span className="price-val">$0</span>
                            <span className="price-curr">/ mo</span>
                        </div>

                        <div className="slab-features">
                            <FeatureItem text="50 Verified Reviews" />
                            <FeatureItem text="Classic Review Widget" />
                            <FeatureItem text="Manual Import Suite" />
                            <FeatureItem text="Standard Analytics" />
                        </div>

                        <button
                            className={`zenith-btn btn-starter ${isPro ? '' : 'btn-disabled'}`}
                            disabled={!isPro}
                        >
                            {isPro ? "Switch to Starter" : "Current Plan"}
                        </button>
                    </div>

                    {/* PRO */}
                    <div className="zenith-slab slab-pro">
                        <div className="slab-header">
                            <div className="slab-name">
                                Empire Pro ⚡
                                <Badge tone="success">Best Value</Badge>
                            </div>
                            <div className="slab-desc">The high-performance growth engine.</div>
                        </div>

                        <div className="slab-price">
                            <div className="price-val">$9.99<span className="price-curr">/ mo</span></div>
                            <div className="trial-badge">7-DAY FREE TRIAL INCLUDED</div>
                        </div>

                        <div className="slab-features">
                            <FeatureItem text="Unlimited Everything" active />
                            <FeatureItem text="Photo & Video Reviews" active />
                            <FeatureItem text="AI Sentiment Engine" active />
                            <FeatureItem text="Google Shopping Sync" active />
                            <FeatureItem text="Automated Flow Suite" active />
                        </div>

                        <button
                            className={`zenith-btn btn-pro ${isPro ? 'btn-disabled' : ''}`}
                            onClick={handleUpgrade}
                            disabled={isPro}
                        >
                            {isPro ? "Zenith Active" : "Level Up to Pro ⚡"}
                        </button>

                        <div style={{ textAlign: "center", marginTop: "1rem" }}>
                            <button
                                onClick={() => setReferralOpen(true)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                <span style={{ fontSize: "0.8rem", textDecoration: "underline", color: "rgba(255,255,255,0.4)" }}>
                                    Have a referral code? Click here
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal
                open={referralOpen}
                onClose={() => setReferralOpen(false)}
                title="VIP Access"
                primaryAction={{
                    content: 'Redeem Code',
                    onAction: handleReferralSubmit,
                    loading: fetcher.state === "submitting"
                }}
                secondaryActions={[{ content: 'Cancel', onAction: () => setReferralOpen(false) }]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <p>Enter your referral code to unlock exclusive Pro features.</p>
                        <TextField
                            label="Referral Code"
                            value={referralCode}
                            onChange={setReferralCode}
                            autoComplete="off"
                        />
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page >
    );
}

function SpecRow({ label, starter, pro, isProVal }: { label: string, starter: string, pro: string, isProVal?: boolean }) {
    return (
        <div className="spec-row">
            <span className="spec-label">{label}</span>
            <div style={{ display: 'flex', gap: '2rem' }}>
                <span className="spec-val-starter">{starter}</span>
                <span className={isProVal ? "spec-val-pro" : "spec-val-starter"}>{pro}</span>
            </div>
        </div>
    );
}

function FeatureItem({ text, active }: { text: string, active?: boolean }) {
    return (
        <div className={`feature-item ${active ? 'active' : ''}`}>
            <div className={`dot ${active ? 'active' : ''}`}></div>
            <span>{text}</span>
        </div>
    );
}
