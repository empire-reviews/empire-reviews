import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
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
import { useState, useEffect, useRef } from "react";

// Fire-and-forget presence ping to /api/support. App Bridge injects the session
// token into same-origin fetches, so this authenticates as the owner without a
// useFetcher (which would needlessly revalidate this whole page every few sec).
function pingPresence(typingShop?: string) {
    try {
        fetch("/api/support", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(typingShop ? { intent: "owner_presence", typingShop } : { intent: "owner_presence" }),
        }).catch(() => { });
    } catch { /* never let presence break the page */ }
}

const STOPWORDS = new Set([
    "the", "a", "an", "to", "of", "in", "on", "is", "it", "this", "that", "i", "my", "me",
    "how", "do", "does", "can", "what", "where", "when", "why", "and", "or", "for", "with",
    "you", "your", "we", "us", "our", "app", "empire", "reviews", "review", "are", "be",
    "have", "has", "get", "got", "not", "no", "yes", "please", "help", "need", "want", "use",
    "there", "their", "they", "from", "about", "if", "so", "but", "as", "at", "by", "all",
]);

// This whole page manages the support bot's GLOBAL brain + analytics — it is an
// Empire operator tool, NOT a merchant feature. Only the owner store may access it.
function assertOwner(shop: string) {
    const ownerShop = (process.env.OWNER_SHOP || "").trim();
    if (!ownerShop || shop !== ownerShop) {
        throw redirect("/app");
    }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    assertOwner(session.shop);

    let logs: any[] = [];
    let learned: any[] = [];
    let dbError = false;
    try {
        // Owner view = ALL merchants' conversations (cross-merchant product intel).
        [logs, learned] = await Promise.all([
            prisma.supportLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
            prisma.learnedAnswer.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
        ]);
    } catch (e) {
        console.error("[support page] query failed:", (e as Error).message);
        dbError = true;
    }

    // Direct messages (merchant ↔ team). Separate try so a not-yet-migrated
    // SupportMessage table can't break the rest of the panel.
    let dmRows: any[] = [];
    try {
        dmRows = await prisma.supportMessage.findMany({
            orderBy: { createdAt: "asc" },
            take: 1000,
            select: { id: true, shop: true, sender: true, body: true, readAt: true, createdAt: true },
        });
    } catch (e) {
        console.error("[support page] messages query failed (table may be pending migration):", (e as Error).message);
    }
    // Group into per-shop threads, newest-active first, with an unread count
    // (merchant messages the team hasn't read yet).
    const threadMap = new Map<string, any>();
    for (const m of dmRows) {
        if (!threadMap.has(m.shop)) threadMap.set(m.shop, { shop: m.shop, messages: [], unread: 0, lastAt: m.createdAt });
        const t = threadMap.get(m.shop);
        t.messages.push({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt });
        if (m.sender === "merchant" && !m.readAt) t.unread += 1;
        t.lastAt = m.createdAt;
    }
    // Only show threads that escalated to a human (Astra-handled chats stay out
    // of the inbox). Matches the /api/support owner_threads poll.
    let humanShops = new Set<string>();
    try {
        const ts = await prisma.supportThread.findMany({ where: { status: "human" }, select: { shop: true } });
        humanShops = new Set(ts.map((t) => t.shop));
    } catch { /* table may be pending migration — show none rather than all */ }
    const threads = Array.from(threadMap.values())
        .filter((t) => humanShops.has(t.shop))
        .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

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
        .map((l) => ({ id: l.id, shop: l.shop, question: l.question, answer: l.answer, helpful: l.helpful, escalated: l.escalated, createdAt: l.createdAt }));

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
        threads,
        stats: { total, aiAnswered, escalated, up, down, helpfulPct, learnedCount: learned.length },
        gaps,
        learned: learned.map((l) => ({ id: l.id, question: l.question, answer: l.answer, keywords: l.keywords, active: l.active })),
        topTopics,
        recent: logs.slice(0, 60).map((l) => ({
            id: l.id, shop: l.shop, question: l.question, answer: l.answer,
            usedAi: l.usedAi, learned: l.learned, escalated: l.escalated, helpful: l.helpful, createdAt: l.createdAt,
        })),
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    assertOwner(session.shop); // never let a non-owner shop teach/edit/delete the global brain
    const fd = await request.formData();
    const intent = fd.get("intent");

    if (intent === "reply_message") {
        const shop = ((fd.get("shop") as string) || "").trim();
        const body = ((fd.get("body") as string) || "").trim().slice(0, 2000);
        if (!shop || !body) return json({ ok: false, error: "Message is required" });
        await prisma.supportMessage.create({ data: { shop, sender: "team", body } });
        // Mark this shop's merchant messages as read now that we've replied.
        await prisma.supportMessage.updateMany({
            where: { shop, sender: "merchant", readAt: null },
            data: { readAt: new Date() },
        });
        return json({ ok: true });
    }

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
                <InlineStack gap="200" blockAlign="center">
                    {gap.helpful === false && <Badge tone="critical">👎 Not helpful</Badge>}
                    {gap.escalated && <Badge tone="attention">Escalated</Badge>}
                    <Text as="span" variant="bodySm" tone="subdued">{gap.shop} · {new Date(gap.createdAt).toLocaleString()}</Text>
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

function MessageThread({ thread }: { thread: any }) {
    const fetcher = useFetcher();
    const [reply, setReply] = useState("");
    const busy = fetcher.state !== "idle";
    const sent = (fetcher.data as any)?.ok;
    const lastTypeRef = useRef(0);

    // As the owner types, signal "typing" to this specific merchant (throttled
    // to ~once/1.8s so the widget can show the typing dots within its 3s poll).
    const onReplyChange = (val: string) => {
        setReply(val);
        const now = Date.now();
        if (val && now - lastTypeRef.current > 1800) {
            lastTypeRef.current = now;
            pingPresence(thread.shop);
        }
    };

    return (
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" fontWeight="semibold">{thread.shop}</Text>
                    {thread.unread > 0 && <Badge tone="attention">{`${thread.unread} new`}</Badge>}
                </InlineStack>
                <BlockStack gap="150">
                    {thread.messages.map((m: any) => (
                        <Box key={m.id} padding="200" borderRadius="200"
                            background={m.sender === "team" ? "bg-surface-success" : "bg-surface"}>
                            <BlockStack gap="050">
                                <Text as="span" variant="bodySm" tone="subdued">
                                    {m.sender === "team" ? "You (Empire)" : thread.shop} · {new Date(m.createdAt).toLocaleString()}
                                </Text>
                                <Text as="p">{m.body}</Text>
                            </BlockStack>
                        </Box>
                    ))}
                </BlockStack>
                <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="reply_message" />
                    <input type="hidden" name="shop" value={thread.shop} />
                    <BlockStack gap="200">
                        <TextField label="Reply" labelHidden multiline={2} name="body" autoComplete="off"
                            value={reply} onChange={onReplyChange} placeholder={`Reply to ${thread.shop}…`} />
                        <InlineStack gap="200" blockAlign="center">
                            <Button variant="primary" loading={busy} disabled={!reply.trim()}
                                onClick={() => {
                                    const body = reply.trim();
                                    if (!body) return;
                                    // Single submission only — NOT a submit-type button, so the
                                    // form doesn't also fire a native submit with an emptied field.
                                    fetcher.submit(
                                        { intent: "reply_message", shop: thread.shop, body },
                                        { method: "post" }
                                    );
                                    setReply("");
                                }}>
                                Send reply
                            </Button>
                            {sent && <Text as="span" variant="bodySm" tone="success">Sent ✓</Text>}
                        </InlineStack>
                    </BlockStack>
                </fetcher.Form>
            </BlockStack>
        </Box>
    );
}

export default function SupportPage() {
    const { stats, gaps, learned, topTopics, recent, dbError, threads } = useLoaderData<typeof loader>();

    // Heartbeat: while this owner panel is open, mark the team "Online" in the
    // merchant widget (a ping every 5s; the widget treats <35s as online).
    useEffect(() => {
        pingPresence();
        const id = setInterval(() => pingPresence(), 5000);
        return () => clearInterval(id);
    }, []);

    // Live threads: poll every 5s so new INCOMING merchant messages appear
    // without reloading the page. Seeded from the loader; kept in sync after a
    // reply revalidates. Uses a raw fetch (App Bridge adds auth) to avoid the
    // loader re-running on every poll.
    const [liveThreads, setLiveThreads] = useState(threads);
    useEffect(() => { setLiveThreads(threads); }, [threads]);
    useEffect(() => {
        let active = true;
        const poll = () => {
            fetch("/api/support", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ intent: "owner_threads" }),
            })
                .then((r) => r.json())
                .then((d) => { if (active && d && Array.isArray(d.threads)) setLiveThreads(d.threads); })
                .catch(() => { });
        };
        const id = setInterval(poll, 5000);
        return () => { active = false; clearInterval(id); };
    }, []);

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

                {/* Direct messages — merchant ↔ team inbox */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text as="h2" variant="headingMd">Messages ({liveThreads.length})</Text>
                                <Text as="span" variant="bodySm" tone="subdued">Replies show up in the merchant's support widget</Text>
                            </InlineStack>
                            {liveThreads.length === 0 ? (
                                <Text as="p" tone="subdued">No merchant messages yet. When a merchant sends one from the support widget, the thread appears here to reply.</Text>
                            ) : (
                                <BlockStack gap="300">
                                    {liveThreads.map((t) => <MessageThread key={t.shop} thread={t} />)}
                                </BlockStack>
                            )}
                        </BlockStack>
                    </Card>
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
                                                <Text as="span" variant="bodySm" tone="subdued">{r.shop} · {new Date(r.createdAt).toLocaleString()}</Text>
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
