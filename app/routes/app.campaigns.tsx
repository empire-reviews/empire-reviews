import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Button,
    TextField,
    Box,
    InlineStack,
    Badge,
    Divider,
    Select,
    Banner,
    Tooltip,
    ProgressBar,
    Modal,

} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState, useCallback } from "react";
import {
    ArrowLeftIcon,
    EmailIcon,
    MagicIcon,
    SendIcon,
    ClockIcon,
    CheckIcon,
    ChartVerticalIcon,
    EditIcon
} from "@shopify/polaris-icons";
import { sendCampaignEmail } from "../services/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);

    // 1. Fetch campaigns from DB
    const dbCampaigns = await prisma.campaign.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: 'desc' },
        include: { metrics: true }
    });

    // 2. Fetch audience (Real Shopify Data)
    const response = await admin.graphql(
        `#graphql
        query getRecentOrders {
            orders(first: 50, reverse: true) {
                nodes {
                    id
                    createdAt
                    email
                    customer {
                        firstName
                        email
                    }
                }
            }
        }`
    );
    const data = await response.json();
    const potentialAudience = data.data.orders.nodes.length;

    // 3. Calculate Aggregate Stats
    const totalSent = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalSent || 0), 0);
    const totalOpened = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalOpened || 0), 0);
    const totalClicked = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalClicked || 0), 0);
    const totalReviews = dbCampaigns.reduce((acc: number, c: any) => acc + (c.metrics?.totalReviews || 0), 0);

    // Avoid division by zero
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

    return json({
        stats: { openRate, clickRate, generatedReviews: totalReviews, potentialAudience },
        activeCampaigns: dbCampaigns.map((c: any) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            sent: c.metrics?.totalSent || 0,
            openRate: c.metrics?.openRate ? `${c.metrics.openRate.toFixed(1)}%` : "0%"
        }))
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "delete") {
        const campaignId = formData.get("campaignId") as string;

        // Transactional delete to handle Foreign Key Constraints
        await prisma.$transaction([
            prisma.campaignMetrics.deleteMany({ where: { campaignId } }),
            prisma.campaignSend.deleteMany({ where: { campaignId } }),
            prisma.campaign.deleteMany({ where: { id: campaignId } })
        ]);

        return json({ success: true, deletedId: campaignId });
    }

    if (intent === "rename") {
        const campaignId = formData.get("campaignId") as string;
        const newName = formData.get("newName") as string;

        await prisma.campaign.update({
            where: { id: campaignId },
            data: { name: newName }
        });

        return json({ success: true, renamedId: campaignId });
    }

    // 1. Create Campaign in DB
    const templateType = formData.get("templateType") as string;
    const discount = formData.get("discount") ? parseInt(formData.get("discount") as string) : null;
    const subject = formData.get("subject") as string;
    const body = formData.get("body") as string;

    const campaign = await prisma.campaign.create({
        data: {
            shop: session.shop,
            name: `Campaign - ${new Date().toLocaleDateString()}`,
            subject,
            body,
            templateType,
            discount,
            status: "active",
            metrics: {
                create: { totalSent: 0 }
            }
        }
    });

    // 2. Register Marketing Activity in Shopify (Optional - Best Effort)
    try {
        // STRATEGY: Raw REST API Bypass (Fixed Payload)
        // Previous error: {"errors":{"tactic":["is invalid..."],"event_type":["can't be blank"]}}
        // Valid tactics from error: newsletter, message, ad, post, etc.
        // === MARKETING API FIX (Raw REST) ===
        // Get the actual app URL from the request (this is the Cloudflare tunnel URL in dev)
        const requestUrl = new URL(request.url);
        const appBaseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
        const { shop } = session;

        const response = await fetch(`https://${shop}/admin/api/2024-10/marketing_events.json`, {
            method: "POST",
            headers: {
                "X-Shopify-Access-Token": session.accessToken || "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                marketing_event: {
                    started_at: new Date().toISOString(),
                    // "event_type" is required. Using "ad" as a safe fallback or "message"
                    // "tactic" is required. Using "newsletter" which fits an email campaign
                    event_type: "ad",
                    marketing_channel: "email",
                    tactic: "newsletter",
                    // Fix: Append timestamp to ensure uniqueness (avoids "has already been taken" error)
                    utm_campaign: `${campaign.name} - ${Date.now()}`,
                    utm_source: "empire-reviews",
                    utm_medium: "email",
                    budget: "0.00",
                    currency: "USD",
                    budget_type: "lifetime",
                    description: campaign.name,
                    manage_url: `${appBaseUrl}/m/${campaign.id}?shop=${shop}`,
                    preview_url: `${appBaseUrl}/m/${campaign.id}?shop=${shop}`
                }
            })
        });

        const responseText = await response.text();
        console.log(`[Raw REST] Status: ${response.status}`);
        console.log(`[Raw REST] Body: ${responseText}`);

        if (!response.ok) {
            console.error(`[Raw REST] Failed: ${responseText}`);
            // Fallback: If "ad" is wrong for event_type, try "message"
        } else {
            const data = JSON.parse(responseText);
            console.log(`[Raw REST] Success! ID: ${data?.marketing_event?.id}`);
        }
    } catch (error) {
        console.error("Failed to register marketing activity:", JSON.stringify(error, null, 2));
        // Continue execution - best effort
    }

    // 3. Fetch recent customers (Target Audience)
    const response = await admin.graphql(
        `#graphql
        query getRecentOrders {
            orders(first: 5, reverse: true) { # Limit to 5 for demo safety
                nodes {
                    id
                    email
                    customer {
                        firstName
                        email
                    }
                }
            }
        }`
    );
    const data = await response.json();
    const orders = data.data.orders.nodes;

    // 4. Send Emails & Create Tracking Records
    let sentCount = 0;
    for (const order of orders) {
        const email = order.email || order.customer?.email;
        const name = order.customer?.firstName || "Customer";

        if (email) {
            // Create Send Record
            const sendRecord = await prisma.campaignSend.create({
                data: {
                    campaignId: campaign.id,
                    customerEmail: email,
                    customerName: name,
                    orderId: order.id
                }
            });

            // Send actual email (simulated in service)
            // Replace variables in body
            const personalizedBody = body.replace('{{ name }}', name);

            await sendCampaignEmail(
                session.shop,
                email,
                subject,
                personalizedBody,
                sendRecord.id // Tracking ID
            );

            sentCount++;
        }
    }

    // 5. Update Metrics
    await prisma.campaignMetrics.update({
        where: { campaignId: campaign.id },
        data: { totalSent: sentCount }
    });

    return json({ success: true, campaignId: campaign.id });
};

export default function CampaignsPage() {
    const { stats, activeCampaigns } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const navigate = useNavigate();

    const [selectedTab, setSelectedTab] = useState(0);
    const [templateType, setTemplateType] = useState("reciprocity");

    // Rename State
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameId, setRenameId] = useState("");
    const [renameValue, setRenameValue] = useState("");

    // Email Builder State
    const [subject, setSubject] = useState("How did we do? 🌟");
    const [body, setBody] = useState("Hi {{ name }},\\n\\nWe hope you're loving your new order! \\n\\nCould you spare 30 seconds to help a small business grow? It would mean the world to us.");
    const [discount, setDiscount] = useState("15");

    // Psychological Triggers
    const templates: any = {
        reciprocity: {
            subject: "A customized gift for you 🎁",
            body: "Hi {{ name }},\\n\\nWe noticed you recently bought from us. As a small token of thanks, we'd love to send you a {{ discount }}% OFF coupon for your next order!\\n\\nJust leave us a quick review to unlock it instantly.",
            hint: "💡 Reciprocity: Humans feel compelled to return a favor. Give a discount -> Get a review."
        },
        altruism: {
            subject: "Can you help us grow? 🌱",
            body: "Hi {{ name }},\\n\\nWe are a small team passing big dreams. Every single review helps us compete with the big guys.\\n\\nWould you mind taking 10 seconds to share your honest thoughts?",
            hint: "💡 Altruism: People love to feel like 'helpers'. Appeal to their kindness, not your profit."
        },
        scarcity: {
            subject: "Your review link expires in 24h ⏳",
            body: "Hi {{ name }},\\n\\nWe're holding a spot in our 'Customer of the Month' draw for you, but entries close tonight.\\n\\nRate your purchase now to be included!",
            hint: "💡 Scarcity/Urgency: FOMO (Fear Of Missing Out) drives immediate action."
        }
    };

    const handleTemplateChange = (val: string) => {
        setTemplateType(val);
        setSubject(templates[val].subject.replace('{{ discount }}', discount));
        setBody(templates[val].body.replace('{{ discount }}', discount));
    };

    const handleLaunch = () => {
        fetcher.submit({
            subject,
            body,
            templateType,
            discount
        }, { method: "post" });

        shopify.toast.show("Campaign Launched! 🚀");
        setSelectedTab(0); // Go back to dashboard
    };

    // Confetti Effect (CSS only)
    const [launching, setLaunching] = useState(false);

    return (
        <div className="holographic-void">
            <style>{`
                /* --- LIGHT THEME EMPIRE --- */
                .holographic-void {
                    --void-bg: #f8fafc;
                    --glass-border: rgba(255, 255, 255, 0.6);
                    --glass-surface: rgba(255, 255, 255, 0.7);
                    --glass-surface-hover: rgba(255, 255, 255, 0.9);
                    --neon-cyan: #0891b2; /* Darker Cyan for visibility */
                    --neon-violet: #7c3aed;
                    --neon-emerald: #059669;
                    --text-main: #0f172a;
                    --text-muted: #64748b;
                    
                    background-color: var(--void-bg);
                    background-image: 
                        radial-gradient(at 0% 0%, rgba(124, 58, 237, 0.05) 0px, transparent 50%),
                        radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.05) 0px, transparent 50%);
                    min-height: 100vh;
                    font-family: 'Inter', sans-serif;
                    color: var(--text-main);
                    padding-bottom: 150px;
                    perspective: 1000px; /* Enable 3D space */
                }

                /* HERO */
                .holo-header {
                    padding: 2rem 0 3rem;
                    position: relative;
                    z-index: 10;
                }
                .holo-title {
                    font-family: 'Outfit', sans-serif;
                    font-size: 3.5rem;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 0.5rem;
                    line-height: 1.3;
                    padding-bottom: 0.2em; /* Prevent descender clipping */
                }
                .holo-subtitle {
                    font-size: 1.1rem;
                    color: var(--text-muted);
                    max-width: 600px;
                    font-weight: 400;
                    letter-spacing: 0.01em;
                }

                /* 3D PRISM STATS (Light Mode) */
                .prism-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 2rem;
                    margin-bottom: 4rem;
                    transform-style: preserve-3d;
                }
                .prism-card {
                    background: var(--glass-surface);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.8);
                    border-radius: 20px;
                    padding: 2rem;
                    position: relative;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    transform-style: preserve-3d;
                    box-shadow: 
                        0 10px 30px -5px rgba(148, 163, 184, 0.15),
                        0 4px 6px -2px rgba(148, 163, 184, 0.05),
                        inset 0 0 0 1px rgba(255,255,255,0.5);
                    overflow: hidden;
                }
                .prism-card::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(125deg, rgba(255,255,255,0.4) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.3) 100%);
                    opacity: 0.8;
                    pointer-events: none;
                }
                .prism-card:hover {
                    transform: translateY(-10px) rotateX(5deg);
                    background: var(--glass-surface-hover);
                    border-color: #fff;
                    box-shadow: 
                        0 25px 50px -12px rgba(148, 163, 184, 0.25),
                        0 0 30px rgba(124, 58, 237, 0.1), /* Violet Tint */
                        inset 0 0 0 1px #fff;
                }
                
                .prism-val { 
                    font-family: 'Outfit', sans-serif; 
                    font-size: 2.5rem; 
                    font-weight: 800; 
                    color: var(--text-main); 
                    line-height: 1; 
                    margin-bottom: 0.5rem;
                }
                .prism-label { 
                    font-size: 0.75rem; 
                    color: var(--neon-violet); 
                    text-transform: uppercase; 
                    letter-spacing: 0.15em; 
                    font-weight: 700;
                    display: flex; align-items: center; gap: 6px;
                }
                .prism-spark {
                    width: 6px; height: 6px; background: var(--neon-violet);
                    border-radius: 50%;
                }

                /* NAVIGATION - Floating Dock (Light) */
                .holo-dock {
                    display: inline-flex;
                    gap: 0.5rem;
                    background: rgba(255,255,255,0.5);
                    border: 1px solid rgba(255,255,255,0.6);
                    padding: 6px;
                    border-radius: 16px;
                    margin-bottom: 3rem;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .dock-item {
                    padding: 0.8rem 1.5rem;
                    border-radius: 10px;
                    color: var(--text-muted);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex; align-items: center; gap: 8px;
                    background: transparent;
                    border: none;
                    text-transform: uppercase;
                    font-size: 0.8rem;
                    letter-spacing: 0.05em;
                }
                .dock-item.active {
                    background: var(--neon-violet);
                    color: #fff;
                    box-shadow: 0 10px 20px -5px rgba(124, 58, 237, 0.4);
                }
                .dock-item:hover:not(.active) { color: var(--text-main); background: rgba(0,0,0,0.03); }

                /* TRANSMISSION BEAMS (List - Light) */
                .beam-container {
                    perspective: 1000px;
                }
                .transmission-beam {
                    background: white;
                    border-left: 4px solid #cbd5e1;
                    border: 1px solid #e2e8f0;
                    border-left-width: 4px;
                    border-radius: 12px;
                    padding: 1.5rem 2rem;
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr 1fr auto;
                    align-items: center;
                    gap: 1.5rem;
                    margin-bottom: 1rem;
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .transmission-beam:hover {
                    transform: translateX(10px) scale(1.01);
                    border-left-color: var(--neon-emerald);
                    border-color: var(--neon-emerald); /* Highlight border */
                    box-shadow: 
                        -10px 0 20px rgba(16, 185, 129, 0.1),
                        0 10px 25px -5px rgba(0,0,0,0.1);
                    z-index: 10;
                }
                
                /* Pulse Animation for Active Beams */
                .beam-active::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 3px;
                    background: linear-gradient(90deg, transparent, var(--neon-emerald), transparent);
                    animation: beam-scan 3s infinite linear;
                    opacity: 0.6;
                }

                .tb-name { font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--text-main); font-size: 1.2rem; }
                .tb-meta { font-size: 0.8rem; color: var(--text-muted); font-family: monospace; font-weight: 500; }
                .tb-stat-val { font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--text-main); font-size: 1.1rem; }
                .tb-stat-label { font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; }

                /* NEURO-FORGE (Builder - Light) */
                .forge-grid {
                    display: grid;
                    grid-template-columns: 1fr 420px;
                    gap: 4rem;
                }
                @media (max-width: 1200px) { .forge-grid { grid-template-columns: 1fr; } }
                
                .forge-panel {
                    background: rgba(255, 255, 255, 0.7);
                    border: 1px solid #e2e8f0;
                    border-radius: 24px;
                    padding: 2rem;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
                }

                /* CHIP SELECTOR (Light) */
                .neuro-chip-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1rem;
                    margin-top: 1.5rem;
                }
                .neuro-chip {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 1.5rem 1rem;
                    cursor: pointer;
                    transition: all 0.3s;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .neuro-chip:hover {
                    transform: translateY(-5px);
                    border-color: var(--neon-violet);
                    box-shadow: 0 10px 20px -5px rgba(124, 58, 237, 0.15);
                }
                .neuro-chip.selected {
                    background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
                    border-color: var(--neon-violet);
                    box-shadow: 
                        0 0 0 1px var(--neon-violet),
                        0 10px 20px -5px rgba(124, 58, 237, 0.2);
                }
                .chip-icon { font-size: 2rem; margin-bottom: 0.5rem; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
                .chip-name { font-weight: 700; color: var(--text-main); font-size: 0.9rem; letter-spacing: 0.05em; }

                /* HOLO-PROJECTOR (iPhone - Light) */
                .holo-form {
                    position: relative;
                }
                .projector-beam {
                    position: absolute;
                    bottom: -30px; left: 50%; transform: translateX(-50%);
                    width: 200px; height: 30px;
                    background: radial-gradient(ellipse at center, rgba(124, 58, 237, 0.2) 0%, transparent 70%);
                    filter: blur(8px);
                    z-index: 0;
                    pointer-events: none;
                }
                .iphone-holo {
                    background: #fff;
                    border-radius: 46px;
                    padding: 8px;
                    box-shadow: 
                        0 25px 50px -12px rgba(0,0,0,0.25),
                        0 0 0 1px #e2e8f0,
                        0 0 40px rgba(124, 58, 237, 0.1); 
                    border: 4px solid #f1f5f9;
                    max-width: 360px;
                    margin: 0 auto;
                    position: relative;
                    z-index: 5;
                    transition: transform 0.5s;
                }
                .iphone-holo:hover { transform: translateY(-5px) scale(1.02); }
                
                .holo-screen {
                    background: #fff;
                    border-radius: 38px;
                    overflow: hidden;
                    height: 680px;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    border: 2px solid #000; /* Screen bezel */
                }
                /* Email Styling within Holo */
                .holo-email-body { padding: 24px; color: #334155; line-height: 1.6; font-size: 15px; }

                /* IGNITE BUTTON (Light) */
                .ignite-btn {
                    width: 100%;
                    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
                    color: white;
                    font-weight: 800;
                    font-size: 1.2rem;
                    padding: 1.5rem;
                    border-radius: 16px;
                    border: none;
                    cursor: pointer;
                    box-shadow: 
                        0 10px 20px -5px rgba(124, 58, 237, 0.4),
                        inset 0 2px 0 rgba(255,255,255,0.2);
                    transition: all 0.3s;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-top: 2rem;
                    position: relative; overflow: hidden;
                }
                .ignite-btn:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 20px 30px -10px rgba(124, 58, 237, 0.5);
                }
                .ignite-btn:active { transform: scale(0.96); }

                /* LIGHT INPUT OVERRIDES - Important for visibility */
                .Polaris-TextField__Input {
                    background: #fff !important;
                    color: #0f172a !important;
                    border: 1px solid #e2e8f0 !important;
                    font-size: 1rem !important;
                    padding: 0.8rem !important;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
                }
                .Polaris-Label__Text { color: #334155 !important; font-weight: 600 !important; font-size: 0.9rem !important; }
                .Polaris-TextField__Input:focus {
                    border-color: #7c3aed !important;
                    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2) !important;
                }
            `}</style>

            <Page fullWidth>
                <div className="holo-header">
                    <h1 className="holo-title">Email Campaigns</h1>
                    <p className="holo-subtitle">Automated review requests designed to convert.</p>
                </div>

                {/* FLOATING DOCK */}
                <div className="holo-dock">
                    <button className={`dock-item ${selectedTab === 0 ? 'active' : ''}`} onClick={() => setSelectedTab(0)}>
                        <ChartVerticalIcon style={{ width: 16 }} /> Dashboard
                    </button>
                    <button className={`dock-item ${selectedTab === 1 ? 'active' : ''}`} onClick={() => setSelectedTab(1)}>
                        <MagicIcon style={{ width: 16 }} /> Create Campaign
                    </button>
                </div>

                {selectedTab === 0 && (
                    <>
                        <div className="prism-grid">
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark"></span>Audience Size</div>
                                <div className="prism-val">{stats.potentialAudience.toLocaleString()}</div>
                                <Badge tone="info">Shopify Customers</Badge>
                            </div>
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark" style={{ background: '#ec4899', boxShadow: '0 0 8px #ec4899' }}></span>Open Rate</div>
                                <div className="prism-val">{stats.openRate}%</div>
                                <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '10px' }}>
                                    <div style={{ height: '100%', width: `${stats.openRate}%`, background: '#ec4899', borderRadius: '2px' }}></div>
                                </div>
                            </div>
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark" style={{ background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>Click Rate</div>
                                <div className="prism-val">{stats.clickRate}%</div>
                                <Badge tone="success">High Intent</Badge>
                            </div>
                            <div className="prism-card">
                                <div className="prism-label"><span className="prism-spark" style={{ background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }}></span>Reviews</div>
                                <div className="prism-val">{stats.generatedReviews}</div>
                                <Badge tone="attention">+12 This Week</Badge>
                            </div>
                        </div>

                        <div className="forge-panel" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ padding: '2rem', borderBottom: '1px solid var(--glass-border)' }}>
                                <Text as="h3" variant="headingLg" tone="magic">Recent Activity</Text>
                            </div>
                            <div style={{ padding: '2rem' }}>
                                {activeCampaigns.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                                        <InlineStack align="center" gap="200">
                                            <SendIcon style={{ width: 32, opacity: 0.3 }} />
                                            <div style={{ fontSize: '1.2rem' }}>No campaigns sent yet.</div>
                                        </InlineStack>
                                    </div>
                                ) : (
                                    <div className="beam-container">
                                        {activeCampaigns.map(c => (
                                            <div key={c.id} className={`transmission-beam ${c.status === 'active' ? 'beam-active' : ''}`}>
                                                <div>
                                                    <div className="tb-name">{c.name}</div>
                                                    <div className="tb-meta">STATUS: <span style={{ color: c.status === 'active' ? '#34d399' : '#f59e0b' }}>{c.status.toUpperCase()}</span></div>
                                                </div>
                                                <div>
                                                    <div className="tb-stat-val">{c.sent}</div>
                                                    <div className="tb-stat-label">SENT</div>
                                                </div>
                                                <div>
                                                    <div className="tb-stat-val">{c.openRate}</div>
                                                    <div className="tb-stat-label">OPEN RATE</div>
                                                </div>
                                                <div>
                                                    <InlineStack gap="200">
                                                        <Button variant="plain" icon={EditIcon} onClick={() => {
                                                            setRenameId(c.id);
                                                            setRenameValue(c.name);
                                                            setRenameModalOpen(true);
                                                        }} />
                                                        <Button variant="plain" tone="critical" onClick={() => {
                                                            fetcher.submit({ intent: "delete", campaignId: c.id }, { method: "post" });
                                                        }}>Stop</Button>
                                                    </InlineStack>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {selectedTab === 1 && (
                    <div className="forge-grid">
                        {/* LEFT: STRATEGY */}
                        <div className="forge-panel">
                            <Text as="h3" variant="headingMd" tone="magic">1. Select Strategy</Text>
                            <div className="neuro-chip-grid">
                                <div
                                    className={`neuro-chip ${templateType === 'reciprocity' ? 'selected' : ''}`}
                                    onClick={() => handleTemplateChange('reciprocity')}
                                >
                                    <span className="chip-icon">🎁</span>
                                    <div className="chip-name">Reciprocity</div>
                                </div>
                                <div
                                    className={`neuro-chip ${templateType === 'altruism' ? 'selected' : ''}`}
                                    onClick={() => handleTemplateChange('altruism')}
                                >
                                    <span className="chip-icon">🌱</span>
                                    <div className="chip-name">Altruism</div>
                                </div>
                                <div
                                    className={`neuro-chip ${templateType === 'scarcity' ? 'selected' : ''}`}
                                    onClick={() => handleTemplateChange('scarcity')}
                                >
                                    <span className="chip-icon">⏳</span>
                                    <div className="chip-name">Scarcity</div>
                                </div>
                            </div>

                            <div style={{ margin: '2rem 0', padding: '1.5rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                                <Text as="p" tone="magic" fontWeight="bold">{templates[templateType].hint}</Text>
                            </div>

                            <BlockStack gap="400">
                                <Text as="h3" variant="headingMd" tone="magic">2. Customize Content</Text>
                                {templateType === 'reciprocity' && (
                                    <TextField
                                        label="Discount Value"
                                        type="number"
                                        value={discount}
                                        onChange={(v) => {
                                            setDiscount(v);
                                            setBody(prev => prev.replace(/\d+%/, `${v}%`));
                                        }}
                                        autoComplete="off"
                                        suffix="%"
                                    />
                                )}
                                <TextField label="Subject Line" value={subject} onChange={setSubject} autoComplete="off" />
                                <TextField label="Email Body" value={body} onChange={setBody} multiline={6} autoComplete="off" />
                            </BlockStack>

                            <button className="ignite-btn" onClick={handleLaunch} disabled={fetcher.state === "submitting"}>
                                {fetcher.state === "submitting" ? "Launching..." : "Launch Campaign 🚀"}
                            </button>
                        </div>

                        {/* RIGHT: HOLO-PROJECTOR */}
                        <div className="holo-form">
                            <div className="projector-beam"></div>
                            <div className="iphone-holo">
                                <div className="holo-screen">
                                    <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100px', height: '26px', background: '#000', borderBottomLeftRadius: '14px', borderBottomRightRadius: '14px', zIndex: 10 }}></div>

                                    <div className="email-mockup-header" style={{ paddingTop: '40px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8e8e93', marginBottom: '10px', padding: '0 10px' }}>
                                            <span>9:41</span>
                                            <span>5G</span>
                                        </div>
                                        <Divider />
                                        <div style={{ padding: '10px 0' }}>
                                            <div style={{ fontWeight: 700, fontSize: '14px' }}>Empire Store</div>
                                            <div style={{ fontSize: '13px', color: '#333' }}>{subject}</div>
                                            <div style={{ fontSize: '12px', color: '#8e8e93' }}>To: You</div>
                                        </div>
                                        <Divider />
                                    </div>

                                    <div className="holo-email-body">
                                        {body.replace('{{ name }}', 'Alex').split('\n').map((line, i) => (
                                            <p key={i} style={{ marginBottom: line ? '1em' : '0' }}>{line}</p>
                                        ))}

                                        <div style={{ textAlign: 'center', marginTop: '30px' }}>
                                            <div style={{
                                                background: '#000',
                                                color: '#fff',
                                                padding: '12px 24px',
                                                borderRadius: '8px',
                                                display: 'inline-block',
                                                fontWeight: 'bold',
                                                fontSize: '14px'
                                            }}>
                                                Write a Review
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center', marginTop: '30px', color: '#999', fontSize: '11px' }}>
                                            <p>Sent with Empire Reviews</p>
                                            <p>Unsubscribe</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--neon-cyan)', fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                Live Mobile Preview
                            </div>
                        </div>
                    </div>
                )}

                <Modal
                    open={renameModalOpen}
                    onClose={() => setRenameModalOpen(false)}
                    title="Rename Campaign"
                    primaryAction={{
                        content: 'Save',
                        onAction: () => {
                            fetcher.submit({ intent: "rename", campaignId: renameId, newName: renameValue }, { method: "post" });
                            setRenameModalOpen(false);
                        },
                    }}
                    secondaryActions={[{ content: 'Cancel', onAction: () => setRenameModalOpen(false) }]}
                >
                    <Modal.Section>
                        <TextField label="Campaign Name" value={renameValue} onChange={setRenameValue} autoComplete="off" />
                    </Modal.Section>
                </Modal>
            </Page>
        </div>
    );
}
