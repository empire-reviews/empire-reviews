import { json } from "@remix-run/node";
import { Sentry } from "../utils/sentry.server";

export const loader = async () => {
    try {
        // Force an error
        throw new Error("🧪 Sentry Test Error - This is intentional!");
    } catch (error) {
        console.log("Capturing test error in Sentry...");

        Sentry.captureException(error, {
            tags: {
                test: "true",
                environment: process.env.NODE_ENV || "development",
            },
            extra: {
                message: "This is a test error to verify Sentry is working",
            }
        });

        return json({
            success: true,
            message: "Error sent to Sentry! Check your Sentry dashboard."
        });
    }
};
