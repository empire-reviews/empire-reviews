/**
 * Environment Variable Validation
 * Fail-fast at startup if critical configuration is missing.
 */

const REQUIRED_ENV_VARS = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_APP_URL',
    'DATABASE_URL',
    'RESEND_API_KEY',
    'CRON_SECRET',
    'UNSUBSCRIBE_SECRET',
] as const;

const PRODUCTION_RECOMMENDED = [
    'verified_domain',
] as const;

export function validateEnvironment() {
    const missing: string[] = [];

    REQUIRED_ENV_VARS.forEach(varName => {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    });

    if (process.env.NODE_ENV === 'production') {
        PRODUCTION_RECOMMENDED.forEach(varName => {
            if (!process.env[varName]) {
                console.warn(`⚠️ Recommended env var missing: ${varName}`);
            }
        });
    }

    if (missing.length > 0) {
        const errorMsg = `❌ Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}`;
        console.error(errorMsg);
        // In production, throw. In dev, warn only so local dev isn't blocked.
        if (process.env.NODE_ENV === 'production') {
            throw new Error(errorMsg);
        } else {
            console.warn("⚠️ Running in dev mode with missing env vars. Some features will not work.");
        }
    } else {
        console.log('✅ Environment variables validated');
    }
}
