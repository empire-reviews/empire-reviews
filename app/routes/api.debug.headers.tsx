import { json, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const headers: any = {};
    request.headers.forEach((value, name) => {
        headers[name] = value;
    });

    return json({
        url: request.url,
        method: request.method,
        headers: headers,
        cookies: request.headers.get("cookie")
    });
};
