import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    console.log("🧠 Seeding Empire Brain with Psychological Triggers...");

    // 1. Social Proof: The "Perfect" Review with Media
    const review1 = await prisma.review.create({
        data: {
            shop: "empire-test-1.myshopify.com", // Adjust if needed, or we'll fetch dynamic
            productId: "gid://shopify/Product/123456789",
            customerId: "gid://shopify/Customer/1",
            customerName: "Sarah Jenkins",
            rating: 5,
            title: "OMG! Best purchase of the year 😭",
            body: "I was skeptical at first, but the quality is insane. See my video below!",
            status: "pending",
            verified: true,
            sentiment: "positive",
            media: {
                create: {
                    url: "https://cdn.shopify.com/s/files/1/0000/0000/files/video_review.mp4",
                    type: "video",
                },
            },
            createdAt: new Date(Date.now() - 1000 * 60 * 5), // 5 mins ago (Urgency)
        },
    });

    // 2. The "Honest" Review (Builds Trust)
    const review2 = await prisma.review.create({
        data: {
            shop: "empire-test-1.myshopify.com",
            productId: "gid://shopify/Product/987654321",
            customerId: "gid://shopify/Customer/2",
            customerName: "Mike T.",
            rating: 4,
            title: "Great, but shipping took 5 days",
            body: "Product is perfect. Shipping could be faster.",
            status: "pending",
            verified: true,
            sentiment: "neutral",
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        },
    });

    // 3. The "Pain Point" Review (Needs Action)
    const review3 = await prisma.review.create({
        data: {
            shop: "empire-test-1.myshopify.com",
            productId: "gid://shopify/Product/555555555",
            customerId: "gid://shopify/Customer/3",
            customerName: "Anonymous",
            rating: 1,
            title: "Where is my order??",
            body: "I ordered yesterday and still no tracking number.",
            status: "pending",
            verified: false,
            sentiment: "negative",
            createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
        },
    });

    console.log("✅ Seeded 3 Psychological Archetypes.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
