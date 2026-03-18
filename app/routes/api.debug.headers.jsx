import { json } from "@remix-run/node";
export const loader = async ({ request }) => {
    const headers = {};
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
