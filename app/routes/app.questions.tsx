import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Badge,
    Button,
    InlineStack,
    BlockStack,
    Text,
    TextField,
    Box,
    EmptyState,
    Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") || "pending";

    const where: any = { shop: session.shop };
    if (statusFilter !== "all") where.status = statusFilter;

    const [questions, pendingCount] = await Promise.all([
        prisma.question.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: { answers: { orderBy: { createdAt: "asc" } } },
            take: 100,
        }),
        prisma.question.count({ where: { shop: session.shop, status: "pending" } }),
    ]);

    return json({ questions, pendingCount, statusFilter });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const questionId = formData.get("questionId") as string;

    // Always re-scope by shop so a merchant can never mutate another shop's Q&A
    // even if a questionId is forged.
    const owned = questionId
        ? await prisma.question.findFirst({ where: { id: questionId, shop: session.shop }, select: { id: true } })
        : null;

    if ((intent === "approve" || intent === "reject" || intent === "delete" || intent === "answer") && !owned) {
        return json({ error: "Question not found" }, { status: 404 });
    }

    if (intent === "approve") {
        await prisma.question.update({ where: { id: questionId }, data: { status: "approved" } });
        return json({ success: true });
    }
    if (intent === "reject") {
        await prisma.question.update({ where: { id: questionId }, data: { status: "rejected" } });
        return json({ success: true });
    }
    if (intent === "delete") {
        await prisma.question.delete({ where: { id: questionId } });
        return json({ success: true });
    }
    if (intent === "answer") {
        const body = ((formData.get("body") as string) || "").trim();
        if (!body) return json({ error: "Answer cannot be empty" }, { status: 400 });
        if (body.length > 2000) return json({ error: "Answer too long" }, { status: 400 });
        // Posting an official answer also approves the question so it goes live.
        await prisma.$transaction([
            prisma.answer.create({
                data: { questionId, body, author: "Store", isMerchant: true, status: "approved" },
            }),
            prisma.question.update({ where: { id: questionId }, data: { status: "approved" } }),
        ]);
        return json({ success: true });
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

function QuestionCard({ q }: { q: any }) {
    const fetcher = useFetcher<typeof action>();
    const [answer, setAnswer] = useState("");
    const busy = fetcher.state !== "idle";

    const statusTone =
        q.status === "approved" ? "success" : q.status === "rejected" ? "critical" : "attention";

    return (
        <Card>
            <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                    <Badge tone={statusTone as any}>{q.status}</Badge>
                    <Text as="span" variant="bodySm" tone="subdued">
                        {new Date(q.createdAt).toLocaleDateString()}
                    </Text>
                </InlineStack>

                <Text as="p" variant="bodyLg" fontWeight="semibold">
                    Q: {q.body}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                    {q.customerName || "Anonymous"}
                    {q.productId ? " · product question" : " · store question"}
                </Text>

                {q.answers && q.answers.length > 0 && (
                    <Box paddingInlineStart="400">
                        <BlockStack gap="200">
                            {q.answers.map((a: any) => (
                                <Box key={a.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                                    <Text as="p" variant="bodyMd">
                                        A: {a.body}
                                    </Text>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                        {a.author || "Store"} {a.isMerchant ? "(official)" : ""}
                                    </Text>
                                </Box>
                            ))}
                        </BlockStack>
                    </Box>
                )}

                <fetcher.Form method="post">
                    <input type="hidden" name="questionId" value={q.id} />
                    <BlockStack gap="200">
                        <TextField
                            label="Answer this question"
                            labelHidden
                            value={answer}
                            onChange={setAnswer}
                            multiline={2}
                            autoComplete="off"
                            placeholder="Write an official answer…"
                            name="body"
                        />
                        <InlineStack gap="200">
                            <Button
                                submit
                                variant="primary"
                                disabled={busy || !answer.trim()}
                                onClick={() => {
                                    const fd = new FormData();
                                    fd.append("intent", "answer");
                                    fd.append("questionId", q.id);
                                    fd.append("body", answer);
                                    fetcher.submit(fd, { method: "post" });
                                    setAnswer("");
                                }}
                            >
                                Answer & publish
                            </Button>
                            {q.status !== "approved" && (
                                <Button
                                    disabled={busy}
                                    onClick={() => fetcher.submit({ intent: "approve", questionId: q.id }, { method: "post" })}
                                >
                                    Approve
                                </Button>
                            )}
                            {q.status !== "rejected" && (
                                <Button
                                    disabled={busy}
                                    onClick={() => fetcher.submit({ intent: "reject", questionId: q.id }, { method: "post" })}
                                >
                                    Reject
                                </Button>
                            )}
                            <Button
                                tone="critical"
                                disabled={busy}
                                onClick={() => fetcher.submit({ intent: "delete", questionId: q.id }, { method: "post" })}
                            >
                                Delete
                            </Button>
                        </InlineStack>
                    </BlockStack>
                </fetcher.Form>
            </BlockStack>
        </Card>
    );
}

export default function QuestionsPage() {
    const { questions, pendingCount, statusFilter } = useLoaderData<typeof loader>();
    const filterFetcher = useFetcher();

    return (
        <Page
            title="Questions & Answers"
            subtitle={pendingCount > 0 ? `${pendingCount} awaiting moderation` : "All caught up"}
        >
            <Layout>
                <Layout.Section>
                    <Box paddingBlockEnd="400">
                        <Select
                            label="Filter"
                            labelInline
                            options={[
                                { label: "Pending", value: "pending" },
                                { label: "Approved", value: "approved" },
                                { label: "Rejected", value: "rejected" },
                                { label: "All", value: "all" },
                            ]}
                            value={statusFilter}
                            onChange={(v) => filterFetcher.load(`/app/questions?status=${v}`)}
                        />
                    </Box>

                    {questions.length === 0 ? (
                        <Card>
                            <EmptyState
                                heading="No questions here"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>When shoppers ask questions on your storefront, they show up here for you to answer.</p>
                            </EmptyState>
                        </Card>
                    ) : (
                        <BlockStack gap="400">
                            {questions.map((q: any) => (
                                <QuestionCard key={q.id} q={q} />
                            ))}
                        </BlockStack>
                    )}
                </Layout.Section>
            </Layout>
        </Page>
    );
}
