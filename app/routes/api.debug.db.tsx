import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { Session } from "@shopify/shopify-api";

export const loader = async () => {
    try {
        const count = await prisma.session.count();

        // Direct Prisma Write Test
        const testId = `test-direct-${Date.now()}`;
        await prisma.session.create({
            data: {
                id: testId,
                shop: "test-direct.myshopify.com",
                state: "test",
                isOnline: false,
                accessToken: "test"
            }
        });
        await prisma.session.delete({ where: { id: testId } });

        // Session Storage Adapter Test
        const storage = new PrismaSessionStorage(prisma);
        const sessionId = `test-storage-${Date.now()}`;
        const session = new Session({
            id: sessionId,
            shop: "test-storage.myshopify.com",
            state: "test-state",
            isOnline: false,
        });

        let storageTestResult = "PENDING";
        try {
            await storage.storeSession(session);
            const loaded = await storage.loadSession(sessionId);
            if (loaded && loaded.id === sessionId) {
                storageTestResult = "SUCCESS";
                await storage.deleteSession(sessionId);
            } else {
                storageTestResult = "FAILED_TO_LOAD";
            }
        } catch (e: any) {
            storageTestResult = `ERROR: ${e.message}`;
        }

        const latest = await prisma.session.findFirst({
            orderBy: { id: 'desc' }
        });

        return json({
            status: "success",
            sessionCount: count,
            dbUrlLength: (process.env.DATABASE_URL || "").length,
            dbUrlLastChar: (process.env.DATABASE_URL || "").charCodeAt((process.env.DATABASE_URL || "").length - 1),
            storageTest: storageTestResult,
            latestSession: latest ? { id: latest.id, shop: latest.shop } : null
        });
    } catch (error: any) {
        return json({
            status: "error",
            message: error.message,
            stack: error.stack
        }, { status: 500 });
    }
};
