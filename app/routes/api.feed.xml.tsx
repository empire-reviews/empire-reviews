import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
        return new Response("Missing shop parameter", { status: 400 });
    }

    // Check for "Empire Pro" Plan logic would go here, BUT
    // Since this is a public feed accessed by Google bot, we can't use 'authenticate.admin'.
    // We must check the shop's status in our database or via offline session.
    // For now, let's assume if they have 'enableGoogle' set to true in DB, they are allowed.
    // Real implementation: We would store 'isPro' in the Settings table and check that.

    const settings = await prisma.settings.findFirst({ where: { shop } });

    if (!settings) {
        return new Response("Settings not found", { status: 404 });
    }

    // Check for "Empire Pro" Plan
    // If user is FREE (default), this feature is locked.
    // They must have 'EMPIRE_PRO' in their Settings (synced via app.settings.tsx)
    // if (settings?.plan !== "EMPIRE_PRO") {
    //     return new Response("Feature requires Empire Pro plan", { status: 403 });
    // }

    if (!settings?.enableGoogle) {
        return new Response("Feed disabled by store owner", { status: 403 });
    }

    // Fetch high quality reviews
    const reviews = await prisma.review.findMany({
        where: {
            shop,
            rating: { gte: 4 }, // Only 4-5 stars for the feed
            status: "approved"
        }
    });

    // Generate XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd">
    <version>2.3</version>
    <publisher>
        <name>Empire Reviews</name>
    </publisher>
    <reviews>
        ${reviews.map(r => `
        <review>
            <review_id>${r.id}</review_id>
            <reviewer>
                <name>${r.customerName || 'Anonymous'}</name>
            </reviewer>
            <review_timestamp>${r.createdAt.toISOString()}</review_timestamp>
            <title>${r.title || 'Review'}</title>
            <content>${r.body || ''}</content>
            <review_url>https://${shop}/products/${r.productId}</review_url>
            <ratings>
                <overall min="1" max="5">${r.rating}</overall>
            </ratings>
            <products>
                <product>
                    <product_ids>
                        <gtins>
                            <gtin>${r.productId}</gtin> 
                        </gtins>
                    </product_ids>
                </product>
            </products>
            <is_spam>false</is_spam>
        </review>
        `).join('')}
    </reviews>
</feed>`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "max-age=3600"
        }
    });
};
