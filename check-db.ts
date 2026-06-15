import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.settings.findFirst();
  console.log("DB SETTINGS:");
  console.log(settings);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
