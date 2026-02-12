import prisma from "../db.server";

/**
 * Track an analytics event
 * This runs automatically in the background to track user behavior
 */
export async function trackEvent(data: {
    shop: string;
    event: string;
    page?: string;
    metadata?: Record<string, any>;
}) {
    try {
        await prisma.analyticsEvent.create({
            data: {
                shop: data.shop,
                event: data.event,
                page: data.page,
                metadata: data.metadata ? JSON.stringify(data.metadata) : null,
            },
        });
    } catch (error) {
        // Silent fail - don't break the app if analytics fails
        console.error("Analytics tracking error:", error);
    }
}

/**
 * Get conversion phase based on install date
 * DELIGHT (Days 1-7): No upgrade prompts
 * CURIOSITY (Days 8-14): Subtle hints only
 * DESIRE (Days 15-30): Contextual suggestions
 * URGENCY (Month 2+): Limited-time offers
 */
export function getConversionPhase(appInstalledAt: Date): string {
    const daysSinceInstall = Math.floor(
        (Date.now() - appInstalledAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceInstall <= 7) return "DELIGHT";
    if (daysSinceInstall <= 14) return "CURIOSITY";
    if (daysSinceInstall <= 30) return "DESIRE";
    return "URGENCY";
}

/**
 * Check if we should show an upgrade prompt
 * Rules: Max 1 prompt per week, never in DELIGHT phase
 */
export function shouldShowUpgradePrompt(
    phase: string,
    lastUpgradePrompt: Date | null
): boolean {
    // Never show in DELIGHT phase (first 7 days)
    if (phase === "DELIGHT") return false;

    // If never shown before, OK to show
    if (!lastUpgradePrompt) return true;

    // Check if 7 days have passed since last prompt
    const daysSinceLastPrompt = Math.floor(
        (Date.now() - lastUpgradePrompt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceLastPrompt >= 7;
}

/**
 * Record that we showed an upgrade prompt
 */
export async function recordUpgradePrompt(shop: string) {
    try {
        await prisma.session.updateMany({
            where: { shop },
            data: {
                lastUpgradePrompt: new Date(),
                upgradePromptCount: { increment: 1 },
            },
        });

        await trackEvent({
            shop,
            event: "upgrade_prompt_shown",
            metadata: { timestamp: new Date().toISOString() },
        });
    } catch (error) {
        console.error("Error recording upgrade prompt:", error);
    }
}
