import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function escapeCSV(val: unknown): string {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
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

    // Return JSON so Remix fetcher can call this without Shopify auth redirect loop.
    // The client converts csv string → Blob → object URL → download.
    return Response.json({ csv, filename });
};
