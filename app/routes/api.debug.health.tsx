import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async () => {
    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        env: {
            shopifyAppUrl: process.env.SHOPIFY_APP_URL ? "SET" : "NOT SET",
            shopifyApiKey: process.env.SHOPIFY_API_KEY ? "SET" : "NOT SET",
            shopifyApiSecret: process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET",
            databaseUrl: process.env.DATABASE_URL ? "SET" : "NOT SET",
            scopes: process.env.SCOPES || "NOT SET",
        },
        tests: {}
    };

    // Test 1: Can we connect to the database?
    try {
        await prisma.$connect();
        diagnostics.tests.databaseConnection = "SUCCESS";
    } catch (error: any) {
        diagnostics.tests.databaseConnection = `FAILED: ${error.message}`;
    }

    // Test 2: Can we query the database?
    try {
        const sessionCount = await prisma.session.count();
        diagnostics.tests.databaseQuery = `SUCCESS - ${sessionCount} sessions`;
    } catch (error: any) {
        diagnostics.tests.databaseQuery = `FAILED: ${error.message}`;
    }

    // Test 3: Check if shopify.server.ts can be imported
    try {
        const shopifyModule = await import("../shopify.server");
        diagnostics.tests.shopifyServerImport = "SUCCESS";
    } catch (error: any) {
        diagnostics.tests.shopifyServerImport = `FAILED: ${error.message}`;
    }

    return json(diagnostics, {
        headers: {
            "Content-Type": "application/json",
        },
    });
};
