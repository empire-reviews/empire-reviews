import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Text,
    Badge,
    Button,
    BlockStack,
    InlineStack,
    Box,
    EmptyState,
    InlineGrid,
    TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState } from "react";

const STOPWORDS = new Set([
    "the", "a", "an", "to", "of", "in", "on", "is", "it", "this", "that", "i", "my", "me",
    "how", "do", "does", "can", "what", "where", "when", "why", "and", "or", "for", "with",
    "you", "your", "we", "us", "our", "app", "empire", "reviews", "review", "are", "be",
    "have", "has", "get", "got", "not", "no", "yes", "please", "help", "need", "want", "use",
    "there", "their", "they", "from", "about", "if", "so", "but", "as", "at", "by", "all",
]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    let logs: any[] = [];
    let learned: any[] = [];
    let dbError = false;
    try {
        [logs, learned] = await Promise.all([
            prisma.supportLog.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 300 }),
            prisma.learnedAnswer.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
        ]);
    } catch (e) {
        console.error("[support page] query failed:", (e as Error).message);
        dbError = true;
    }

    const total = logs.length;
    const aiAnswered = logs.filter((l) => l.usedAi).length;
    const escalated = logs.filter((l) => l.escalated).length;
    const up = logs.filter((l) => l.helpful === true).length;
    const down = logs.filter((l) => l.helpful === false).length;
    const rated = up + down;
    const helpfulPct = rated > 0 ? Math.round((up / rated) * 100) : null;

    // Gaps = the bot's "mistakes": thumbs-down OR escalated, not yet taught.
    const gaps = logs
        .filter((l) => (l.helpful === false || l.escalated) && !l.taught)
        .slice(0, 40)
        .map((l) => ({ id: l.id, question: l.question, answer: l.answer, helpful: l.helpful, escalated: l.escalated, createdAt: l.createdAt }));

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
    const topTopics = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).filter(([, c]) => c > 1);

    return json({
        dbError,
        stats: { total, aiAnswered, escalated, up, down, helpfulPct, learnedCount: learned.length },
        gaps,
        learned: learned.map((l) => ({ id: l.id, question: l.question, answer: l.answer, keywords: l.keywords, active: l.active })),
        topTopics,
        recent: logs.slice(0, 50).map((l) => ({
            id: l.id, question: l.question, answer: l.answer,
            usedAi: l.usedAi, learned: l.learned, escalated: l.escalated, helpful: l.helpful, createdAt: l.createdAt,
        })),
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await authenticate.admin(request);
    const fd = await request.formData();
    const intent = fd.get("intent");

    if (intent === "teach") {
        const question = ((fd.get("question") as string) || "").trim();
        const answer = ((fd.get("answer") as string) || "").trim();
        const keywords = ((fd.get("keywords") as string) || "").trim();
        const sourceLogId = (fd.get("sourceLogId") as string) || "";
        if (!answer) return json({ ok: false, error: "Answer is required" });
        await prisma.learnedAnswer.create({
            data: { question: question || answer.slice(0, 80), answer, keywords },
        });
        if (sourceLogId) {
            await prisma.supportLog.updateMany({ where: { id: sourceLogId }, data: { taught: true } });
        }
        return json({ ok: true, taught: true });
    }
    if (intent === "edit_learned") {
        const id = fd.get("id") as string;
        const answer = ((fd.get("answer") as string) || "").trim();
        const keywords = ((fd.get("keywords") as string) || "").trim();
        const question = ((fd.get("question") as string) || "").trim();
        if (!id || !answer) return json({ ok: false, error: "Answer is required" });
        await prisma.learnedAnswer.update({ where: { id }, data: { answer, keywords, question } });
        return json({ ok: true });
    }
    if (intent === "toggle_learned") {
        const id = fd.get("id") as string;
        const active = fd.get("active") === "true";
        await prisma.learnedAnswer.update({ where: { id }, data: { active } });
        return json({ ok: true });
    }
    if (intent === "delete_learned") {
        const id = fd.get("id") as string;
        await prisma.learnedAnswer.delete({ where: { id } });
        return json({ ok: true });
    }
    return json({ ok: false });
};

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <Card>
            <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">{String(value)}</Text>
            </BlockStack>
        </Card>
    );
}

function GapCard({ gap }: { gap: any }) {
    const fetcher = useFetcher();
    const [teaching, setTeaching] = useState(false);
    const [answer, setAnswer] = useState("");
    const [keywords, setKeywords] = useState("");
    const busy = fetcher.state !== "idle";

    return (
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200">
                <InlineStack gap="200">
                    {gap.helpful === false && <Badge tone="critical">👎 Not helpful</Badge>}
                    {gap.escalated && <Badge tone="attention">Escalated</Badge>}
                    <Text as="span" variant="bodySm" tone="subdued">{new Date(gap.createdAt).toLocaleString()}</Text>
                </InlineStack>
                <Text as="p" fontWeight="semibold">Q: {gap.question}</Text>
                <Text as="p" tone="subdued" variant="bodySm">Bot said: {gap.answer}</Text>

                {!teaching ? (
                    <InlineStack>
                        <Button variant="primary" onClick={() => { setTeaching(true); setAnswer(""); setKeywords(""); }}>
                            Teach the bot the right answer
                        </Button>
                    </InlineStack>
                ) : (
                    <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="teach" />
                        <input type="hidden" name="sourceLogId" value={gap.id} />
                        <input type="hidden" name="question" value={gap.question} />
                        <BlockStack gap="200">
                            <TextField label="Correct answer (the bot will reuse this)" labelHidden multiline={3}
                                value={answer} onChange={setAnswer} name="answer" autoComplete="off"
                                placeholder="Write the answer the bot should give next time…" />
                            <TextField label="Match keywords (comma-separated)" value={keywords} onChange={setKeywords} name="keywords"
                                autoComplete="off" placeholder="e.g. refund, cancel, money back"
                                helpText="When a future question contains any of these words, the bot uses this answer." />
                            <InlineStack gap="200">
                                <Button submit variant="primary" loading={busy} disabled={!answer.trim()}
                                    onClick={() => {
                                        const f = new FormData();
                                        f.append("intent", "teach"); f.append("sourceLogId", gap.id);
                                        f.append("question", gap.question); f.append("answer", answer); f.append("keywords", keywords);
                                        fetcher.submit(f, { method: "post" });
                                    }}>
                                    Save & teach
                                </Button>
                                <Button onClick={() => setTeaching(false)}>Cancel</Button>
                            </InlineStack>
                        </BlockStack>
                    </fetcher.Form>
                )}
            </BlockStack>
        </Box>
    );
}

function LearnedRow({ item }: { item: any }) {
    const fetcher = useFetcher();
    const [editing, setEditing] = useState(false);
    const [answer, setAnswer] = useState(item.answer);
    const [keywords, setKeywords] = useState(item.keywords || "");
    const busy = fetcher.state !== "idle";

    return (
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                    <Badge tone={item.active ? "success" : undefined}>{item.active ? "Active" : "Off"}</Badge>
                    <InlineStack gap="100">
                        <Button variant="plain" onClick={() => setEditing((e) => !e)}>{editing ? "Close" : "Edit"}</Button>
                        <Button variant="plain" loading={busy}
                            onClick={() => fetcher.submit({ intent: "toggle_learned", id: item.id, active: String(!item.active) }, { method: "post" })}>
                            {item.active ? "Disable" : "Enable"}
                        </Button>
                        <Button variant="plain" tone="critical" loading={busy}
                            onClick={() => fetcher.submit({ intent: "delete_learned", id: item.id }, { method: "post" })}>
                            Delete
                        </Button>
                    </InlineStack>
                </InlineStack>
                <Text as="p" fontWeight="semibold">{item.question}</Text>
                {!editing ? (
                    <>
                        <Text as="p" tone="subdued" variant="bodySm">{item.answer}</Text>
                        {item.keywords && <Text as="span" variant="bodySm" tone="subdued">Keywords: {item.keywords}</Text>}
                    </>
                ) : (
                    <BlockStack gap="200">
                        <TextField label="Answer" multiline={3} value={answer} onChange={setAnswer} autoComplete="off" />
                        <TextField label="Keywords (comma-separated)" value={keywords} onChange={setKeywords} autoComplete="off" />
                        <InlineStack gap="200">
                            <Button variant="primary" loading={busy} disabled={!answer.trim()}
                                onClick={() => {
                                    fetcher.submit({ intent: "edit_learned", id: item.id, question: item.question, answer, keywords }, { method: "post" });
                                    setEditing(false);
                                }}>
                                Save changes
                            </Button>
                            <Button onClick={() => setEditing(false)}>Cancel</Button>
                        </InlineStack>
                    </BlockStack>
                )}
            </BlockStack>
        </Box>
    );
}

export default function SupportPage() {
    const { stats, gaps, learned, topTopics, recent, dbError } = useLoaderData<typeof loader>();

    return (
        <Page
            title="Support & Learning"
            subtitle="See what merchants ask, fix the bot's gaps, and grow its verified answers."
        >
            <Layout>
                {dbError && (
                    <Layout.Section>
                        <Card>
                            <Text as="p" tone="critical">
                                Support data isn't available yet (the database tables haven't been created). It will appear here once set up.
                            </Text>
                        </Card>
                    </Layout.Section>
                )}

                <Layout.Section>
                    <InlineGrid columns={{ xs: 2, sm: 5 }} gap="400">
                        <StatCard label="Total questions" value={stats.total} />
                        <StatCard label="Helpfulness" value={stats.helpfulPct === null ? "—" : `${stats.helpfulPct}%`} />
                        <StatCard label="AI answered" value={stats.aiAnswered} />
                        <StatCard label="Escalated" value={stats.escalated} />
                        <StatCard label="Learned answers" value={stats.learnedCount} />
                    </InlineGrid>
                </Layout.Section>

                {/* Gaps — teach the bot */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text as="h2" variant="headingMd">Teach the bot ({gaps.length})</Text>
                                <Text as="span" variant="bodySm" tone="subdued">Questions the bot got 👎 or had to escalate</Text>
                            </InlineStack>
                            {gaps.length === 0 ? (
                                <Text as="p" tone="subdued">No open gaps — the bot is handling everything so far. 🎉</Text>
                            ) : (
                                <BlockStack gap="300">
                                    {gaps.map((g) => <GapCard key={g.id} gap={g} />)}
                                </BlockStack>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* Learned answers */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text as="h2" variant="headingMd">Learned answers ({learned.length})</Text>
                                <Text as="span" variant="bodySm" tone="subdued">Verified answers the bot reuses for everyone</Text>
                            </InlineStack>
                            {learned.length === 0 ? (
                                <Text as="p" tone="subdued">Nothing taught yet. Use “Teach the bot” above to add the first verified answer.</Text>
                            ) : (
                                <BlockStack gap="300">
                                    {learned.map((l) => <LearnedRow key={l.id} item={l} />)}
                                </BlockStack>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {topTopics.length > 0 && (
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Most-asked topics</Text>
                                <InlineStack gap="200" wrap>
                                    {topTopics.map(([word, count]) => <Badge key={word} tone="info">{`${word} (${count})`}</Badge>)}
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                )}

                <Layout.Section>
                    {recent.length === 0 ? (
                        <Card>
                            <EmptyState heading="No support conversations yet"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                                <p>When customers use the in-app support chat, every question and answer shows up here.</p>
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
                                                <InlineStack gap="100">
                                                    <Badge tone={r.escalated ? "attention" : r.learned ? "success" : r.usedAi ? "info" : undefined}>
                                                        {r.escalated ? "Escalated" : r.learned ? "Learned" : r.usedAi ? "AI" : "FAQ"}
                                                    </Badge>
                                                    {r.helpful === true && <Badge tone="success">👍</Badge>}
                                                    {r.helpful === false && <Badge tone="critical">👎</Badge>}
                                                </InlineStack>
                                                <Text as="span" variant="bodySm" tone="subdued">{new Date(r.createdAt).toLocaleString()}</Text>
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
