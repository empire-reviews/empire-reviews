import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { Webhook } from "svix";

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const rawBody = await request.text();
        const signature = request.headers.get("svix-signature");
        const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

        // Signature Verification (Bypass only if no secret is set in local dev)
        if (webhookSecret) {
            if (!signature) {
                return json({ error: "Missing signature" }, { status: 400 });
            }
            try {
                const wh = new Webhook(webhookSecret);
                const headers = Object.fromEntries(request.headers);
                wh.verify(rawBody, headers);
            } catch (err: any) {
                console.error("Resend Webhook Signature failed:", err.message);
                return json({ error: "Invalid signature" }, { status: 400 });
            }
        } else {
            console.warn("⚠️ [DEV WARNING] RESEND_WEBHOOK_SECRET not set. Skipping signature verification.");
        }

        const payload = JSON.parse(rawBody);
        const type = payload.type;
        const data = payload.data;

        // Extract our custom tracking tag
        const tags = data?.tags || [];
        const sendIdTag = tags.find((t: any) => t.name === "sendId");
        
        if (!sendIdTag || !sendIdTag.value) {
            return json({ message: "Ignored: No tracking ID" }, { status: 200 });
        }

        const sendId = sendIdTag.value;
        const sendRecord = await prisma.campaignSend.findUnique({
            where: { id: sendId }
        });

        if (!sendRecord) {
            return json({ message: "Ignored: Unknown sendId" }, { status: 200 });
        }

        if (type === "email.opened") {
            if (!sendRecord.openedAt) {
                await prisma.$transaction([
                    prisma.campaignSend.update({
                        where: { id: sendId },
                        data: { openedAt: new Date() }
                    }),
                    prisma.campaignMetrics.updateMany({
                        where: { campaignId: sendRecord.campaignId },
                        data: { totalOpened: { increment: 1 } }
                    })
                ]);
            }
        } else if (type === "email.clicked") {
            if (!sendRecord.clickedAt) {
                await prisma.$transaction([
                    prisma.campaignSend.update({
                        where: { id: sendId },
                        data: { clickedAt: new Date() }
                    }),
                    prisma.campaignMetrics.updateMany({
                        where: { campaignId: sendRecord.campaignId },
                        data: { totalClicked: { increment: 1 } }
                    })
                ]);
            }
        }

        return json({ success: true }, { status: 200 });
    } catch (e: any) {
        console.error("Resend Webhook Error:", e.message);
        return json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    return json({ message: "Resend Webhook Endpoint Active. Awaiting POST events." });
};
