import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
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
  const { billing } = await authenticate.admin(request);
  const isPro = await hasActivePayment(request); // Helper import needed? No, handled by copy-paste or just standard check

  // GATE: AI Insights is PRO Only
  if (!isPro) {
    return json({ locked: true, stats: null, urgentReviews: [], topTopics: [] });
  }

  const reviews = await prisma.review.findMany({
    include: { replies: true }
  });
  // ... rest of logic ...
  const positive = reviews.filter(r => r.rating >= 4).length;
  // ... (Abbreviated for tool call, assuming standard logic remains if !locked)
  // Re-implementing the stats logic for the ELSE block
  const neutral = reviews.filter(r => r.rating === 3).length;
  const negative = reviews.filter(r => r.rating <= 2).length;
  const total = reviews.length;
  const urgentReviews = reviews
    .filter(r => r.rating <= 2 && r.replies.length === 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Simple NLP
  const stopWords = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'it', 'for', 'is', 'was', 'with', 'on', 'my', 'i', 'very', 'really', 'so', 'but']);
  const words: Record<string, number> = {};
  reviews.forEach(r => {
    if (r.body) {
      const tokens = r.body.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
      tokens.forEach(t => { if (t.length > 3 && !stopWords.has(t)) words[t] = (words[t] || 0) + 1; });
    }
  });
  const topTopics = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic, count]) => ({ topic, count }));

  return json({ locked: false, stats: { positive, neutral, negative, total }, urgentReviews, topTopics });
};

export default function InsightsPage() {
  const { locked, stats, urgentReviews } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher(); // For upgrade action, if needed

  if (locked) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        padding: '2rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* IMMERSIVE BLURRED BACKGROUND (Curiosity Gap) */}
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          filter: 'blur(12px)',
          transform: 'scale(1.1)',
          pointerEvents: 'none',
          overflow: 'hidden'
        }}>
          {/* Sentiment Blobs */}
          <div style={{ position: 'absolute', top: '10%', left: '5%', width: '150px', height: '150px', background: 'rgba(99, 102, 241, 0.3)', borderRadius: '50%', filter: 'blur(20px)' }}></div>
          <div style={{ position: 'absolute', top: '15%', right: '10%', width: '120px', height: '120px', background: 'rgba(168, 85, 247, 0.3)', borderRadius: '50%', filter: 'blur(15px)' }}></div>
          <div style={{ position: 'absolute', bottom: '20%', left: '15%', width: '200px', height: '200px', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '50%', filter: 'blur(25px)' }}></div>

          {/* Varied Data Previews */}
          <div style={{ padding: '60px', display: 'flex', flexDirection: 'column', gap: '80px', height: '100%' }}>
            <div style={{ display: 'flex', gap: '40px', justifyContent: 'space-around' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ width: '180px', height: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}></div>
              ))}
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px', padding: '0 40px' }}>
              {/* Dynamic Bar Chart Tease */}
              <div style={{ flex: 1, height: '300px', display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                {[40, 70, 45, 90, 60, 100, 55, 80, 50, 95, 35, 75, 40, 85].map((h, i) => (
                  <div key={i} style={{
                    flex: 1,
                    height: `${h}%`,
                    background: i % 3 === 0 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(99, 102, 241, 0.4)',
                    borderRadius: '8px',
                    opacity: 0.8 - (i * 0.02)
                  }}></div>
                ))}
              </div>

              {/* Circular Metric Tease */}
              <div style={{ width: '200px', height: '200px', border: '15px solid rgba(99, 102, 241, 0.2)', borderRadius: '50%', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: -15, border: '15px solid rgba(168, 85, 247, 0.4)', borderRadius: '50%', borderBottomColor: 'transparent', borderLeftColor: 'transparent' }}></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
              <div style={{ width: '40%', height: '100px', background: 'linear-gradient(90deg, rgba(255,255,255,0.05), transparent)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}></div>
              <div style={{ width: '30%', height: '100px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}></div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '32px',
          boxShadow: '0 50px 100px -20px rgba(0, 0, 0, 0.5)',
          width: '100%',
          maxWidth: '900px', // Horizontal 16:9 focus
          aspectRatio: '16 / 9',
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 10,
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {/* LEFT: VISUAL TEASE */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(225deg, #1e293b 0%, #0f172a 100%)',
            padding: '3rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative'
          }}>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{
                width: '64px',
                height: '64px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 20px rgba(99, 102, 241, 0.3)'
              }}>
                <LockIcon style={{ width: 32, color: 'white' }} />
              </div>
            </div>
            <BlockStack gap="400">
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', lineHeight: 1.1 }}>
                Unlock AI <br /> Intelligence 🧠
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '1.2rem', lineHeight: '1.5' }}>
                Don't leave revenue on the table. AI has identified <strong>critical trends</strong> in your customer feedback.
              </p>
            </BlockStack>

            {/* FLOATING DECORATION */}
            <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)', borderRadius: '50%' }}></div>
          </div>

          {/* RIGHT: CONVERSION CONTENT */}
          <div style={{
            width: '45%',
            padding: '3rem',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <BlockStack gap="600">
              <BlockStack gap="400">
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ background: '#f0fdf4', color: '#22c55e', padding: '8px', borderRadius: '50%', display: 'flex', boxShadow: '0 4px 10px rgba(34, 197, 94, 0.2)' }}><span style={{ fontSize: '16px', fontWeight: 900 }}>✓</span></div>
                  <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Sentiment Map</span>
                </div>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ background: '#f0fdf4', color: '#22c55e', padding: '8px', borderRadius: '50%', display: 'flex', boxShadow: '0 4px 10px rgba(34, 197, 94, 0.2)' }}><span style={{ fontSize: '16px', fontWeight: 900 }}>✓</span></div>
                  <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Urgency Detection</span>
                </div>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ background: '#f0fdf4', color: '#22c55e', padding: '8px', borderRadius: '50%', display: 'flex', boxShadow: '0 4px 10px rgba(34, 197, 94, 0.2)' }}><span style={{ fontSize: '16px', fontWeight: 900 }}>✓</span></div>
                  <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Keyword Analytics</span>
                </div>
              </BlockStack>

              <BlockStack gap="300">
                <form action="/app/settings" method="post" style={{ width: '100%' }}>
                  <input type="hidden" name="intent" value="upgrade" />
                  <button style={{
                    background: 'linear-gradient(to right, #6366f1, #a855f7)',
                    color: 'white',
                    padding: '1.25rem',
                    width: '100%',
                    border: 'none',
                    borderRadius: '16px',
                    fontSize: '1.2rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 20px 30px -5px rgba(99, 102, 241, 0.5)',
                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}>
                    Unlock Pro Stats — $9.99/mo 🚀
                  </button>
                </form>
                <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>
                  Risk-free • Cancel anytime
                </div>
              </BlockStack>
              <button
                onClick={() => navigate("/app")}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}
              >
                Maybe later
              </button>
            </BlockStack>
          </div>
        </div>
      </div>
    );
  }

  // Percentage Calculations (Safe)
  const safeStats = stats || { positive: 0, neutral: 0, negative: 0, total: 0 };
  const safeReviews = urgentReviews || [];

  const posPct = safeStats.total > 0 ? (safeStats.positive / safeStats.total) * 100 : 0;
  const neuPct = safeStats.total > 0 ? (safeStats.neutral / safeStats.total) * 100 : 0;
  const negPct = safeStats.total > 0 ? (safeStats.negative / safeStats.total) * 100 : 0;

  return (
    <div className="empire-insights">
      <style>{`
            .empire-insights {
                --empire-primary: #0f172a;
                --empire-surface: #ffffff;
                font-family: 'Inter', sans-serif;
            }
            .insight-hero {
                background: linear-gradient(135deg, #a855f7 0%, #d946ef 100%);
                color: white;
                padding: 3rem 2rem;
                border-radius: 16px;
                margin-bottom: 2rem;
                position: relative;
                overflow: hidden;
            }
            .insight-card {
                background: white;
                padding: 1.5rem;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            }
            .sentiment-bar { height: 24px; border-radius: 12px; overflow: hidden; display: flex; width: 100%; margin: 1rem 0; background: #f1f5f9; }
            .sentiment-segment { height: 100%; transition: width 0.5s ease; }
            .urgent-item {
                background: #fff1f2;
                border-left: 4px solid #f43f5e;
                padding: 1rem;
                border-radius: 0 8px 8px 0;
                margin-bottom: 1rem;
            }
        `}</style>

      <Page fullWidth>
        <BlockStack gap="600">
          {/* HERO */}
          <div className="insight-hero">
            <BlockStack gap="400">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Button icon={ArrowLeftIcon} onClick={() => navigate("/app")} variant="plain" />
                  <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>AI Sentiment Analysis 🧠</h1>
                </div>
                {/* SYNC BUTTON */}
                <fetcher.Form method="post" action="/api/orders/sync">
                  <Button
                    submit
                    loading={fetcher.state === "submitting"}
                    variant="primary"
                    tone="critical"
                  >
                    Sync Historical Data
                  </Button>
                </fetcher.Form>
              </div>
              <p style={{ fontSize: '1.1rem', opacity: 0.9, maxWidth: '600px' }}>
                We analyzed <strong>{safeStats.total} reviews</strong>. Your customers are mostly
                <strong> {posPct > 50 ? "Delighted 😍" : "Neutral 😐"}</strong>.
              </p>
              {fetcher.data && (
                <Text as="p" tone="success">
                  ✅ Synced {(fetcher.data as any).count} orders! Refresh to see impact.
                </Text>
              )}
            </BlockStack>
          </div>

          <Layout>
            {/* LEFT: VISUALIZATION */}
            <Layout.Section>
              <div className="insight-card">
                <Text as="h3" variant="headingMd">Sentiment Distribution</Text>

                {/* THE BIG BAR */}
                <div className="sentiment-bar">
                  <div className="sentiment-segment" style={{ width: `${posPct}%`, background: '#22c55e' }}></div>
                  <div className="sentiment-segment" style={{ width: `${neuPct}%`, background: '#f59e0b' }}></div>
                  <div className="sentiment-segment" style={{ width: `${negPct}%`, background: '#ef4444' }}></div>
                </div>

                {/* LEGEND */}
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4 }}>
                    <BlockStack>
                      <Text as="h4" variant="bodyMd" fontWeight="bold">Positive ({Math.round(posPct)}%)</Text>
                      <Text as="p" tone="subdued">{safeStats.positive} Happy Customers</Text>
                    </BlockStack>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4 }}>
                    <BlockStack>
                      <Text as="h4" variant="bodyMd" fontWeight="bold">Neutral ({Math.round(neuPct)}%)</Text>
                      <Text as="p" tone="subdued">{safeStats.neutral} Mixed Reviews</Text>
                    </BlockStack>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4 }}>
                    <BlockStack>
                      <Text as="h4" variant="bodyMd" fontWeight="bold">Negative ({Math.round(negPct)}%)</Text>
                      <Text as="p" tone="subdued">{safeStats.negative} At Risk</Text>
                    </BlockStack>
                  </Grid.Cell>
                </Grid>
              </div>
            </Layout.Section>

            {/* RIGHT: URGENT ISSUES */}
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <div className="insight-card" style={{ borderTop: '4px solid #f43f5e' }}>
                  <Text as="h3" variant="headingMd" tone="critical">🔥 Firefighting (Urgent)</Text>
                  <Box paddingBlockStart="400">
                    {safeReviews.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem 0', color: '#10b981' }}>
                        <Text as="h1" variant="headingXl">🎉</Text>
                        <Text as="p" fontWeight="bold">Zero Critical Issues</Text>
                        <Text as="p" tone="subdued">You are doing great!</Text>
                      </div>
                    ) : (
                      safeReviews.map(r => (
                        <div key={r?.id} className="urgent-item">
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text as="span" fontWeight="bold">{r?.customerName || "Customer"}</Text>
                              <Badge tone="critical">{`${r?.rating || 0} Stars`}</Badge>
                            </InlineStack>
                            <Text as="p" truncate>{r?.body || ""}</Text>
                            <Button size="micro" onClick={() => navigate("/app/reviews")}>Reply Now</Button>
                          </BlockStack>
                        </div>
                      ))
                    )}
                  </Box>
                </div>
              </BlockStack>
            </Layout.Section>
          </Layout>

        </BlockStack>
      </Page>
    </div>
  );
}
