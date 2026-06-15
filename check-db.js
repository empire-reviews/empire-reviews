const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log("Connecting to Prisma...");
        const count = await prisma.session.count();
        console.log("Session table exists! Count:", count);
    } catch (e) {
        console.error("Prisma Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
