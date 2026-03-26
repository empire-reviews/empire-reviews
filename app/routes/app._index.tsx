import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { hasActivePayment } from "../billing.server";
import prisma from "../db.server";
import { ArrowRightIcon, ArrowUpIcon } from "@shopify/polaris-icons";
import { trackEvent, getConversionPhase, shouldShowUpgradePrompt } from "../utils/analytics.server";
import { CONVERSION_CONFIG } from "../config/conversion";
import { generateInsights, type AIProvider } from "../services/ai.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const session = auth.session;
  const { shop } = session;

  // Preserve Shopify params so the redirected request can authenticate
  const url = new URL(request.url);
  const shopifyParams = new URLSearchParams();
  for (const key of ["shop", "host", "embedded", "locale", "session", "timestamp", "hmac"]) {
    if (url.searchParams.has(key)) shopifyParams.set(key, url.searchParams.get(key)!);
  }
  const paramString = shopifyParams.toString();

  // Check onboarding status - redirect if not completed
  const settings = await prisma.settings.findUnique({ where: { shop } });
  if (!settings || !settings.hasCompletedOnboarding) {
    // Create settings if missing (first launch)
    if (!settings) {
      await prisma.settings.create({
        data: { shop, hasCompletedOnboarding: false },
      });
    }
    return redirect(`/app/onboarding${paramString ? `?${paramString}` : ""}`);
  }

  const isPro = await hasActivePayment(request);
  const planName = isPro ? "EMPIRE_PRO" : "FREE";

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 🚀 PERFORMANCE: Use aggregate queries instead of loading all reviews
  const [
    totalReviews,
    ratingAgg,
    reviewsThisWeek,
    reviewsLastWeek,
    unrepliedCount,
    urgentCount,
    pendingOrders,
    userSession,
  ] = await Promise.all([
    prisma.review.count({ where: { shop } }),
    prisma.review.aggregate({ _avg: { rating: true }, where: { shop } }),
    prisma.review.count({ where: { shop, createdAt: { gte: sevenDaysAgo } } }),
    prisma.review.count({ where: { shop, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    prisma.review.count({ where: { shop, replies: { none: {} } } }),
    prisma.review.count({ where: { shop, rating: { lte: 2 }, replies: { none: {} } } }),
    prisma.order.count({ where: { shop, reviewRequestStatus: "pending" } }),
    prisma.session.findFirst({
      where: { shop: session.shop },
      select: { appInstalledAt: true, lastUpgradePrompt: true, upgradePromptCount: true },
    }),
  ]);

  const averageRating = ratingAgg._avg.rating ?? 0;
  const reviewTrend = reviewsLastWeek === 0
    ? (reviewsThisWeek > 0 ? 100 : 0)
    : Math.round(((reviewsThisWeek - reviewsLastWeek) / reviewsLastWeek) * 100);

  // Calculate conversion phase
  const phase = userSession ? getConversionPhase(userSession.appInstalledAt) : "DELIGHT";
  const canShowUpgrade = userSession
    ? shouldShowUpgradePrompt(phase, userSession.lastUpgradePrompt)
    : false;

  // Track page view
  await trackEvent({
    shop: session.shop,
    event: "page_view",
    page: "dashboard",
  });

  // 🧠 REAL INTELLIGENCE (PRO)
  let impact = { formatted: "$0.00", currency: "USD" };
  let insights: { score: number; label: string; aiSummary: string | null } | null = null;

  if (planName === "EMPIRE_PRO") {
    // 1. Business Impact: Real Order Revenue (already aggregate, keep as is)
    const [orderAgg, latestOrder] = await Promise.all([
      prisma.order.aggregate({ _sum: { totalPrice: true }, where: { shop: session.shop } }),
      prisma.order.findFirst({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, select: { currency: true } }),
    ]);
    const totalRevenue = orderAgg._sum.totalPrice || 0;
    const currency = latestOrder?.currency || "USD";
    impact = {
      formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(totalRevenue),
      currency,
    };

    // 2. AI Insights — serve from cache, generate in background only if stale
    const positiveCount = await prisma.review.count({
      where: { shop, OR: [{ sentiment: "POSITIVE" }, { rating: { gte: 4 } }] }
    });
    const sentimentScore = totalReviews > 0 ? (positiveCount / totalReviews) * 5 : 0;

    let sentimentLabel = "Sentiment Stable";
    if (sentimentScore >= 4.5) sentimentLabel = "Exceptional Love 🚀";
    else if (sentimentScore >= 4.0) sentimentLabel = "High Trust 💎";
    else if (sentimentScore >= 3.0) sentimentLabel = "Room to Improve";
    else if (totalReviews > 0) sentimentLabel = "Critical Action Needed";

    insights = { score: sentimentScore, label: sentimentLabel, aiSummary: settings?.aiInsightsSummary || null };

    // AI Insight Dashboard Card — strict READ-ONLY cache.
    // Generation happens exclusively on the Insights page via button click to protect BYOK tokens.
    if (settings?.aiProvider && settings?.aiApiKey) {
      insights.aiSummary = settings.aiInsightsSummary || null;
    }
  }

  return json({
    metrics: { totalReviews, averageRating, reviewsThisWeek, reviewTrend, unrepliedCount, urgentCount, awaitingDeliveryCount: pendingOrders },
    planName,
    phase,
    canShowUpgrade,
    features: CONVERSION_CONFIG.FEATURES,
    impact,
    insights,
    settings,
  });

};


export default function EmpireDashboard() {
  const { metrics, planName, impact, insights } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="empire-dashboard">
      {/* CUSTOM STYLES */}
      <style>{`
            .empire-dashboard {
                --empire-primary: #0f172a;
                --empire-accent: #3b82f6;
                --empire-success: #10b981;
                --empire-warning: #f59e0b;
                --empire-surface: #ffffff;
                --empire-bg: #f1f5f9;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .hero-banner {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                color: white;
                padding: 3rem 2rem;
                border-radius: 16px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
                margin-bottom: 2rem;
                position: relative;
                overflow: hidden;
            }
            .hero-content { position: relative; z-index: 2; }
            .hero-decoration {
                position: absolute;
                top: -50%;
                right: -10%;
                width: 400px;
                height: 400px;
                background: radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, rgba(0,0,0,0) 70%);
                border-radius: 50%;
                z-index: 1;
            }
            .stat-card {
                background: var(--empire-surface);
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border: 1px solid #e2e8f0;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                transform-style: preserve-3d;
                perspective: 1000px;
            }
            .stat-card:hover {
                transform: translateY(-8px) rotateX(2deg) rotateY(-2deg);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                border-color: var(--empire-accent);
            }
            .stat-value { font-size: 2.5rem; font-weight: 800; color: var(--empire-primary); line-height: 1; margin: 0.5rem 0; }
            .stat-label { font-size: 0.875rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
            .trend-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                background: #dcfce7;
                color: #166534;
                border-radius: 999px;
                font-size: 0.75rem;
                font-weight: 700;
            }
            .action-btn {
                background: linear-gradient(to right, #2563eb, #3b82f6);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 8px;
                font-weight: 600;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);
                transition: all 0.2s;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            .action-btn:hover {
                background: linear-gradient(to right, #1d4ed8, #2563eb);
                transform: scale(1.02);
            }
            .nav-card {
                background: white;
                padding: 0.75rem;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: left;
                text-decoration: none;
                color: var(--empire-primary);
                display: flex;
                align-items: flex-start;
                gap: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                min-height: 90px;
            }
            .nav-card:hover { border-color: var(--empire-accent); transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .nav-icon-box { 
                width: 40px; height: 40px; 
                border-radius: 8px; 
                background: #f1f5f9; 
                display: flex; align-items: center; justify-content: center;
                color: #64748b;
                transition: all 0.2s;
            }
            .nav-card:hover .nav-icon-box { background: #eff6ff; color: var(--empire-accent); }
            .nav-card-content { display: flex; flex-direction: column; gap: 2px; }
            @keyframes pulse-gold {
                0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
                70% { box-shadow: 0 0 0 10px rgba(234, 179, 8, 0); }
                100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
            }
            .upgrade-pulse {
                animation: pulse-gold 2s infinite;
                border: 1px solid #facc15 !important;
            }
            .usage-bar-container {
                background: #e2e8f0;
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
                margin-top: 8px;
            }
            .usage-bar-fill {
                height: 100%;
                transition: width 1s ease-in-out;
            }
            .blurred-preview {
                filter: blur(4px);
                opacity: 0.6;
                user-select: none;
                pointer-events: none;
            }
            .pro-badge-floating {
                position: absolute;
                top: 8px;
                right: 8px;
                background: linear-gradient(135deg, #a855f7 0%, #d946ef 100%);
                color: white;
                padding: 2px 8px;
                border-radius: 8px;
                font-size: 0.6rem;
                font-weight: 900;
                box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
                letter-spacing: 0.05em;
                z-index: 10;
                border: 1px solid rgba(255, 255, 255, 0.3);
                animation: float-badge 3s ease-in-out infinite;
            }
            @keyframes float-badge {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-4px); }
            }
            @keyframes shimmer {
                0% { background-position: -1000px 0; }
                100% { background-position: 1000px 0; }
            }
            .shimmer-effect {
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                background-size: 1000px 100%;
                animation: shimmer 3s infinite;
            }
        `}</style>

      <Page fullWidth>
        <BlockStack gap="600">

          {/* 🎨 PREMIUM HERO HEADER */}
          <div className="hero-banner">
            <div className="hero-decoration"></div>
            <div className="hero-content">
              <BlockStack gap="400">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '0.5rem' }}>
                    <img src="/logo-icon.png" alt="Empire Icon" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px' }} />
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
                      Empire Command Center 🚀
                    </h1>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '1.1rem', maxWidth: '600px' }}>
                    You are gathering feedback faster than 80% of stores. Keep the momentum going by replying to your pending reviews.
                  </p>
                </div>
                <InlineStack gap="300">
                  <button className="action-btn" onClick={() => navigate("/app/reviews")}>
                    Open War Room <ArrowRightIcon style={{ width: 20 }} />
                  </button>
                  {planName === "FREE" && (
                    <button
                      className="action-btn upgrade-pulse"
                      onClick={() => navigate("/app/plans")}
                      style={{ background: 'white', color: '#0f172a', border: '1px solid #e2e8f0' }}
                    >
                      Upgrade to Pro 💎
                    </button>
                  )}
                </InlineStack>
              </BlockStack>
            </div>
          </div>

          {/* 📈 USAGE METER (Psychology: Loss Aversion) */}
          {planName === "FREE" && (
            <div style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              marginBottom: '1rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Review Storage Capacity</Text>
                  <Text as="p" variant="bodyXs" tone="subdued">Your free plan allows up to 50 reviews. Upgrade to prevent data loss.</Text>
                </BlockStack>
                <div style={{ textAlign: 'right' }}>
                  <Text as="p" variant="bodyMd" fontWeight="bold">{metrics.totalReviews} / 50</Text>
                  <Text as="p" variant="bodyXs" tone={metrics.totalReviews > 40 ? "critical" : "subdued"}>
                    {metrics.totalReviews > 40 ? "Action Required: Near Limit" : "Volume Status: Healthy"}
                  </Text>
                </div>
              </InlineStack>
              <div className="usage-bar-container">
                <div
                  className="usage-bar-fill"
                  style={{
                    width: `${Math.min(100, (metrics.totalReviews / 50) * 100)}%`,
                    background: metrics.totalReviews > 40 ? '#ef4444' : metrics.totalReviews > 25 ? '#f59e0b' : '#10b981'
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* 📊 PSYCHOLOGICAL STAT CARDS */}
          <Layout>
            <Layout.Section>
              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                {/* Card 1: Velocity (Growth Mindset) */}
                <div className="stat-card">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="stat-label">Growth Velocity</div>
                      <div className="trend-badge" style={{ background: metrics.reviewTrend >= 0 ? '#dcfce7' : '#fee2e2', color: metrics.reviewTrend >= 0 ? '#166534' : '#991b1b' }}>
                        {metrics.reviewTrend >= 0 ? <ArrowUpIcon style={{ width: 14 }} /> : null}
                        {metrics.reviewTrend >= 0 ? '+' : ''}{metrics.reviewTrend}%
                      </div>
                    </div>
                    <div className="stat-value">+{metrics.reviewsThisWeek}</div>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>New reviews this week</p>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: '#e2e8f0', marginTop: '1rem', borderRadius: '2px' }}>
                    <div style={{ width: '65%', height: '100%', background: '#10b981', borderRadius: '2px' }}></div>
                  </div>
                </div>

                {/* Card 2: Trust Score (Social Proof) */}
                <div className="stat-card">
                  <div>
                    <div className="stat-label">Trust Score</div>
                    <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {metrics.averageRating.toFixed(1)}
                      <span style={{ fontSize: '1rem', color: '#f59e0b' }}>★</span>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Based on {metrics.totalReviews} total reviews</p>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <div key={s} style={{ flex: 1, height: '4px', background: s <= Math.round(metrics.averageRating) ? '#f59e0b' : '#e2e8f0', borderRadius: '2px' }}></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card 3: Action Queue (Completion Bias) */}
                <div className="stat-card" style={{ borderColor: metrics.unrepliedCount > 0 ? '#fca5a5' : '#e2e8f0' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="stat-label">Action Queue</div>
                      <div className="trend-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>
                        📦 {metrics.awaitingDeliveryCount} Awaiting Delivery
                      </div>
                    </div>
                    <div className="stat-value" style={{ color: metrics.unrepliedCount > 0 ? '#ef4444' : '#10b981' }}>
                      {metrics.unrepliedCount}
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Reviews waiting for reply</p>
                  </div>
                  {metrics.unrepliedCount > 0 ? (
                    <button onClick={() => navigate("/app/reviews")} style={{
                      width: '100%', padding: '8px', marginTop: '1rem', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600
                    }}>
                      Clear Queue →
                    </button>
                  ) : (
                    <div style={{ marginTop: '1rem', color: '#10b981', fontWeight: 600 }}>All Caught Up! 🎉</div>
                  )}
                </div>
              </InlineGrid>
            </Layout.Section>
          </Layout>


          {/* 🚧 BOTTOM SECTION: PREMIUM QUICK ACCESS */}
          <Layout>
            <Layout.Section>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>

                {/* CAMPAIGNS CARD */}
                <div
                  onClick={() => navigate("/app/campaigns")}
                  style={{
                    background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    color: 'white',
                    height: '100%',
                    cursor: 'pointer',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>🚀</span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Email Campaigns</h3>
                    </div>
                    <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>Generate more reviews</p>
                    <div style={{ marginTop: 'auto', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Launch Campaign →</div>
                  </BlockStack>
                </div>

                {/* IMPORT CARD */}
                <div
                  onClick={() => navigate("/app/import")}
                  style={{
                    background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    color: 'white',
                    height: '100%',
                    cursor: 'pointer',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>📥</span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Import Reviews</h3>
                    </div>
                    <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>Migrate from CSV</p>
                    <div style={{ marginTop: 'auto', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Upload CSV →</div>
                  </BlockStack>
                </div>

                {/* CONFIGURATION CARD */}
                <div
                  onClick={() => navigate("/app/settings")}
                  style={{
                    background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    color: 'white',
                    height: '100%',
                    cursor: 'pointer',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>⚙️</span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Configuration</h3>
                    </div>
                    <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>Widget & Email settings</p>
                    <div style={{ marginTop: 'auto', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Manage</div>
                  </BlockStack>
                </div>

                {/* AI INSIGHTS CARD */}
                <div
                  onClick={() => navigate("/app/insights")}
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    color: 'white',
                    height: '100%',
                    cursor: 'pointer',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {planName !== "EMPIRE_PRO" && <div className="pro-badge-floating">PRO</div>}
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>🤖</span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>AI Insights</h3>
                    </div>

                    {planName === "EMPIRE_PRO" ? (
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                          {insights?.label || "Insights"}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <div key={s} style={{
                              width: '20px', height: '6px',
                              background: s <= Math.round(insights?.score || 0) ? 'white' : 'rgba(255,255,255,0.3)',
                              borderRadius: '4px'
                            }}></div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>
                          ✅ Sentiment is stable.
                        </p>
                        <div style={{ marginTop: 'auto', fontSize: '0.85rem', fontWeight: 600 }}>
                          Click to view report
                        </div>
                      </>
                    )}
                  </BlockStack>
                </div>

                {/* BUSINESS IMPACT CARD */}
                <div
                  onClick={() => navigate("/app/impact")}
                  style={{
                    background: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 100%)',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    color: 'white',
                    height: '100%',
                    cursor: 'pointer',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {planName !== "EMPIRE_PRO" && <div className="pro-badge-floating">PRO</div>}
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>📈</span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Business Impact</h3>
                    </div>

                    {planName === "EMPIRE_PRO" ? (
                      <div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {impact?.formatted || "$0.00"}
                        </div>
                        <p style={{ opacity: 0.8, fontSize: '0.8rem', marginTop: '4px' }}>
                          Revenue affected by reviews
                        </p>
                      </div>
                    ) : (
                      <>
                        <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>AI-driven revenue correlation.</p>
                        <div className="blurred-preview" style={{ marginTop: '6px' }}>
                          <div style={{ height: '28px', display: 'flex', alignItems: 'flex-end', gap: '3px' }}>
                            {[40, 70, 45, 90, 65, 80, 50].map((h, i) => (
                              <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.3)', height: `${h}%`, borderRadius: '2px 2px 0 0' }}></div>
                            ))}
                          </div>
                        </div>
                        <div style={{ marginTop: 'auto', fontSize: '0.85rem', fontWeight: 600 }}>
                          Unlock Analytics →
                        </div>
                      </>
                    )}
                  </BlockStack>
                </div>

              </div>
            </Layout.Section>
          </Layout>

        </BlockStack>
      </Page >
    </div >
  );
}
