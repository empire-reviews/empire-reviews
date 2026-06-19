import { json, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState } from "react";
import {
    Page,
    Layout,
    BlockStack,
    Text,
    InlineGrid,
    Badge,
    Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { LockIcon } from "@shopify/polaris-icons";
import { isPlanPro } from "../billing.server";
import { BackButton } from "../components/BackButton";
import empireTheme from "../styles/empire-theme.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: empireTheme }];

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeekBucket {
    weekLabel: string;
    count: number;
}

interface TopProduct {
    productId: string;
    avg: number;
    count: number;
    title: string;
    imageUrl: string | null;
    onlineStoreUrl: string | null;
}

interface ProStats {
    // Funnel
    sent: number;
    opened: number;
    clicked: number;
    reviewed: number;
    openRate: number;
    clickRate: number;
    reviewRate: number;
    // Do This Next
    ordersAwaitingRequest: number;
    unansweredNegative: number;
    productsWithoutReviewsCount: number;
    // Revenue
    totalRevenue: number;
    revenueFromReviewedProducts: number;
    currency: string;
    // Trend
    weeklyTrend: WeekBucket[];
    // Top product
    topProduct: TopProduct | null;
    // Summary
    totalOrders: number;
    totalReviews: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const isPro = await isPlanPro(session.shop);

    if (!isPro) {
        return json({ locked: true, stats: null });
    }

    const shop = session.shop;
    const now = new Date();
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);

    // ── 1. EMAIL FUNNEL ───────────────────────────────────────────────────────
    // Count CampaignSend rows joined via campaign.shop
    const [
        sentCount,
        openedCount,
        clickedCount,
        reviewedCount,
    ] = await Promise.all([
        prisma.campaignSend.count({ where: { campaign: { shop } } }),
        prisma.campaignSend.count({ where: { campaign: { shop }, openedAt: { not: null } } }),
        prisma.campaignSend.count({ where: { campaign: { shop }, clickedAt: { not: null } } }),
        prisma.campaignSend.count({ where: { campaign: { shop }, reviewId: { not: null } } }),
    ]);

    const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 1000) / 10 : 0;
    const clickRate = sentCount > 0 ? Math.round((clickedCount / sentCount) * 1000) / 10 : 0;
    const reviewRate = sentCount > 0 ? Math.round((reviewedCount / sentCount) * 1000) / 10 : 0;

    // ── 2. DO THIS NEXT ───────────────────────────────────────────────────────
    const [
        ordersAwaitingRequest,
        negativeReviewsWithReplies,
        totalOrders,
    ] = await Promise.all([
        // Orders fulfilled but request not yet sent
        prisma.order.count({
            where: { shop, fulfilledAt: { not: null }, reviewRequestStatus: "pending" },
        }),
        // Negative reviews (rating ≤ 2) with replies included so we can filter
        prisma.review.findMany({
            where: { shop, rating: { lte: 2 } },
            select: { id: true, replies: { select: { id: true } } },
        }),
        prisma.order.count({ where: { shop } }),
    ]);

    const unansweredNegative = negativeReviewsWithReplies.filter(
        (r) => r.replies.length === 0
    ).length;

    // Products without reviews: distinct productIds in Orders minus those in Reviews
    const [orderedProductIds, reviewedProductIds] = await Promise.all([
        prisma.order.findMany({
            where: { shop, productId: { not: null } },
            select: { productId: true },
            distinct: ["productId"],
        }),
        prisma.review.findMany({
            where: { shop, productId: { not: null } },
            select: { productId: true },
            distinct: ["productId"],
        }),
    ]);

    const reviewedSet = new Set(reviewedProductIds.map((r) => r.productId));
    const productsWithoutReviewsCount = orderedProductIds.filter(
        (o) => o.productId && !reviewedSet.has(o.productId)
    ).length;

    // ── 3. REVENUE ────────────────────────────────────────────────────────────
    const allOrders = await prisma.order.findMany({
        where: { shop },
        select: { totalPrice: true, currency: true, productId: true },
    });

    let totalRevenue = 0;
    let revenueFromReviewedProducts = 0;
    const currencyCount: Record<string, number> = {};

    for (const order of allOrders) {
        const price = order.totalPrice ? Number(order.totalPrice) : 0;
        totalRevenue += price;
        if (order.productId && reviewedSet.has(order.productId)) {
            revenueFromReviewedProducts += price;
        }
        if (order.currency) {
            currencyCount[order.currency] = (currencyCount[order.currency] || 0) + 1;
        }
    }

    // Pick most common currency
    let currency = "USD";
    let maxCurrencyCount = 0;
    for (const [cur, cnt] of Object.entries(currencyCount)) {
        if (cnt > maxCurrencyCount) {
            maxCurrencyCount = cnt;
            currency = cur;
        }
    }

    // ── 4. 12-WEEK TREND ─────────────────────────────────────────────────────
    const recentReviews = await prisma.review.findMany({
        where: { shop, createdAt: { gte: twelveWeeksAgo } },
        select: { createdAt: true },
    });

    // Build 12 weekly buckets (oldest first)
    const weeklyTrend: WeekBucket[] = [];
    for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const count = recentReviews.filter(
            (r) => r.createdAt >= weekStart && r.createdAt < weekEnd
        ).length;
        const month = weekEnd.toLocaleString("default", { month: "short" });
        const day = weekEnd.getDate();
        weeklyTrend.push({ weekLabel: `${month} ${day}`, count });
    }

    // ── 5. TOTAL REVIEWS ─────────────────────────────────────────────────────
    const totalReviews = await prisma.review.count({ where: { shop } });

    // ── 6. TOP PRODUCT (≥3 reviews, highest avg rating) ──────────────────────
    const reviewsByProduct = await prisma.review.findMany({
        where: { shop, productId: { not: null } },
        select: { productId: true, rating: true },
    });

    type ProductAcc = Record<string, { total: number; count: number }>;
    const byProduct = reviewsByProduct.reduce<ProductAcc>((acc, r) => {
        const pid = r.productId!;
        if (!acc[pid]) acc[pid] = { total: 0, count: 0 };
        acc[pid].total += r.rating;
        acc[pid].count += 1;
        return acc;
    }, {});

    let topProductId: string | null = null;
    let topProductAvg = 0;
    let topProductCount = 0;
    for (const [pid, data] of Object.entries(byProduct)) {
        if (data.count < 3) continue;
        const avg = data.total / data.count;
        if (avg > topProductAvg) {
            topProductAvg = avg;
            topProductId = pid;
            topProductCount = data.count;
        }
    }

    let topProduct: TopProduct | null = null;
    if (topProductId) {
        let title = topProductId;
        let imageUrl: string | null = null;
        let onlineStoreUrl: string | null = null;
        try {
            const { unauthenticated } = await import("../shopify.server");
            const { admin } = await unauthenticated.admin(shop);
            const result = await admin.graphql(
                `#graphql
                query getProduct($id: ID!) {
                    product(id: $id) {
                        title
                        featuredImage { url }
                        onlineStoreUrl
                    }
                }`,
                { variables: { id: topProductId } }
            );
            const data = await result.json();
            const p = (data as any)?.data?.product;
            if (p) {
                title = p.title || topProductId;
                imageUrl = p.featuredImage?.url || null;
                onlineStoreUrl = p.onlineStoreUrl || null;
            }
        } catch (e) {
            console.error("⚠️ Failed to fetch top product from Shopify GraphQL:", e);
        }
        topProduct = {
            productId: topProductId,
            avg: Math.round(topProductAvg * 10) / 10,
            count: topProductCount,
            title,
            imageUrl,
            onlineStoreUrl,
        };
    }

    const stats: ProStats = {
        sent: sentCount,
        opened: openedCount,
        clicked: clickedCount,
        reviewed: reviewedCount,
        openRate,
        clickRate,
        reviewRate,
        ordersAwaitingRequest,
        unansweredNegative,
        productsWithoutReviewsCount,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        revenueFromReviewedProducts: Math.round(revenueFromReviewedProducts * 100) / 100,
        currency,
        weeklyTrend,
        topProduct,
        totalOrders,
        totalReviews,
    };

    return json({ locked: false, stats });
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

    // Map Polaris tone → empire accent variant
    const accentClass: Record<string, string> = {
        success: "empire-card-emerald",
        caution: "empire-card-amber",
        critical: "empire-card-rose",
        info: "empire-card-indigo",
    };
    const cardAccent = tone ? accentClass[tone] : "empire-card-violet";

    return (
        <div className={`empire-card ${cardAccent}`}>
            <BlockStack gap="200">
                <span className="empire-label">{label}</span>
                <span className="empire-stat">{value}</span>
                {sub && (
                    <span style={{ fontSize: "0.8rem", color, fontWeight: 600 }}>
                        {sub}
                    </span>
                )}
            </BlockStack>
        </div>
    );
}

function TrendChart({ weeklyTrend, trendMax }: { weeklyTrend: WeekBucket[]; trendMax: number }) {
    const [hovered, setHovered] = useState<string | null>(null);
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "140px", padding: "0 4px", position: "relative" }}>
            {weeklyTrend.map((week) => {
                const barPct = Math.max(4, Math.round((week.count / Math.max(trendMax, 1)) * 100));
                const isHovered = hovered === week.weekLabel;
                return (
                    <div
                        key={week.weekLabel}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%", position: "relative" }}
                        onMouseEnter={() => setHovered(week.weekLabel)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        {isHovered && (
                            <div style={{
                                position: "absolute",
                                top: 0,
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "#1e293b",
                                color: "#fff",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "4px 8px",
                                borderRadius: "6px",
                                whiteSpace: "nowrap",
                                zIndex: 10,
                                pointerEvents: "none",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                            }}>
                                {week.count} review{week.count === 1 ? "" : "s"}
                            </div>
                        )}
                        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                            {week.count > 0 ? (
                                <div
                                    className="empire-bar empire-card-indigo"
                                    style={{
                                        width: "100%",
                                        height: `${barPct}%`,
                                        ["--empire-accent" as any]: "#4f46e5",
                                        borderRadius: "6px 6px 0 0",
                                        transition: "opacity 0.15s",
                                        opacity: isHovered ? 1 : 0.85,
                                    }}
                                />
                            ) : (
                                <div style={{ width: "100%", height: "4px", background: "#e5e7eb", borderRadius: "4px 4px 0 0" }} />
                            )}
                        </div>
                        <span style={{ fontSize: "0.6rem", color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", textAlign: "center" }}>
                            {week.weekLabel}
                        </span>
                    </div>
                );
            })}
        </div>
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
                                You're Flying <br /> Blind. 📊
                            </h2>
                            <p style={{ color: '#94a3b8', fontSize: '1.25rem', lineHeight: '1.6', maxWidth: '400px' }}>
                                Pro merchants see exactly where their reviews are growing, which customers respond, and what % of fulfilled orders actually turn into reviews. You're missing all of it.
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
                                    <div style={{ color: '#10b981', fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.2))' }}>📈</div>
                                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Are your reviews accelerating or stalling this week?</span>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ color: '#10b981', fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.2))' }}>💬</div>
                                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>See your reply rate — unanswered reviews silently kill sales</span>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ color: '#10b981', fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.2))' }}>📦</div>
                                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>What % of your customers actually leave a review?</span>
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
                                    See What You're Missing — $9.99/mo →
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
        sent,
        opened,
        clicked,
        reviewed,
        openRate,
        clickRate,
        reviewRate,
        ordersAwaitingRequest,
        unansweredNegative,
        productsWithoutReviewsCount,
        totalRevenue,
        revenueFromReviewedProducts,
        currency,
        weeklyTrend,
        topProduct,
        totalOrders,
        totalReviews,
    } = stats;

    // Bar chart max for scaling
    const trendMax = Math.max(...weeklyTrend.map((w) => w.count), 1);

    const fmt = (n: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

    // Funnel step accent variants (progressing indigo → cyan → emerald → emerald)
    const funnelSteps = [
        { label: "Sent", count: sent, pct: 100, accent: "empire-card-indigo", barAccent: "#4f46e5", rise: "empire-rise-1" },
        { label: "Opened", count: opened, pct: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0, accent: "empire-card-cyan", barAccent: "#0891b2", rise: "empire-rise-2" },
        { label: "Clicked", count: clicked, pct: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0, accent: "empire-card-emerald", barAccent: "#059669", rise: "empire-rise-3" },
        { label: "Reviewed", count: reviewed, pct: sent > 0 ? Math.round((reviewed / sent) * 1000) / 10 : 0, accent: "empire-card-emerald", barAccent: "#059669", rise: "empire-rise-4" },
    ];

    return (
        <div className="empire-void" style={{ borderRadius: "16px" }}>
            <Page>
                <BackButton />
                <Layout>
                    {/* ── Header ── */}
                    <Layout.Section>
                        <BlockStack gap="200">
                            <h1 className="empire-title empire-rise" style={{ fontSize: "2rem", margin: 0 }}>
                                Business Impact Analytics 📊
                            </h1>
                            <Text as="p" tone="subdued">
                                Live data across {totalOrders.toLocaleString()} synced orders and{" "}
                                {totalReviews.toLocaleString()} reviews.
                            </Text>
                        </BlockStack>
                    </Layout.Section>

                    {/* ── Email Funnel ── */}
                    <Layout.Section>
                        <div className="empire-card empire-card-indigo empire-rise empire-rise-1" style={{ position: "relative" }}>
                            {/* scattered sparkles in the hero */}
                            <span className="empire-sparkle" style={{ top: "18%", left: "12%" }} />
                            <span className="empire-sparkle" style={{ top: "30%", right: "20%", animationDelay: "0.8s" }} />
                            <span className="empire-sparkle" style={{ bottom: "24%", left: "40%", animationDelay: "1.4s" }} />
                            <span className="empire-sparkle" style={{ top: "60%", right: "10%", animationDelay: "0.4s" }} />
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">
                                    📧 Email Conversion Funnel
                                </Text>
                                <Text as="p" tone="subdued" variant="bodySm">
                                    Aggregate across all campaigns for this store.
                                </Text>
                                <div style={{ display: "flex", gap: "8px", alignItems: "stretch", overflowX: "auto", position: "relative", zIndex: 1 }}>
                                    {funnelSteps.map((step, idx) => (
                                        <div key={step.label} style={{ flex: 1, minWidth: 110 }}>
                                            {idx > 0 && (
                                                <div style={{ height: "4px", background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)", borderRadius: "2px", margin: "20px 0 16px" }} />
                                            )}
                                            <div
                                                className={`empire-bar ${step.accent} ${step.rise}`}
                                                style={{
                                                    ["--empire-accent" as any]: step.barAccent,
                                                    padding: "18px 16px",
                                                    color: "white",
                                                }}
                                            >
                                                <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1 }}>
                                                    {step.count.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: "0.85rem", opacity: 0.92, marginTop: 6 }}>
                                                    {step.label}
                                                </div>
                                                <div style={{ fontSize: "0.78rem", opacity: 0.78, marginTop: 4 }}>
                                                    {idx === 0 ? "100%" : `${step.pct}% of sent`}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                                    <StatCard label="Open Rate" value={`${openRate}%`} tone={openRate >= 20 ? "success" : openRate >= 10 ? "caution" : "critical"} />
                                    <StatCard label="Click Rate" value={`${clickRate}%`} tone={clickRate >= 5 ? "success" : clickRate >= 2 ? "caution" : "critical"} />
                                    <StatCard label="Review Rate" value={`${reviewRate}%`} tone={reviewRate >= 2 ? "success" : reviewRate >= 1 ? "caution" : "info"} />
                                </InlineGrid>
                            </BlockStack>
                        </div>
                    </Layout.Section>

                {/* ── Do This Next ── */}
                <Layout.Section>
                    <div className="empire-card empire-card-violet empire-rise empire-rise-2">
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">
                                ⚡ Do This Next
                            </Text>
                            <BlockStack gap="300">
                                {/* Awaiting request */}
                                <div className={`empire-row ${ordersAwaitingRequest > 0 ? "empire-card-amber" : "empire-card-emerald"}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: ordersAwaitingRequest > 0 ? "rgba(217, 119, 6, 0.08)" : "rgba(5, 150, 105, 0.08)", border: ordersAwaitingRequest > 0 ? "1px solid rgba(217, 119, 6, 0.2)" : "1px solid rgba(5, 150, 105, 0.2)", flexWrap: "wrap", gap: "8px" }}>
                                    <BlockStack gap="100">
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                            {ordersAwaitingRequest > 0
                                                ? `${ordersAwaitingRequest} fulfilled orders haven't been sent a review request yet`
                                                : "All fulfilled orders have been contacted"}
                                        </Text>
                                        {ordersAwaitingRequest > 0 && (
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Start a campaign to capture reviews from recent buyers.
                                            </Text>
                                        )}
                                    </BlockStack>
                                    {ordersAwaitingRequest > 0 ? (
                                        <Button onClick={() => navigate("/app/campaigns")} variant="primary" size="slim">
                                            Start Campaign
                                        </Button>
                                    ) : (
                                        <Badge tone="success">All caught up</Badge>
                                    )}
                                </div>

                                {/* Unanswered negatives */}
                                <div className={`empire-row ${unansweredNegative > 0 ? "empire-card-rose" : "empire-card-emerald"}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: unansweredNegative > 0 ? "rgba(225, 29, 72, 0.08)" : "rgba(5, 150, 105, 0.08)", border: unansweredNegative > 0 ? "1px solid rgba(225, 29, 72, 0.2)" : "1px solid rgba(5, 150, 105, 0.2)", flexWrap: "wrap", gap: "8px" }}>
                                    <BlockStack gap="100">
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                            {unansweredNegative > 0
                                                ? `${unansweredNegative} negative review${unansweredNegative === 1 ? "" : "s"} with no reply`
                                                : "No unanswered negative reviews"}
                                        </Text>
                                        {unansweredNegative > 0 && (
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Unanswered 1–2 star reviews erode buyer trust. Reply to show you care.
                                            </Text>
                                        )}
                                    </BlockStack>
                                    {unansweredNegative > 0 ? (
                                        <Button onClick={() => navigate("/app/reviews")} variant="primary" size="slim" tone="critical">
                                            Reply Now
                                        </Button>
                                    ) : (
                                        <Badge tone="success">All caught up</Badge>
                                    )}
                                </div>

                                {/* Products without reviews */}
                                <div className={`empire-row ${productsWithoutReviewsCount > 0 ? "empire-card-indigo" : "empire-card-emerald"}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: productsWithoutReviewsCount > 0 ? "rgba(79, 70, 229, 0.08)" : "rgba(5, 150, 105, 0.08)", border: productsWithoutReviewsCount > 0 ? "1px solid rgba(79, 70, 229, 0.2)" : "1px solid rgba(5, 150, 105, 0.2)", flexWrap: "wrap", gap: "8px" }}>
                                    <BlockStack gap="100">
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                            {productsWithoutReviewsCount > 0
                                                ? `~${productsWithoutReviewsCount} product${productsWithoutReviewsCount === 1 ? "" : "s"} in your orders have no reviews yet`
                                                : "All ordered products have at least one review"}
                                        </Text>
                                        {productsWithoutReviewsCount > 0 && (
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Products with no reviews are harder to sell. Target them in your next campaign.
                                            </Text>
                                        )}
                                    </BlockStack>
                                    {productsWithoutReviewsCount > 0 ? (
                                        <Button onClick={() => navigate("/app/reviews")} size="slim">
                                            View Reviews
                                        </Button>
                                    ) : (
                                        <Badge tone="success">All caught up</Badge>
                                    )}
                                </div>
                            </BlockStack>
                        </BlockStack>
                    </div>
                </Layout.Section>

                {/* ── Revenue ── */}
                <Layout.Section>
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                        <div className="empire-card empire-card-cyan empire-rise empire-rise-3" style={{ position: "relative" }}>
                            <span className="empire-float" style={{ position: "absolute", top: "1.25rem", right: "1.5rem", fontSize: "2rem", opacity: 0.85, filter: "drop-shadow(0 6px 10px rgba(8,145,178,0.25))" }}>💰</span>
                            <BlockStack gap="200">
                                <span className="empire-label">Total Revenue (all synced orders)</span>
                                <span className="empire-stat">{fmt(totalRevenue)}</span>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Across {totalOrders.toLocaleString()} orders tracked in Empire Reviews.
                                </Text>
                            </BlockStack>
                        </div>
                        <div className="empire-card empire-card-emerald empire-rise empire-rise-4" style={{ position: "relative" }}>
                            <span className="empire-float" style={{ position: "absolute", top: "1.25rem", right: "1.5rem", fontSize: "2rem", opacity: 0.85, filter: "drop-shadow(0 6px 10px rgba(5,150,105,0.25))", animationDelay: "1.2s" }}>⭐</span>
                            <BlockStack gap="200">
                                <span className="empire-label">Revenue from orders of products that have reviews</span>
                                <span className="empire-stat">{fmt(revenueFromReviewedProducts)}</span>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Orders whose product also has a review in your store. This does not imply reviews caused these sales.
                                </Text>
                            </BlockStack>
                        </div>
                    </InlineGrid>
                </Layout.Section>

                {/* ── 12-Week Trend ── */}
                <Layout.Section>
                    <div className="empire-card empire-card-indigo empire-rise empire-rise-4">
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">
                                📅 12-Week Review Trend
                            </Text>
                            <TrendChart weeklyTrend={weeklyTrend} trendMax={trendMax} />
                            <Text as="p" variant="bodySm" tone="subdued">
                                Each bar = one week. Hover for exact count.
                            </Text>
                        </BlockStack>
                    </div>
                </Layout.Section>

                {/* ── Top Product ── */}
                <Layout.Section>
                    <div className="empire-card empire-card-amber empire-rise empire-rise-5">
                        <BlockStack gap="300">
                            <Text as="h2" variant="headingMd">
                                🏆 Top Rated Product
                            </Text>
                            {topProduct ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
                                    {topProduct.imageUrl && (
                                        <img
                                            src={topProduct.imageUrl}
                                            alt={topProduct.title}
                                            style={{ width: 84, height: 84, objectFit: "cover", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 12px 28px -10px rgba(217,119,6,0.35)", transition: "transform 0.35s cubic-bezier(0.175,0.885,0.32,1.275)" }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                                        />
                                    )}
                                    <BlockStack gap="200">
                                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                                            {topProduct.onlineStoreUrl ? (
                                                <a
                                                    href={topProduct.onlineStoreUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="empire-title"
                                                    style={{ fontSize: "1.15rem", textDecoration: "none" }}
                                                >
                                                    {topProduct.title}
                                                </a>
                                            ) : (
                                                topProduct.title
                                            )}
                                        </Text>
                                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                                            <span
                                                className="empire-glow"
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "4px",
                                                    padding: "4px 12px",
                                                    borderRadius: "999px",
                                                    fontWeight: 800,
                                                    color: "#fff",
                                                    background: "linear-gradient(135deg, #d97706, #f59e0b)",
                                                    boxShadow: "0 6px 16px -6px rgba(217,119,6,0.5)",
                                                }}
                                            >
                                                {`${topProduct.avg} ★`}
                                            </span>
                                            <Text as="p" tone="subdued">
                                                {topProduct.count} {topProduct.count === 1 ? "review" : "reviews"}
                                            </Text>
                                        </div>
                                        <Text as="p" tone="subdued" variant="bodySm">
                                            Highest average rating among products with 3+ reviews.
                                        </Text>
                                    </BlockStack>
                                </div>
                            ) : (
                                <Text as="p" tone="subdued">
                                    No product has 3 or more reviews yet. Keep collecting reviews — your top product will appear here once it hits the threshold.
                                </Text>
                            )}
                        </BlockStack>
                    </div>
                </Layout.Section>
                </Layout>
            </Page>
        </div>
    );
}
