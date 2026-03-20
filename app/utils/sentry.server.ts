import * as Sentry from "@sentry/remix";

let sentryInitialized = false;

export function initSentry() {
    // Only initialize once
    if (sentryInitialized) return;

    const dsn = process.env.SENTRY_DSN;

    // Only enable Sentry in production or if explicitly set
    if (!dsn) {
        console.log("⚠️ Sentry DSN not set - error tracking disabled");
        return;
    }

    try {
        Sentry.init({
            dsn: dsn,
            environment: process.env.NODE_ENV || "development",

            // Sample 10% of transactions for performance monitoring
            tracesSampleRate: 0.1,

            // Don't send sensitive data
            beforeSend(event) {
                // Remove sensitive data from error context
                if (event.request?.data) {
                    const data = event.request.data as Record<string, any>;

                    // Remove API keys
                    delete data.apiKey;
                    delete data.api_key;
                    delete data.RESEND_API_KEY;
                    delete data.SHOPIFY_API_SECRET;

                    // Remove passwords/tokens
                    delete data.password;
                    delete data.token;
                    delete data.accessToken;
                }

                return event;
            },
        });

        sentryInitialized = true;
        console.log("✅ Sentry initialized successfully");
    } catch (error) {
        console.error("❌ Failed to initialize Sentry:", error);
    }
}

// Export Sentry for use in other files
export { Sentry };
