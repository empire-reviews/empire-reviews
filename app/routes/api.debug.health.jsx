import { json } from "@remix-run/node";
import prisma from "../db.server";
export const loader = async () => {
    const vars = [
        'SHOPIFY_APP_URL',
        'SHOPIFY_API_KEY',
        'SHOPIFY_API_SECRET',
        'SCOPES',
        'DATABASE_URL'
    ];
    const envForensics = {};
    for (const v of vars) {
        const value = process.env[v] || "";
        envForensics[v] = {
            length: value.length,
            escaped: JSON.stringify(value),
            hasCarriageReturn: value.includes('\r'),
            hasNewline: value.includes('\n'),
            lastCharCode: value.length > 0 ? value.charCodeAt(value.length - 1) : null
        };
    }
    const diagnostics = {
        timestamp: new Date().toISOString(),
        env: envForensics,
        tests: {}
    };
    // Test 1: Can we connect to the database?
    try {
        await prisma.$connect();
        diagnostics.tests.databaseConnection = "SUCCESS";
    }
    catch (error) {
        diagnostics.tests.databaseConnection = `FAILED: ${error.message}`;
    }
    return json(diagnostics);
};
