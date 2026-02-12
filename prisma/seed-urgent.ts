import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding Urgent Review...");

    await prisma.review.create({
        data: {
            shop: "empire-store",
            productId: "gid://shopify/Product/123456789",
            rating: 1,
            body: "This product arrived broken and customer service is ignoring me! I want a refund immediately.",
            customerName: "Angry Karen",
            status: "pending",
            verified: true,
            sentiment: "negative", // The trigger for the UI
            media: {
                create: {
                    url: "https://via.placeholder.com/300x300/ff0000/ffffff?text=Broken+Item",
                    type: "image"
                }
            }
        },
    });

    console.log("Urgent Review Created! 🚨");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
