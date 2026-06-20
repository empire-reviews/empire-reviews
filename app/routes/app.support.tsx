import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Text,
    Badge,
    BlockStack,
    InlineStack,
    Box,
    EmptyState,
    InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Lightweight stopword list so the "common topics" frequency isn't dominated by
// filler words.
const STOPWORDS = new Set([
    "the", "a", "an", "to", "of", "in", "on", "is", "it", "this", "that", "i", "my", "me",
    "how", "do", "does", "can", "what", "where", "when", "why", "and", "or", "for", "with",
    "you", "your", "we", "us", "our", "app", "empire", "reviews", "review", "are", "be",
    "have", "has", "get", "got", "not", "no", "yes", "please", "help", "need", "want", "use",
    "there", "their", "they", "from", "about", "if", "so", "but", "as", "at", "by", "all",
]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    let logs: Array<{ id: string; question: string; answer: string; usedAi: boolean; escalated: boolean; createdAt: Date }> = [];
    let dbError = false;
    try {
        logs = await prisma.supportLog.findMany({
            where: { shop: session.shop },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
    } catch (e) {
        // Table may not exist yet (migration not applied) — degrade to empty state.
        console.error("[support page] SupportLog query failed:", (e as Error).message);
        dbError = true;
    }

    const total = logs.length;
    const aiAnswered = logs.filter((l) => l.usedAi).length;
    const escalated = logs.filter((l) => l.escalated).length;

    // Common topics: word frequency across questions (minus stopwords).
    const freq: Record<string, number> = {};
    for (const l of logs) {
        const words = l.question.toLowerCase().match(/[a-z]{3,}/g) || [];
        const seen = new Set<string>();
        for (const w of words) {
            if (STOPWORDS.has(w) || seen.has(w)) continue;
            seen.add(w);
            freq[w] = (freq[w] || 0) + 1;
        }
    }
    const topTopics = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .filter(([, c]) => c > 1);

    return json({
        dbError,
        stats: { total, aiAnswered, escalated },
        topTopics,
        recent: logs.slice(0, 60).map((l) => ({
            id: l.id,
            question: l.question,
            answer: l.answer,
            usedAi: l.usedAi,
            escalated: l.escalated,
            createdAt: l.createdAt,
        })),
    });
};

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
    return (
        <Card>
            <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">{String(value)}</Text>
                {tone && <Badge tone={tone as any}>{label}</Badge>}
            </BlockStack>
        </Card>
    );
}

export default function SupportPage() {
    const { stats, topTopics, recent, dbError } = useLoaderData<typeof loader>();

    return (
        <Page
            title="Support Inbox"
            subtitle="What your customers ask the in-app support assistant — and where they got stuck."
        >
            <Layout>
                {dbError && (
                    <Layout.Section>
                        <Card>
                            <Text as="p" tone="critical">
                                Support logging isn't active yet (the database table hasn't been created).
                                Conversations will appear here once it's set up.
                            </Text>
                        </Card>
                    </Layout.Section>
                )}

                <Layout.Section>
                    <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                        <StatCard label="Total questions" value={stats.total} />
                        <StatCard label="Answered by AI" value={stats.aiAnswered} />
                        <StatCard label="Escalated to human" value={stats.escalated} />
                    </InlineGrid>
                </Layout.Section>

                {topTopics.length > 0 && (
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Most-asked topics</Text>
                                <InlineStack gap="200" wrap>
                                    {topTopics.map(([word, count]) => (
                                        <Badge key={word} tone="info">{`${word} (${count})`}</Badge>
                                    ))}
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                )}

                <Layout.Section>
                    {recent.length === 0 ? (
                        <Card>
                            <EmptyState
                                heading="No support conversations yet"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>When customers use the in-app support chat (the headset bubble), every question and answer shows up here so you can see what people need.</p>
                            </EmptyState>
                        </Card>
                    ) : (
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">Recent conversations</Text>
                                {recent.map((r) => (
                                    <Box key={r.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                                        <BlockStack gap="150">
                                            <InlineStack align="space-between" blockAlign="center">
                                                <Badge tone={r.escalated ? "attention" : r.usedAi ? "success" : "info"}>
                                                    {r.escalated ? "Escalated" : r.usedAi ? "AI answered" : "FAQ answered"}
                                                </Badge>
                                                <Text as="span" variant="bodySm" tone="subdued">
                                                    {new Date(r.createdAt).toLocaleString()}
                                                </Text>
                                            </InlineStack>
                                            <Text as="p" fontWeight="semibold">Q: {r.question}</Text>
                                            <Text as="p" tone="subdued">A: {r.answer}</Text>
                                        </BlockStack>
                                    </Box>
                                ))}
                            </BlockStack>
                        </Card>
                    )}
                </Layout.Section>
            </Layout>
        </Page>
    );
}
