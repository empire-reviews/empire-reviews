import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    InlineGrid,
    Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { LockIcon } from "@shopify/polaris-icons";
import { isPlanPro } from "../billing.server";
import { BackButton } from "../components/BackButton";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const isPro = await isPlanPro(session.shop);

    // GATE: Business Impact is PRO Only
    if (!isPro) {
        return json({ locked: true, stats: null });
    }

    const shop = session.shop;

    // ── Date helpers ────────────────────────────────────────────────────────
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // ── Parallel DB queries ─────────────────────────────────────────────────
    const [
        allReviews,
        approvedReviews,
        totalOrders,
        sentOrders,
        reviewsThisMonth,
        reviewsLastMonth,
    ] = await Promise.all([
        // All reviews for this shop
        prisma.review.findMany({
            where: { shop },
            select: { rating: true, productId: true },
        }),

        // Approved/published reviews
        prisma.review.count({
            where: { shop, status: "approved" },
        }),

        // Total orders synced for this shop
        prisma.order.count({ where: { shop } }),

        // Orders where a review request was actually sent
        prisma.order.count({
            where: { shop, reviewRequestStatus: "sent" },
        }),

        // Reviews created this calendar month
        prisma.review.count({
            where: { shop, createdAt: { gte: startOfThisMonth } },
        }),

        // Reviews created last calendar month
        prisma.review.count({
            where: {
                shop,
                createdAt: { gte: startOfLastMonth, lt: startOfThisMonth },
            },
        }),
    ]);

    const totalReviews = allReviews.length;

    // Average rating (avoid divide-by-zero)
    const avgRating =
        totalReviews > 0
            ? allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            : 0;

    // Review conversion rate: reviews / orders (as %)
    const conversionRate =
        totalOrders > 0
            ? Math.round((totalReviews / totalOrders) * 100 * 10) / 10
            : 0;

    // Review request success rate: of orders where request was sent, how many
    // resulted in any review (rough proxy: total reviews / sent requests)
    const requestSuccessRate =
        sentOrders > 0
            ? Math.round((totalReviews / sentOrders) * 100 * 10) / 10
            : 0;

    // Monthly trend delta (reviews this month vs last month)
    const monthlyDelta = reviewsThisMonth - reviewsLastMonth;

    // Top-rated product by average rating (need ≥1 review to qualify)
    type ProductAccum = Record<string, { total: number; count: number }>;
    const byProduct = allReviews.reduce<ProductAccum>((acc, r) => {
        if (!r.productId) return acc;
        if (!acc[r.productId]) acc[r.productId] = { total: 0, count: 0 };
        acc[r.productId].total += r.rating;
        acc[r.productId].count += 1;
        return acc;
    }, {});

    let topProductId: string | null = null;
    let topProductAvg = 0;
    let topProductCount = 0;
    for (const [pid, data] of Object.entries(byProduct)) {
        const avg = data.total / data.count;
        if (avg > topProductAvg) {
            topProductAvg = avg;
            topProductId = pid;
            topProductCount = data.count;
        }
    }

    return json({
        locked: false,
        stats: {
            totalReviews,
            approvedReviews,
            avgRating: Math.round(avgRating * 10) / 10,
            totalOrders,
            sentOrders,
            conversionRate,
            requestSuccessRate,
            reviewsThisMonth,
            reviewsLastMonth,
            monthlyDelta,
            topProductId,
            topProductAvg: Math.round(topProductAvg * 10) / 10,
            topProductCount,
        },
    });
};

// ── Small inline stat card ────────────────────────────────────────────────────
function StatCard({
    label,
    value,
    sub,
    tone,
}: {
    label: string;
    value: string;
    sub?: string;
    tone?: "success" | "caution" | "critical" | "info";
}) {
    const subColor: Record<string, string> = {
        success: "#10b981",
        caution: "#f59e0b",
        critical: "#ef4444",
        info: "#6366f1",
    };
    const color = tone ? subColor[tone] : "#6b7280";

    return (
        <Card>
            <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                    {label}
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                    {value}
                </Text>
                {sub && (
                    <span style={{ fontSize: "0.8rem", color, fontWeight: 600 }}>
                        {sub}
                    </span>
                )}
            </BlockStack>
        </Card>
    );
}

export default function ImpactPage() {
    const { locked, stats } = useLoaderData<typeof loader>();
    const navigate = useNavigate();

    // ── FREE gate (leave untouched) ──────────────────────────────────────────
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
                                <button
                                    onClick={() => navigate("/app/plans")}
                                    style={{
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
                                    }}
                                >
                                    Start Growing — $9.99/mo →
                                </button>
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

    // ── PRO: real analytics dashboard ────────────────────────────────────────
    if (!stats) return null;

    const {
        totalReviews,
        approvedReviews,
        avgRating,
        totalOrders,
        sentOrders,
        conversionRate,
        requestSuccessRate,
        reviewsThisMonth,
        monthlyDelta,
        topProductId,
        topProductAvg,
        topProductCount,
    } = stats;

    const trendLabel =
        monthlyDelta === 0
            ? "Same as last month"
            : monthlyDelta > 0
            ? `▲ ${monthlyDelta} vs last month`
            : `▼ ${Math.abs(monthlyDelta)} vs last month`;

    const trendTone: "success" | "critical" | "info" =
        monthlyDelta > 0 ? "success" : monthlyDelta < 0 ? "critical" : "info";

    const starDisplay = "★".repeat(Math.round(avgRating)) + "☆".repeat(5 - Math.round(avgRating));

    return (
        <Page>
            <BackButton />
            <Layout>
                {/* ── Header ── */}
                <Layout.Section>
                    <BlockStack gap="200">
                        <Text as="h1" variant="headingXl">
                            Business Impact Analytics 📊
                        </Text>
                        <Text as="p" tone="subdued">
                            Live data across {totalOrders.toLocaleString()} synced orders
                            and {totalReviews.toLocaleString()} reviews.
                        </Text>
                    </BlockStack>
                </Layout.Section>

                {/* ── Four KPI cards ── */}
                <Layout.Section>
                    <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                        <StatCard
                            label="Review Conversion Rate"
                            value={`${conversionRate}%`}
                            sub={`${totalReviews} reviews / ${totalOrders} orders`}
                            tone={conversionRate >= 10 ? "success" : conversionRate >= 5 ? "caution" : "critical"}
                        />
                        <StatCard
                            label="Reviews This Month"
                            value={String(reviewsThisMonth)}
                            sub={trendLabel}
                            tone={trendTone}
                        />
                        <StatCard
                            label="Average Rating"
                            value={`${avgRating} / 5`}
                            sub={starDisplay}
                            tone={avgRating >= 4 ? "success" : avgRating >= 3 ? "caution" : "critical"}
                        />
                        <StatCard
                            label="Request Success Rate"
                            value={`${requestSuccessRate}%`}
                            sub={`${sentOrders} requests sent`}
                            tone={requestSuccessRate >= 20 ? "success" : requestSuccessRate >= 10 ? "caution" : "info"}
                        />
                    </InlineGrid>
                </Layout.Section>

                {/* ── Secondary stats row ── */}
                <Layout.Section>
                    <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                        <StatCard
                            label="Approved Reviews"
                            value={String(approvedReviews)}
                            sub={totalReviews > 0 ? `${Math.round((approvedReviews / totalReviews) * 100)}% approval rate` : "—"}
                            tone="info"
                        />
                        <StatCard
                            label="Total Orders Tracked"
                            value={totalOrders.toLocaleString()}
                            sub="Synced from Shopify"
                            tone="info"
                        />
                        <StatCard
                            label="Review Requests Sent"
                            value={sentOrders.toLocaleString()}
                            sub={totalOrders > 0 ? `${Math.round((sentOrders / totalOrders) * 100)}% of orders` : "—"}
                            tone="info"
                        />
                    </InlineGrid>
                </Layout.Section>

                {/* ── Top product card ── */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="300">
                            <Text as="h2" variant="headingMd">
                                🏆 Top Rated Product
                            </Text>
                            {topProductId ? (
                                <BlockStack gap="200">
                                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                            Product ID: {topProductId}
                                        </Text>
                                        <Badge tone="success">{`${topProductAvg} ★`}</Badge>
                                        <Text as="p" tone="subdued">
                                            ({topProductCount} {topProductCount === 1 ? "review" : "reviews"})
                                        </Text>
                                    </div>
                                    <Text as="p" tone="subdued" variant="bodySm">
                                        Based on average rating across all reviews for this product.
                                    </Text>
                                </BlockStack>
                            ) : (
                                <Text as="p" tone="subdued">
                                    No product-linked reviews yet. Reviews will appear here once customers
                                    submit them via the widget or email requests.
                                </Text>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
