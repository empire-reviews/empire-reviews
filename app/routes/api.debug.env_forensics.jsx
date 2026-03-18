import { json } from "@remix-run/node";
export const loader = async () => {
    const vars = [
        'SHOPIFY_APP_URL',
        'SHOPIFY_API_KEY',
        'SHOPIFY_API_SECRET',
        'SCOPES',
        'DATABASE_URL'
    ];
    const results = {};
    for (const v of vars) {
        const value = process.env[v] || "";
        results[v] = {
            length: value.length,
            escaped: JSON.stringify(value),
            hasCarriageReturn: value.includes('\r'),
            hasNewline: value.includes('\n'),
            lastCharCode: value.length > 0 ? value.charCodeAt(value.length - 1) : null
        };
    }
    return json(results);
};
