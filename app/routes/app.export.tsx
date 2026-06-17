import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function escapeCSV(val: unknown): string {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { session } = await authenticate.admin(request);
        const shop = session.shop;

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

        return Response.json({ csv, filename });
    } catch (err: unknown) {
        // If authenticate.admin throws a redirect Response, re-throw it so
        // Shopify's auth flow can complete (e.g. session expired mid-session).
        if (err instanceof Response) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[export] action error:", msg);
        // Always return 200 — fetchers treat 4xx/5xx as ErrorBoundary triggers.
        return Response.json({ error: `Export failed: ${msg}` });
    }
};

// Required so Remix registers this as a full route, not just a resource route.
// The page is never rendered — useFetcher.submit() triggers the action directly.
export default function ExportRoute() {
    return null;
}
