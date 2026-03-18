// Envoy sanitization moved to central location
import { PrismaClient } from "@prisma/client";
if (process.env.NODE_ENV !== "production") {
    if (!global.prismaGlobal) {
        global.prismaGlobal = new PrismaClient();
    }
}
const prisma = global.prismaGlobal ??
    new PrismaClient({
        datasources: {
            db: {
                url: (process.env.DATABASE_URL || "").trim(),
            },
        },
    });
export default prisma;
