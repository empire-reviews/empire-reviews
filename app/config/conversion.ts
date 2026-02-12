/**
 * Conversion & Analytics Configuration
 * Update these values to adjust conversion strategy without code changes
 */
export const CONVERSION_CONFIG = {
    // Phase durations (in days)
    DELIGHT_PHASE_DAYS: 7, // Week 1: No prompts, let users fall in love
    CURIOSITY_PHASE_DAYS: 14, // Week 2: Subtle hints only
    DESIRE_PHASE_DAYS: 30, // Weeks 3-4: Contextual suggestions

    // Prompt frequency
    MIN_DAYS_BETWEEN_PROMPTS: 7, // Max 1 prompt per week
    MAX_PROMPTS_PER_MONTH: 4,

    // Feature flags (toggle features on/off)
    FEATURES: {
        showUsageMeter: true, // Show X/50 reviews meter
        showMissedOpportunities: true, // "You could have saved X hours"
        showBlurredPreviews: true, // Blur AI Insights for free users
        show3DEffects: true, // 3D card hover effects
        showPROBadges: true, // PRO badges on locked features
        showAnalyticsDashboard: true, // Analytics page (owner only)
    },

    // UI Settings
    UI: {
        usageMeterWarningThreshold: 40, // Show warning at 40/50 reviews
        usageMeterDangerThreshold: 45, // Show danger at 45/50 reviews
    },
};

/**
 * Analytics event types for tracking
 */
export const ANALYTICS_EVENTS = {
    // Page views
    PAGE_VIEW: "page_view",

    // Upgrade funnel
    UPGRADE_PROMPT_SHOWN: "upgrade_prompt_shown",
    UPGRADE_CLICK: "upgrade_click",
    UPGRADE_COMPLETED: "upgrade_completed",

    // Feature usage
    FEATURE_LOCKED_CLICK: "feature_locked_click",
    BULK_ACTION_ATTEMPTED: "bulk_action_attempted",
    AI_INSIGHTS_VIEWED: "ai_insights_viewed",

    // Engagement
    REVIEW_REPLIED: "review_replied",
    REVIEW_DELETED: "review_deleted",
    CAMPAIGN_CREATED: "campaign_created",
};
