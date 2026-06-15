import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import fs from "fs";

export const loader = async () => {
    try {
        const log = fs.readFileSync("/tmp/error.log", "utf8");
        return json({ log });
    } catch (e) {
        return json({ log: "No error log found yet: " + String(e) });
    }
};

export default function DebugError() {
    const { log } = useLoaderData<typeof loader>();
    return (
        <div style={{ padding: "2rem", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            <h1>Server Error Log</h1>
            <hr />
            {log}
        </div>
    );
}
