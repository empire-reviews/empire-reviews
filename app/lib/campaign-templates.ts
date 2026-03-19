export const CAMPAIGN_TEMPLATES: Record<string, { subject: string, body: string, hint: string }> = {
    reciprocity: {
        subject: "A customized gift for you 🎁",
        body: "Hi {{ name }},\\n\\nWe noticed you recently bought {{ product_title }} from us. As a small token of thanks, we'd love to send you a secret coupon code for your next order!\\n\\nJust leave us a quick review to unlock it instantly.\\n\\n{{ review_link }}",
        hint: "💡 Reciprocity: Humans feel compelled to return a favor. Give a discount -> Get a review."
    },
    altruism: {
        subject: "Can you help us grow? 🌱",
        body: "Hi {{ name }},\\n\\nWe are a small team passing big dreams. Every single review helps us compete with the big guys.\\n\\nWould you mind taking 10 seconds to share your honest thoughts?",
        hint: "💡 Altruism: People love to feel like 'helpers'. Appeal to their kindness, not your profit."
    },
    scarcity: {
        subject: "Your review link expires in 24h ⏳",
        body: "Hi {{ name }},\\n\\nWe're holding a spot in our 'Customer of the Month' draw for you, but entries close tonight.\\n\\nRate your purchase now to be included!\\n\\n{{ review_link }}",
        hint: "💡 Scarcity/Urgency: FOMO (Fear Of Missing Out) drives immediate action."
    }
};
