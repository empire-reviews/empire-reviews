import { json } from "@remix-run/node";

export const loader = async () => {
    return json({
        shopifyAppUrl: process.env.SHOPIFY_APP_URL || "NOT SET",
        shopifyApiKey: process.env.SHOPIFY_API_KEY ? "SET" : "NOT SET",
        shopifyApiSecret: process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET",
        databaseUrl: process.env.DATABASE_URL ? "SET" : "NOT SET",
        scopes: process.env.SCOPES || "NOT SET",
        nodeEnv: process.env.NODE_ENV,
    });
};
