import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const payload = await request.json();
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
            if (!sendRecord.opened) {
                await prisma.$transaction([
                    prisma.campaignSend.update({
                        where: { id: sendId },
                        data: { opened: true, openedAt: new Date() }
                    }),
                    prisma.campaignMetrics.updateMany({
                        where: { campaignId: sendRecord.campaignId },
                        data: { totalOpened: { increment: 1 } }
                    })
                ]);
            }
        } else if (type === "email.clicked") {
            if (!sendRecord.clicked) {
                await prisma.$transaction([
                    prisma.campaignSend.update({
                        where: { id: sendId },
                        data: { clicked: true, clickedAt: new Date() }
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
