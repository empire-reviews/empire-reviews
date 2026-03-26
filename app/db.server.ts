// Envoy sanitization moved to central location

import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

let prisma: PrismaClient;

const URL = (process.env.DATABASE_URL || "").trim();

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({
    datasources: { db: { url: URL } },
  });
} else {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      datasources: { db: { url: URL } },
    });
  }
  prisma = global.prismaGlobal;
}

export default prisma;
