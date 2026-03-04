import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Diagnostic endpoint that tries authenticate.admin() and returns
 * detailed error info instead of throwing.
 * Access from browser: /api/auth-test?shop=empire-test-1.myshopify.com
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const authHeader = request.headers.get("authorization");

    console.log("AUTH-TEST: Starting", {
        url: url.pathname,
        shop: url.searchParams.get("shop"),
        host: url.searchParams.get("host"),
        hasAuth: !!authHeader,
        authPrefix: authHeader?.substring(0, 20),
    });

    try {
        const result = await authenticate.admin(request);
        console.log("AUTH-TEST: SUCCESS", result.session.shop);
        return json({
            status: "auth_success",
            shop: result.session.shop,
            sessionId: result.session.id?.substring(0, 20) + "...",
            scope: result.session.scope,
        });
    } catch (error: any) {
        if (error instanceof Response) {
            // Clone the response before reading it so Remix can still use it
            const cloned = error.clone();
            let bodyText = "";
            try {
                bodyText = await cloned.text();
            } catch (e) {
                bodyText = "(could not read body)";
            }

            const headerObj: Record<string, string> = {};
            error.headers.forEach((value: string, key: string) => {
                headerObj[key] = value;
            });

            console.log("AUTH-TEST: Response thrown", {
                status: error.status,
                headers: headerObj,
                bodyPreview: bodyText.substring(0, 500),
            });

            // Return the diagnostic instead of throwing
            return json({
                status: "auth_response_thrown",
                httpStatus: error.status,
                headers: headerObj,
                bodyPreview: bodyText.substring(0, 1000),
            });
        }

        console.error("AUTH-TEST: Error thrown", {
            name: error.name,
            message: error.message,
            stack: error.stack?.substring(0, 500),
        });

        return json({
            status: "auth_error_thrown",
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack?.substring(0, 500),
        });
    }
};
