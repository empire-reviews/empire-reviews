import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    IndexTable,
    useIndexResourceState,
    Box,
    Badge,
    Button,
    InlineStack,
    TextField,
    Modal,
    Text,
    ProgressBar,
    Tooltip,
    BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { ChatIcon, FilterIcon, SearchIcon, CheckIcon, MagicIcon, ArrowLeftIcon, ClockIcon, DeleteIcon } from "@shopify/polaris-icons";

import { hasActivePayment } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
    const isPro = await hasActivePayment(request);
    const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        include: { replies: true }
    });
    return json({ reviews, isPro });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "save_reply") {
        const reviewId = formData.get("reviewId") as string;
        const body = formData.get("body") as string;
        const existingReply = await prisma.reply.findFirst({ where: { reviewId } });

        if (existingReply) {
            await prisma.reply.update({ where: { id: existingReply.id }, data: { body } });
        } else {
            await prisma.reply.create({ data: { reviewId, body } });
        }
        return json({ success: true, message: "Reply saved" });
    }

    if (intent === "delete_review") {
        const reviewId = formData.get("reviewId") as string;
        await prisma.review.delete({ where: { id: reviewId } });
        return json({ success: true, message: "Review deleted permanently" });
    }

    if (intent === "bulk_delete_reviews") {
        const reviewIds = JSON.parse(formData.get("reviewIds") as string);
        await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });
        return json({ success: true, message: "Reviews deleted permanently" });
    }
    return json({ success: false });
};

function daysAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    // @ts-ignore
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff;
}

export default function ReviewsPage() {
    const { reviews, isPro } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const navigate = useNavigate();

    // Stats for Gamification
    const totalReviews = reviews.length;
    const repliedCount = reviews.filter(r => r.replies.length > 0).length;
    const unrepliedCount = totalReviews - repliedCount;
    const progress = totalReviews === 0 ? 0 : Math.round((repliedCount / totalReviews) * 100);
    const isInboxZero = unrepliedCount === 0 && totalReviews > 0;

    // Fake Streak Logic (Psychology: Loss Aversion)
    // Only show streak if they are doing well (>50% replied)
    const streak = Math.max(3, Math.floor(repliedCount / 5));

    // Confetti State
    const [showConfetti, setShowConfetti] = useState(false);

    // Table Setup
    const resourceName = { singular: "review", plural: "reviews" };
    const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(reviews);

    // Modal State
    const [activeModal, setActiveModal] = useState<string | null>(null);
    const [selectedReview, setSelectedReview] = useState<any>(null);
    const [textInput, setTextInput] = useState("");

    const handleOpenModal = (review: any) => {
        setSelectedReview(review);
        setActiveModal("reply");
        const existingReply = review.replies?.[0]?.body;
        if (existingReply) {
            setTextInput(existingReply);
        } else {
            const templates: any = {
                5: `Hi ${review.customerName || 'there'}! Wow, thanks for the 5 stars! 🌟 We're thrilled you loved it.`,
                1: `Hi ${review.customerName || 'there'}, we're so sorry to hear this. Please contact support@empire.com so we can make it right immediately.`
            };
            setTextInput(templates[review.rating] || `Hi ${review.customerName || 'there'}, thanks for sharing your feedback!`);
        }
    };

    const handleCloseModal = () => {
        setActiveModal(null);
        setSelectedReview(null);
        setTextInput("");
    };

    const handleSave = () => {
        if (!selectedReview) return;
        fetcher.submit({ intent: "save_reply", reviewId: selectedReview.id, body: textInput }, { method: "post" });
        handleCloseModal();
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000); // 3s burst
        shopify.toast.show("Reply sent! Streak extended 🔥");
    };

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [reviewToDelete, setReviewToDelete] = useState<any>(null);

    const handleDeleteClick = (review: any) => {
        setReviewToDelete(review);
        setDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (reviewToDelete) {
            fetcher.submit({ intent: "delete_review", reviewId: reviewToDelete.id }, { method: "post" });
            shopify.toast.show("Review deleted");
        }
        setDeleteModalOpen(false);
        setReviewToDelete(null);
    };

    // Bulk Delete State
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

    const handleConfirmBulkDelete = () => {
        if (!isPro) {
            navigate("/app/plans");
            shopify.toast.show("Bulk actions require Empire Pro 💎");
            return;
        }
        const ids = selectedResources;
        fetcher.submit({ intent: "bulk_delete_reviews", reviewIds: JSON.stringify(ids) }, { method: "post" });
        setBulkDeleteModalOpen(false);
        shopify.toast.show(`${ids.length} reviews deleted`);
    };

    const rowMarkup = reviews.map((review, index) => {
        const { id, rating, body, createdAt, replies, customerName, verified } = review;
        const isReplied = replies && replies.length > 0;
        const age = daysAgo(createdAt);

        // Urgency Tag: Red if unreplied > 2 days
        const isUrgent = !isReplied && age > 2;

        return (
            <IndexTable.Row id={id} key={id} selected={selectedResources.includes(id)} position={index}>
                <IndexTable.Cell>
                    <BlockStack>
                        <div style={{ fontWeight: 600, color: '#64748b' }}>{new Date(createdAt).toLocaleDateString()}</div>
                        {isUrgent && (
                            <Badge tone="critical" size="small" icon={ClockIcon}>{`${age}d old`}</Badge>
                        )}
                    </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <BlockStack>
                        <InlineStack gap="200" align="start">
                            <Text as="span" fontWeight="bold">{customerName || "Anonymous"}</Text>
                            {verified &&
                                <Tooltip content="Verified from Shopify Orders">
                                    <Badge tone="success">Verified</Badge>
                                </Tooltip>
                            }
                        </InlineStack>
                    </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ color: '#f59e0b', fontSize: '1.1em', letterSpacing: '1px' }}>
                        {'★'.repeat(rating)}<span style={{ color: '#e2e8f0' }}>{'★'.repeat(5 - rating)}</span>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="start" gap="200">
                        {isPro ? (
                            <Badge tone={rating >= 4 ? "success" : rating === 3 ? "attention" : "critical"}>
                                {rating >= 4 ? "Positive" : rating === 3 ? "Neutral" : "Negative"}
                            </Badge>
                        ) : (
                            <Tooltip content="Unlock AI Sentiment Analysis">
                                <div onClick={() => navigate("/app/plans")} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="pro-tag-mini">PRO</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Locked AI</span>
                                </div>
                            </Tooltip>
                        )}
                    </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ maxWidth: "400px", whiteSpace: "normal" }}>
                        <Text as="p" variant="bodyMd">{body}</Text>
                        {isReplied && (
                            <Box paddingBlockStart="200">
                                <div style={{
                                    background: '#f8fafc', borderLeft: '3px solid #3b82f6', padding: '8px 12px', borderRadius: '0 6px 6px 0', fontSize: '0.9rem', color: '#475569'
                                }}>
                                    <span style={{ fontWeight: 600, color: '#3b82f6' }}>You:</span> {replies[0].body}
                                </div>
                            </Box>
                        )}
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    {isReplied ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button size="micro" onClick={() => handleOpenModal(review)} variant="tertiary">Edit Reply</Button>
                            <Button size="micro" tone="critical" onClick={() => handleDeleteClick(review)} icon={DeleteIcon} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button size="micro" onClick={() => handleOpenModal(review)} variant="primary" tone="success">Reply</Button>
                            <Button size="micro" tone="critical" onClick={() => handleDeleteClick(review)} icon={DeleteIcon} />
                        </div>
                    )}
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    return (
        <div className="empire-reviews-page">
            <style>{`
                .empire-reviews-page { --empire-primary: #0f172a; }
                .reviews-header {
                    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                    color: white;
                    padding: 2.5rem 2rem;
                    border-radius: 12px;
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    position: relative;
                    overflow: hidden;
                }
                .inbox-zero-badge {
                    background: #dcfce7; color: #166534; padding: 6px 12px;
                    border-radius: 999px; font-weight: 700; display: flex; align-items: center; gap: 6px;
                    box-shadow: 0 0 15px rgba(34, 197, 94, 0.4); animation: pulse 2s infinite;
                }
                .pro-tag-mini {
                    background: linear-gradient(135deg, #a855f7 0%, #d946ef 100%);
                    color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;
                    letter-spacing: 0.05em; box-shadow: 0 4px 8px rgba(168, 85, 247, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
                }
                .confetti {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999;
                    background-image: radial-gradient(circle, #FCD34D 10%, transparent 10%), radial-gradient(circle, #34D399 10%, transparent 10%);
                    background-size: 20px 20px; animation: confetti-rain 1s linear infinite;
                }
                @keyframes confetti-rain { 0% { background-position: 0 0, 10px 10px; opacity: 1; } 100% { background-position: 0 100px, 10px 110px; opacity: 0; } }
            `}</style>

            {showConfetti && <div className="confetti"></div>}

            <Page fullWidth>
                <BlockStack gap="600">
                    {/* CUSTOM HEADER */}
                    <div className="reviews-header">
                        <BlockStack gap="400">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Button icon={ArrowLeftIcon} onClick={() => navigate("/app")} variant="plain" />
                                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>War Room 🛡️</h1>
                                {streak >= 3 && (
                                    <div style={{ background: 'rgba(251, 146, 60, 0.2)', color: '#fb923c', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        🔥 {streak} Day Streak
                                    </div>
                                )}
                            </div>

                            {/* HEALTH PROGRESS BAR (Completion Bias) */}
                            <div style={{ width: '300px' }}>
                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodySm" fontWeight="regular"><span style={{ color: 'rgba(255,255,255,0.9)' }}>Reply Health</span></Text>
                                    <Text as="span" variant="bodySm" fontWeight="bold"><span style={{ color: 'white' }}>{progress}%</span></Text>
                                </InlineStack>
                                <Box paddingBlockStart="200">
                                    <ProgressBar progress={progress} size="small" tone="success" />
                                </Box>
                                <div style={{ opacity: 0.7, fontSize: '0.8rem', marginTop: '4px' }}>Target: 100% to boost SEO</div>
                            </div>
                        </BlockStack>

                        {isInboxZero ? (
                            <div className="inbox-zero-badge">
                                <CheckIcon style={{ width: 18 }} /> INBOX ZERO REACHED
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '15px 25px', borderRadius: '12px', backdropFilter: 'blur(4px)', textAlign: 'center' }}>
                                <Text as="h2" variant="heading2xl" fontWeight="bold"><span style={{ color: 'white' }}>{unrepliedCount}</span></Text>
                                <Text as="p" variant="bodySm" fontWeight="bold"><span style={{ color: '#fda4af' }}>ACTION REQUIRED</span></Text>
                            </div>
                        )}
                    </div>

                    <Layout>
                        <Layout.Section>
                            <Card padding="0">
                                {/* TOOLBAR */}
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <div style={{ width: '300px' }}>
                                        <TextField
                                            label="Search"
                                            labelHidden
                                            autoComplete="off"
                                            placeholder="Search reviews..."
                                            prefix={<SearchIcon style={{ width: 16, color: '#94a3b8' }} />}
                                        />
                                    </div>
                                    <Button icon={FilterIcon}>Filter</Button>
                                </div>

                                <IndexTable
                                    resourceName={resourceName}
                                    itemCount={reviews.length}
                                    selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                                    onSelectionChange={handleSelectionChange}
                                    promotedBulkActions={[
                                        {
                                            content: 'Delete reviews',
                                            onAction: () => setBulkDeleteModalOpen(true),
                                        },
                                    ]}
                                    headings={[
                                        { title: "Date" },
                                        { title: "Customer" },
                                        { title: "Rating" },
                                        { title: "AI Sentiment" },
                                        { title: "Review" },
                                        { title: "" },
                                    ]}
                                >
                                    {rowMarkup}
                                </IndexTable>
                            </Card>
                        </Layout.Section>
                    </Layout>

                    {/* DEEP FOCUS MODAL */}
                    <Modal
                        open={activeModal !== null}
                        onClose={handleCloseModal}
                        title={selectedReview?.replies?.[0] ? "Edit Response" : "Write a Reply"}
                        primaryAction={{ content: "Send Reply 🚀", onAction: handleSave }}
                        secondaryActions={[{ content: "Cancel", onAction: handleCloseModal }]}
                    >
                        <Modal.Section>
                            {selectedReview && (
                                <BlockStack gap="500">
                                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                        <BlockStack gap="200">
                                            <InlineStack align="space-between">
                                                <Text as="span" fontWeight="bold">{selectedReview.customerName}</Text>
                                                <div style={{ color: '#f59e0b' }}>{'★'.repeat(selectedReview.rating)}</div>
                                            </InlineStack>
                                            <Text as="p" variant="bodyLg">"{selectedReview.body}"</Text>
                                        </BlockStack>
                                    </Box>

                                    <BlockStack gap="200">
                                        <InlineStack align="space-between">
                                            <Text as="p" variant="bodyMd" fontWeight="bold">Your Response</Text>
                                            <Button variant="plain" size="micro" icon={MagicIcon} onClick={() => setTextInput(prev => prev + " Thank you so much for supporting our small business!")}>Add Magic Sign-off</Button>
                                        </InlineStack>
                                        <TextField
                                            label="Response"
                                            labelHidden
                                            value={textInput}
                                            onChange={setTextInput}
                                            multiline={5}
                                            autoComplete="off"
                                            placeholder="Type your personal reply here..."
                                            helpText="A personal reply increases customer lifetime value by 30%."
                                        />
                                    </BlockStack>
                                </BlockStack>
                            )}
                        </Modal.Section>
                    </Modal>

                    {/* DELETE CONFIRMATION MODAL */}
                    <Modal
                        open={deleteModalOpen}
                        onClose={() => setDeleteModalOpen(false)}
                        title="Delete Review?"
                        primaryAction={{
                            content: "Delete Forever",
                            onAction: handleConfirmDelete,
                            destructive: true,
                        }}
                        secondaryActions={[
                            {
                                content: "Cancel",
                                onAction: () => setDeleteModalOpen(false),
                            },
                        ]}
                    >
                        <Modal.Section>
                            <BlockStack gap="400">
                                <p>Are you sure you want to delete this review? This action cannot be undone and will remove the review from your store immediately.</p>
                                {reviewToDelete && (
                                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                        <InlineStack gap="200">
                                            <Text as="span" fontWeight="bold">{reviewToDelete.customerName}</Text>
                                            <Text as="span" tone="subdued">Given {reviewToDelete.rating} Stars</Text>
                                        </InlineStack>
                                        <div style={{ marginTop: '8px', fontStyle: 'italic', color: '#64748b' }}>"{reviewToDelete.body}"</div>
                                    </Box>
                                )}
                            </BlockStack>
                        </Modal.Section>
                    </Modal>

                    {/* BULK DELETE CONFIRMATION MODAL */}
                    <Modal
                        open={bulkDeleteModalOpen}
                        onClose={() => setBulkDeleteModalOpen(false)}
                        title={`Delete ${selectedResources.length} Reviews?`}
                        primaryAction={{
                            content: "Delete All Selected",
                            onAction: handleConfirmBulkDelete,
                            destructive: true,
                        }}
                        secondaryActions={[
                            {
                                content: "Cancel",
                                onAction: () => setBulkDeleteModalOpen(false),
                            },
                        ]}
                    >
                        <Modal.Section>
                            <p>Are you sure you want to delete <strong>{selectedResources.length} reviews</strong>? This action cannot be undone.</p>
                        </Modal.Section>
                    </Modal>

                </BlockStack>
            </Page>
        </div>
    );
}
