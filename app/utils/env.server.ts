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
    // Required for storefront photo uploads (Pro feature). Used by
    // app/routes/api.upload-sign.tsx to generate signed Cloudinary uploads.
    // If missing, photo upload requests return 401 instead of exposing a
    // shared unsigned upload preset (Bug C6).
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
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

    // ENCRYPTION_KEY secures at-rest secrets (e.g. merchant AI keys).
    // Must be 32 bytes / 64 hex chars (generate with `openssl rand -hex 32`).
    const encKey = (process.env.ENCRYPTION_KEY || '').trim();
    if (!encKey) {
        console.warn('⚠️ ENCRYPTION_KEY is missing — stored AI keys cannot be encrypted/decrypted. Generate one with `openssl rand -hex 32`.');
    } else if (encKey.length < 64) {
        console.warn(`⚠️ ENCRYPTION_KEY is too short (${encKey.length} hex chars; need 64 = 32 bytes). Regenerate with \`openssl rand -hex 32\`.`);
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

/**
 * Sanitize environment variables by trimming whitespace.
 * Prevents subtle bugs from copy-pasted values with trailing spaces.
 */
export function sanitizeEnvironment() {
    const varsToSanitize = [
        'SHOPIFY_API_KEY',
        'SHOPIFY_API_SECRET',
        'SHOPIFY_APP_URL',
        'DATABASE_URL',
        'RESEND_API_KEY',
        'CRON_SECRET',
        'UNSUBSCRIBE_SECRET',
        'ENCRYPTION_KEY',
        'SENTRY_DSN',
        'verified_domain',
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
    ];

    varsToSanitize.forEach(varName => {
        if (process.env[varName]) {
            process.env[varName] = process.env[varName]!.trim();
        }
    });
}
