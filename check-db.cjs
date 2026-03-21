const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const total = await prisma.review.count();
  const shopTotal = await prisma.review.count({
    where: { shop: 'saundryam.in' }
  });
  console.log(`Total reviews in DB: ${total}`);
  console.log(`Reviews for saundryam.in: ${shopTotal}`);
}
check().finally(() => window.process.exit(0));
