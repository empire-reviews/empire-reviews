import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Badge,
    Grid,
    Box,
    Button,
    InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ArrowLeftIcon, LockIcon } from "@shopify/polaris-icons";
import { hasActivePayment } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const isPro = await hasActivePayment(request);

    // GATE: Business Impact is PRO Only
    if (!isPro) {
        return json({ locked: true, stats: null });
    }

    // Real data logic for PRO users would go here
    const reviews = await prisma.review.findMany();
    const totalReviews = reviews.length;

    return json({ locked: false, stats: { totalReviews } });
};

export default function ImpactPage() {
    const { locked, stats } = useLoaderData<typeof loader>();
    const navigate = useNavigate();

    if (locked) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#040b1a',
                padding: '2rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* IMMERSIVE BLURRED BACKGROUND (Curiosity Gap - ROI) */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.5,
                    filter: 'blur(10px) brightness(1.1)',
                    transform: 'scale(1.1)',
                    pointerEvents: 'none',
                    overflow: 'hidden'
                }}>
                    {/* Revenue Bubbles */}
                    <div style={{ position: 'absolute', top: '15%', left: '10%', width: '120px', height: '120px', background: 'rgba(16, 185, 129, 0.3)', borderRadius: '50%', filter: 'blur(15px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '3rem' }}>$</span></div>
                    <div style={{ position: 'absolute', top: '5%', right: '20%', width: '80px', height: '80px', background: 'rgba(52, 211, 153, 0.3)', borderRadius: '50%', filter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '2rem' }}>$</span></div>
                    <div style={{ position: 'absolute', bottom: '15%', right: '15%', width: '160px', height: '160px', background: 'rgba(5, 150, 105, 0.2)', borderRadius: '50%', filter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '4rem' }}>$</span></div>

                    <div style={{ padding: '60px', display: 'flex', flexDirection: 'column', gap: '80px', height: '100%' }}>
                        <div style={{ display: 'flex', gap: '30px', justifyContent: 'center' }}>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} style={{ width: '150px', height: '100px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '24px', border: '1px solid rgba(16, 185, 129, 0.3)' }}></div>
                            ))}
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '15px', padding: '0 60px' }}>
                            {/* ROI Bar Growth Tease */}
                            {[30, 50, 40, 70, 55, 90, 65, 110, 80, 130, 95, 150].map((h, i) => (
                                <div key={i} style={{
                                    flex: 1,
                                    height: `${h}px`,
                                    background: 'linear-gradient(to top, rgba(16, 185, 129, 0.5), rgba(52, 211, 153, 0.5))',
                                    borderRadius: '12px',
                                    opacity: 0.6 + (i * 0.03)
                                }}></div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '40px', justifyContent: 'space-around' }}>
                            <div style={{ width: '35%', height: '120px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '30px', border: '1px solid rgba(16, 185, 129, 0.2)' }}></div>
                            <div style={{ width: '45%', height: '120px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '30px', border: '1px solid rgba(16, 185, 129, 0.2)' }}></div>
                        </div>
                    </div>
                </div>

                <div style={{
                    background: 'white',
                    borderRadius: '40px',
                    boxShadow: '0 80px 150px -30px rgba(0, 0, 0, 0.7)',
                    width: '100%',
                    maxWidth: '960px', // Horizontal 16:9 focus
                    aspectRatio: '16 / 9',
                    display: 'flex',
                    overflow: 'hidden',
                    position: 'relative',
                    zIndex: 10,
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {/* LEFT: IMPACT VISUAL */}
                    <div style={{
                        flex: 1.2,
                        background: 'linear-gradient(225deg, #064e3b 0%, #020617 100%)',
                        padding: '4rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        position: 'relative'
                    }}>
                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{
                                width: '72px',
                                height: '72px',
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 15px 30px rgba(16, 185, 129, 0.3)'
                            }}>
                                <LockIcon style={{ width: 36, color: 'white' }} />
                            </div>
                        </div>
                        <BlockStack gap="400">
                            <h2 style={{ fontSize: '2.8rem', fontWeight: 900, color: 'white', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                                Business <br /> Impact Analytics 📊
                            </h2>
                            <p style={{ color: '#94a3b8', fontSize: '1.25rem', lineHeight: '1.6', maxWidth: '400px' }}>
                                Unlock the "Secret ROI" of your customer reviews. Discover exactly how much revenue each 5-star review generates.
                            </p>
                        </BlockStack>

                        {/* GLOW EFFECT */}
                        <div style={{ position: 'absolute', top: '-50px', left: '-50px', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                    </div>

                    {/* RIGHT: CONVERSION ACTION */}
                    <div style={{
                        width: '40%',
                        padding: '4rem',
                        background: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        borderLeft: '1px solid #f1f5f9'
                    }}>
                        <BlockStack gap="600">
                            <BlockStack gap="400">
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ color: '#10b981', fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.2))' }}>🎯</div>
                                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Revenue Attribution</span>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ color: '#10b981', fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.2))' }}>💎</div>
                                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>CLV Predictions</span>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ color: '#10b981', fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.2))' }}>📉</div>
                                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Churn Prevention</span>
                                </div>
                            </BlockStack>

                            <BlockStack gap="300">
                                <form action="/app/settings" method="post" style={{ width: '100%' }}>
                                    <input type="hidden" name="intent" value="upgrade" />
                                    <button style={{
                                        background: '#10b981',
                                        color: 'white',
                                        padding: '1.25rem',
                                        width: '100%',
                                        border: 'none',
                                        borderRadius: '20px',
                                        fontSize: '1.2rem',
                                        fontWeight: 900,
                                        cursor: 'pointer',
                                        boxShadow: '0 25px 30px -10px rgba(16, 185, 129, 0.5)',
                                        transition: 'all 0.3s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px'
                                    }}>
                                        Start Growing — $9.99/mo →
                                    </button>
                                </form>
                                <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>
                                    Risk-free • Cancel anytime
                                </div >
                                <button
                                    onClick={() => navigate("/app")}
                                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}
                                >
                                    Return to Dashboard
                                </button>
                            </BlockStack>
                        </BlockStack>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <Page>
            <ui-title-bar title="Business Impact 📊">
                <button onClick={() => navigate("/app")}>Back</button>
            </ui-title-bar>
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg">Business Impact Data (PRO)</Text>
                            <Text as="p">Analyzing metrics for {stats?.totalReviews} reviews...</Text>
                            <div style={{ height: '300px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyItems: 'center', padding: '2rem' }}>
                                <Text as="p" tone="subdued" alignment="center">Your Business Impact data is being processed. This usually takes 24-48 hours after upgrade.</Text>
                            </div>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
