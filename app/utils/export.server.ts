import prisma from "../db.server";

function escapeCSV(val: unknown): string {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

/**
 * Build a CSV export of all reviews for a shop.
 * Returns the CSV string + a suggested filename.
 *
 * Called from within an authenticated route action (NOT a standalone route)
 * so it shares the page's auth context — avoids the cross-route fetcher
 * ErrorBoundary problem in the Shopify embedded app.
 */
export async function buildReviewsCsv(shop: string): Promise<{ csv: string; filename: string }> {
    const reviews = await prisma.review.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        include: { replies: { take: 1 }, media: true },
    });

    const headers = [
        "id", "product_id", "product_handle", "rating", "title",
        "body", "reviewer_name", "reviewer_email", "date",
        "verified_buyer", "status", "reply", "photo_urls",
    ];

    const rows = reviews.map((r) => {
        const photoUrls = r.media.map((m: any) => m.url).join("|");
        const reply = r.replies[0]?.body ?? "";
        const productHandle = r.productId
            ? r.productId.replace(/^gid:\/\/shopify\/Product\//, "")
            : "";
        return [
            r.id,
            r.productId ?? "",
            productHandle,
            r.rating,
            (r as any).title ?? "",
            r.body ?? "",
            r.customerName ?? "",
            r.customerEmail ?? "",
            r.createdAt.toISOString().split("T")[0],
            (r as any).verifiedBuyer ? "TRUE" : "FALSE",
            r.status ?? "approved",
            reply,
            photoUrls,
        ].map(escapeCSV).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\r\n");
    const filename = `empire-reviews-${shop.replace(".myshopify.com", "")}-${new Date().toISOString().split("T")[0]}.csv`;

    return { csv, filename };
}
