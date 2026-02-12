import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding Media Reviews...");

    // 1. Find the first shop (or create one placeholder)
    let shop = await prisma.settings.findFirst();
    const shopDomain = shop?.shop || "empire-test-1.myshopify.com";

    // 2. Create Reviews with Photos
    // We use Unsplash or placeholder images that look like user uploads
    const reviews = [
        {
            shop: shopDomain,
            productId: "gid://shopify/Product/8666576847085", // The Snowboard
            rating: 5,
            author: "Alex M.",
            body: "Absolutely love this board! The graphic is insane in person. 🏂",
            verified: true,
            sentiment: "POSITIVE",
            media: {
                create: [
                    { url: "https://images.unsplash.com/photo-1520244497591-112f42a5a3f4?w=500&q=80", type: "IMAGE" }
                ]
            },
            createdAt: new Date("2023-11-15"),
        },
        {
            shop: shopDomain,
            productId: "gid://shopify/Product/8666576847085",
            rating: 5,
            author: "Sarah J.",
            body: "Best investment for the winter. Rides smooth and looks premium.",
            verified: true,
            sentiment: "POSITIVE",
            media: {
                create: [
                    { url: "https://images.unsplash.com/photo-1483827472365-ea255e4eeb0b?w=500&q=80", type: "IMAGE" },
                    { url: "https://images.unsplash.com/photo-1564756942698-356fdce41235?w=500&q=80", type: "IMAGE" }
                ]
            },
            createdAt: new Date("2023-12-02"),
        },
        {
            shop: shopDomain,
            productId: "gid://shopify/Product/8666576847085",
            rating: 4,
            author: "Mike T.",
            body: "Great quality, came a bit late but worth the wait.",
            verified: false,
            sentiment: "NEUTRAL",
            media: { create: [] }, // No media
            createdAt: new Date("2024-01-10")
        }
    ];

    for (const r of reviews) {
        // Explicitly construct the data object to satisfy TypeScript and Prisma
        await prisma.review.create({
            data: {
                shop: r.shop,
                productId: r.productId,
                rating: r.rating,
                customerName: r.author, // Mapping author to customerName based on likely schema
                body: r.body,
                verified: r.verified,
                sentiment: r.sentiment,
                createdAt: r.createdAt,
                media: r.media // This is the nested create object
            }
        });
    }

    console.log("✅ Seeded 3 reviews (2 with photos).");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
