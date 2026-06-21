/**
 * Empire Reviews — Help Center content source.
 *
 * SINGLE SOURCE OF TRUTH for the support help center. This same data feeds:
 *   1. The in-app support widget's "Help" tab (app/components/SupportChat.tsx).
 *   2. (Phase 2) the public SEO pages at /help and /help/<slug>, server-rendered
 *      so Google can index them.
 *
 * Because it's a plain typed module (no DB), it works in both the client widget
 * bundle and server route loaders with zero migration. Keep article bodies
 * structured (HelpBlock[]) so the renderer can build a Table of Contents from
 * the heading blocks and gate Pro-only articles consistently.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type HelpBlock =
  | { type: "heading"; text: string } // becomes a Table-of-Contents entry
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] } // ordered/numbered list
  | { type: "callout"; text: string }; // highlighted tip/note box

export interface HelpArticle {
  slug: string; // URL segment + widget id, kebab-case, stable (don't rename)
  title: string;
  summary: string; // one line — shown in lists AND used as <meta description>
  collection: string; // HelpCollection.id
  keywords: string[]; // extra search terms not in title/summary
  featured?: boolean; // surfaces in the widget Home "Recommended" list
  proOnly?: boolean; // renders an "Available on Empire Pro" callout
  updated: string; // ISO date (YYYY-MM-DD)
  body: HelpBlock[];
}

export interface HelpCollection {
  id: string;
  title: string;
  description: string;
  icon: string; // emoji shown next to the collection
}

// ── Collections ──────────────────────────────────────────────────────────────

export const HELP_COLLECTIONS: HelpCollection[] = [
  { id: "getting-started", title: "Getting started", description: "Install Empire Reviews and go live in minutes.", icon: "🚀" },
  { id: "collecting-reviews", title: "Collecting reviews", description: "Email campaigns, requests, and rewards that bring reviews in.", icon: "✉️" },
  { id: "displaying-reviews", title: "Displaying reviews", description: "Add and customize the storefront review widgets.", icon: "🎨" },
  { id: "managing-reviews", title: "Managing reviews", description: "Approve, reply to, and organize your reviews.", icon: "🛠️" },
  { id: "ai-features", title: "AI features", description: "AI replies, insights, and summaries (Empire Pro).", icon: "✨" },
  { id: "billing-plans", title: "Plans & billing", description: "Free vs Empire Pro, upgrades, and referral codes.", icon: "💳" },
];

// ── Articles ─────────────────────────────────────────────────────────────────
// NOTE: authored from app/lib/support-kb.ts. Keep tone warm + concise.

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "installing-empire-reviews",
    title: "Installing Empire Reviews on your store",
    summary: "Get the app set up and the review widgets onto your theme.",
    collection: "getting-started",
    keywords: ["setup", "install", "theme", "embed", "first time"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Welcome to Empire Reviews! Once the app is installed from the Shopify App Store, there are two quick steps to start showing reviews on your storefront." },
      { type: "heading", text: "Enable the app embed" },
      { type: "steps", items: [
        "In your Shopify admin, go to Online Store → Themes → Customize.",
        "Open the Theme settings (the gear icon) → App embeds.",
        "Turn on 'Empire Reviews' so the widget scripts load on every page.",
        "Click Save.",
      ] },
      { type: "heading", text: "Add a review widget to your product page" },
      { type: "steps", items: [
        "Still in the theme editor, navigate to a product page.",
        "Click 'Add block' (or 'Add section') where you want reviews to appear.",
        "Choose an Empire Reviews block — for example 'Empire Review List' or 'Empire Star Rating'.",
        "Save. Your reviews now render on the live storefront.",
      ] },
      { type: "callout", text: "Tip: the Star Rating block is best placed right under your product title, and the Review List near the bottom of the product description." },
    ],
  },
  {
    slug: "importing-existing-reviews",
    title: "Importing or migrating your existing reviews",
    summary: "Bring reviews over from another app or a CSV file without losing them.",
    collection: "getting-started",
    keywords: ["migrate", "migration", "transfer", "csv", "import", "switch app", "judge.me", "loox", "aliexpress", "google"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Switching from another review app or starting with existing reviews? The Import page brings them in safely." },
      { type: "heading", text: "Where to import" },
      { type: "paragraph", text: "Open the Import / Export page from the main navigation. You'll see a preview table before anything is saved, so you can confirm the data looks right." },
      { type: "heading", text: "Supported sources" },
      { type: "list", items: [
        "CSV file — the universal format exported by most review apps.",
        "Google Reviews — pull in your existing Google product reviews.",
        "AliExpress — import product reviews for dropshipped items.",
      ] },
      { type: "callout", text: "On the Free plan, up to 50 reviews are stored. Imports stop at the cap — upgrade to Empire Pro for unlimited reviews." },
    ],
  },
  {
    slug: "adding-review-widget-product-page",
    title: "Adding the review widget to your product page",
    summary: "Show the full list of reviews with photos, ratings, and a write-a-review button.",
    collection: "displaying-reviews",
    keywords: ["widget", "block", "product page", "review list", "theme editor"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The Review List block is the main widget — it shows your reviews, the rating breakdown, and a 'Write a Review' button." },
      { type: "steps", items: [
        "Go to Online Store → Themes → Customize.",
        "Navigate to a product page in the editor.",
        "Click 'Add block' and select 'Empire Review List'.",
        "Drag it to the position you want and click Save.",
      ] },
      { type: "heading", text: "Scope: product vs store-wide" },
      { type: "paragraph", text: "Each widget has a Scope setting: 'auto' shows this product's reviews on product pages and all reviews elsewhere; 'product' forces this product only; 'store' shows reviews from your whole store." },
      { type: "callout", text: "After changing a widget setting in the theme editor, always Save. Widget styling updates appear on the live store immediately." },
    ],
  },
  {
    slug: "changing-widget-language",
    title: "Changing the storefront widget language",
    summary: "Display review widgets in any of 15 supported languages.",
    collection: "displaying-reviews",
    keywords: ["language", "translate", "localization", "hindi", "spanish", "french", "i18n"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Empire Reviews can render the storefront widget text — buttons, labels, badges, the review form — in 15 languages." },
      { type: "steps", items: [
        "Open the Settings page in the app.",
        "Find 'Widget Language' and choose your language.",
        "Save. The storefront widgets update to that language.",
      ] },
      { type: "heading", text: "What translates" },
      { type: "paragraph", text: "Empire's own interface text translates: the 'Write a Review' button, the review modal, 'Verified Buyer', 'Based on N reviews', and more. Your customers' actual review text stays in whatever language they wrote it." },
      { type: "callout", text: "Theme headings you type yourself (e.g. a carousel's 'What Our Customers Say') are edited in the theme customizer, not the Widget Language setting." },
    ],
  },
  {
    slug: "automatic-review-request-emails",
    title: "Sending automatic review-request emails",
    summary: "Turn buyers into reviewers with automated post-purchase emails.",
    collection: "collecting-reviews",
    keywords: ["email", "campaign", "request", "automation", "post purchase", "follow up"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Empire Reviews can automatically email customers after they order, asking them to leave a review — the single biggest driver of review volume." },
      { type: "heading", text: "How it works" },
      { type: "list", items: [
        "When an order is created and fulfilled, Empire queues a review request.",
        "After a delay you choose (Settings → review request delay), the email is sent.",
        "Open and click tracking shows you how the campaign performs.",
      ] },
      { type: "heading", text: "Setting it up" },
      { type: "steps", items: [
        "Open the Email Campaigns page.",
        "Choose a template (reciprocity, altruism, or scarcity styles).",
        "Set your sending delay and turn the automation on.",
      ] },
    ],
  },
  {
    slug: "quick-start-checklist",
    title: "Quick-start checklist",
    summary: "The four things to do to get Empire Reviews fully up and running.",
    collection: "getting-started",
    keywords: ["checklist", "onboarding", "begin", "first steps", "go live", "new user"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "New to Empire Reviews? Run through this short checklist and you'll be collecting and showing reviews in minutes." },
      { type: "heading", text: "Your first four steps" },
      { type: "steps", items: [
        "Add a review widget — in Shopify go to Online Store → Themes → Customize and add an Empire Reviews block to your product page.",
        "Set up review-request emails on the Email Campaigns page so buyers are asked to review automatically.",
        "Manage incoming reviews on the Reviews (War Room) page — approve, reject, and reply.",
        "Optional: add your AI key in Settings → AI Configuration to unlock AI replies, insights, and summaries.",
      ] },
      { type: "callout", text: "Already have reviews elsewhere? Use the Import page to bring them in from a CSV, Google, or AliExpress before you go live." },
    ],
  },
  {
    slug: "star-rating-badge",
    title: "Adding the star rating badge",
    summary: "Show your average star rating inline, right under the product title.",
    collection: "displaying-reviews",
    keywords: ["star rating", "badge", "average", "stars", "product title", "block"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The Star Rating block shows your average star rating as a compact inline badge — perfect for placing just under the product title." },
      { type: "heading", text: "Add the block" },
      { type: "steps", items: [
        "Go to Online Store → Themes → Customize and open a product page.",
        "Click 'Add block' and choose 'Empire Star Rating'.",
        "Drag it directly under your product title and click Save.",
      ] },
      { type: "callout", text: "This block is designed for product pages and reads the current product, so it always reflects that product's reviews." },
    ],
  },
  {
    slug: "photo-gallery-widget",
    title: "Showing off photo reviews with the gallery",
    summary: "Display customer review photos in a clean, hover-to-reveal gallery.",
    collection: "displaying-reviews",
    keywords: ["photo gallery", "photos", "images", "ugc", "visual reviews", "block"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The Photo Gallery block turns the photos your customers attach to reviews into eye-catching social proof." },
      { type: "heading", text: "Add the gallery" },
      { type: "steps", items: [
        "In the theme editor, click 'Add block' and choose 'Empire Photo Gallery'.",
        "Pick a scope: product-page (this product's photos) or store-wide.",
        "Save.",
      ] },
      { type: "callout", text: "On hover, each photo reveals the reviewer's name and star rating, so the gallery stays clean at rest." },
    ],
  },
  {
    slug: "review-carousel-widget",
    title: "Adding a scrolling review carousel",
    summary: "A scrolling carousel of your best reviews that auto-scopes per page.",
    collection: "displaying-reviews",
    keywords: ["carousel", "slider", "scrolling", "featured", "testimonials", "block"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The Review Carousel scrolls through reviews — great for a homepage testimonials section or below a product description." },
      { type: "heading", text: "How scoping works" },
      { type: "paragraph", text: "On a product page the carousel automatically shows that product's reviews; on other pages (like your homepage) it shows featured store-wide reviews." },
      { type: "steps", items: [
        "In the theme editor, click 'Add section' or 'Add block' and choose 'Empire Review Carousel'.",
        "Position it where you want, adjust its settings in the sidebar, and Save.",
      ] },
    ],
  },
  {
    slug: "floating-reviews-tab",
    title: "Adding the floating reviews tab",
    summary: "A floating review button that opens reviews from any page.",
    collection: "displaying-reviews",
    keywords: ["floating tab", "floating button", "sticky", "tab", "block"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The Floating Tab places a small, always-visible review button on the edge of the page that shoppers can click to view reviews." },
      { type: "heading", text: "Add the floating tab" },
      { type: "steps", items: [
        "In the theme editor, click 'Add block' and choose 'Empire Floating Tab'.",
        "Adjust its colors and text in the sidebar.",
        "Save.",
      ] },
      { type: "callout", text: "On a product page the tab scopes to that product's reviews; on other pages it shows store-wide reviews." },
    ],
  },
  {
    slug: "ai-summary-widget",
    title: "Adding the AI summary widget",
    summary: "Show an AI-written summary of your reviews above the review list.",
    collection: "displaying-reviews",
    keywords: ["ai summary", "summary widget", "overview", "block", "storefront ai"],
    proOnly: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The AI Summary block displays a short, AI-generated overview of what customers are saying, placed above your reviews to build trust quickly." },
      { type: "heading", text: "Requirements" },
      { type: "list", items: [
        "Empire Pro plan.",
        "An AI provider configured in Settings → AI Configuration.",
      ] },
      { type: "heading", text: "Add the block" },
      { type: "steps", items: [
        "In the theme editor, click 'Add block' and choose 'Empire AI Summary'.",
        "Place it above your Review List and Save.",
      ] },
      { type: "callout", text: "If a product has no written reviews yet, the widget shows a friendly placeholder instead of a summary." },
    ],
  },
  {
    slug: "choosing-email-campaign-template",
    title: "Choosing an email campaign template",
    summary: "Pick the review-request email style that fits your brand.",
    collection: "collecting-reviews",
    keywords: ["template", "campaign", "reciprocity", "altruism", "scarcity", "email style"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Your review-request email's tone matters. Empire Reviews ships with three proven templates you can pick from on the Email Campaigns page." },
      { type: "heading", text: "The three templates" },
      { type: "list", items: [
        "Reciprocity — leads with the value you've given the customer, then asks for a review in return.",
        "Altruism — frames leaving a review as helping other shoppers make a good choice.",
        "Scarcity — adds gentle urgency to encourage a timely response.",
      ] },
      { type: "callout", text: "On Empire Pro with an AI key configured, you can also generate a custom AI-written template." },
    ],
  },
  {
    slug: "loyalty-discount-rewards",
    title: "Rewarding reviewers with discount codes",
    summary: "Automatically email a discount code when you approve a review.",
    collection: "collecting-reviews",
    keywords: ["loyalty", "rewards", "discount", "coupon", "incentive", "write_discounts"],
    proOnly: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Loyalty Rewards thanks customers for reviewing by emailing them a discount code — a great way to drive repeat purchases." },
      { type: "heading", text: "Turning it on" },
      { type: "steps", items: [
        "Open the Email Campaigns page and go to the Loyalty Rewards tab.",
        "Enable rewards and set any minimum-rating or photo rules.",
        "Re-authenticate the app when Shopify prompts you — rewards need the 'write_discounts' permission to create codes.",
      ] },
      { type: "callout", text: "Codes are emailed only when you APPROVE a review and it meets your rules — so you stay in control." },
    ],
  },
  {
    slug: "approving-and-rejecting-reviews",
    title: "Approving and rejecting reviews",
    summary: "Moderate incoming reviews from the Reviews page (the War Room).",
    collection: "managing-reviews",
    keywords: ["approve", "reject", "moderate", "pending", "war room", "manage"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The Reviews page — the War Room — lists every submitted review so you can decide which ones go live." },
      { type: "heading", text: "Moderating a review" },
      { type: "steps", items: [
        "Open the Reviews (War Room) page.",
        "Use the action buttons on each row to approve or reject the review.",
        "Filter by status, rating, or search by customer name or review text to find what you need.",
      ] },
      { type: "callout", text: "Want less manual work? Set a Publish Mode in Settings → Automation to auto-approve reviews." },
    ],
  },
  {
    slug: "replying-to-reviews",
    title: "Replying to a review",
    summary: "Respond to customer reviews — with an optional AI-drafted reply.",
    collection: "managing-reviews",
    keywords: ["reply", "respond", "response", "answer", "engage"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Replying to reviews shows shoppers you're listening. You can do it right from the Reviews page." },
      { type: "heading", text: "How to reply" },
      { type: "steps", items: [
        "On the Reviews (War Room) page, click the reply icon next to a review.",
        "Type your response.",
        "If you have an AI provider configured, click 'AI Draft' to generate a reply you can edit.",
      ] },
      { type: "callout", text: "The 'AI Draft' button only appears once you've added an AI key in Settings → AI Configuration." },
    ],
  },
  {
    slug: "bulk-actions",
    title: "Using bulk actions on reviews",
    summary: "Approve, reject, or delete many reviews at once.",
    collection: "managing-reviews",
    keywords: ["bulk", "batch", "multiple", "select all", "mass approve"],
    proOnly: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "When you have a lot of reviews to process, bulk actions let you handle them in one go instead of row by row." },
      { type: "heading", text: "Using bulk actions" },
      { type: "steps", items: [
        "On the Reviews (War Room) page, tick the checkboxes for the reviews you want.",
        "Use the bulk action bar that appears to approve, reject, or delete them all at once.",
      ] },
      { type: "callout", text: "Bulk actions are an Empire Pro feature." },
    ],
  },
  {
    slug: "publish-mode-auto-approval",
    title: "Auto-approving reviews with Publish Mode",
    summary: "Control whether reviews go live automatically or wait for your approval.",
    collection: "managing-reviews",
    keywords: ["publish mode", "auto approve", "automation", "moderation", "settings"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Publish Mode decides what happens to a new review the moment it's submitted." },
      { type: "heading", text: "The three modes" },
      { type: "list", items: [
        "None — every review stays pending until you approve it in the War Room.",
        "5-star only — five-star reviews auto-publish; the rest wait for approval.",
        "All — every review goes live automatically.",
      ] },
      { type: "heading", text: "Where to set it" },
      { type: "paragraph", text: "Open Settings → Automation → Publish Mode and choose the option that fits how hands-on you want to be." },
    ],
  },
  {
    slug: "connecting-your-ai-provider",
    title: "Connecting your AI provider (BYOK)",
    summary: "Add your own AI API key to unlock Empire's AI features.",
    collection: "ai-features",
    keywords: ["ai", "byok", "api key", "openai", "gemini", "claude", "deepseek", "groq", "ollama", "configure"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Empire Reviews uses a bring-your-own-key (BYOK) model — you supply an API key from your chosen AI provider, and Empire uses it for all AI features." },
      { type: "heading", text: "Supported providers" },
      { type: "list", items: [
        "OpenAI, Gemini, Claude, DeepSeek, Groq, or Ollama.",
      ] },
      { type: "heading", text: "Connecting your key" },
      { type: "steps", items: [
        "Open Settings → AI Configuration.",
        "Choose your provider and paste your API key.",
        "Save. Your key powers AI reply drafts, AI Insights, storefront AI Summaries, and the support assistant.",
      ] },
      { type: "callout", text: "Your key is stored securely and used only to run your AI features." },
    ],
  },
  {
    slug: "ai-review-replies",
    title: "Drafting replies with AI",
    summary: "Generate a thoughtful reply to any review in one click.",
    collection: "ai-features",
    keywords: ["ai reply", "ai draft", "respond", "generate", "automation"],
    proOnly: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "AI review replies help you respond quickly and consistently — Empire drafts a reply you can edit before posting." },
      { type: "heading", text: "Generating a reply" },
      { type: "steps", items: [
        "On the Reviews (War Room) page, click the reply icon on a review.",
        "Click 'AI Draft' to generate a suggested reply.",
        "Edit it to match your voice, then post.",
      ] },
      { type: "callout", text: "Requires Empire Pro and an AI provider configured in Settings → AI Configuration." },
    ],
  },
  {
    slug: "ai-insights",
    title: "Understanding your reviews with AI Insights",
    summary: "Generate a sentiment report from your recent reviews.",
    collection: "ai-features",
    keywords: ["ai insights", "sentiment", "report", "analysis", "trends"],
    proOnly: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "The AI Insights page reads your recent reviews and produces a sentiment analysis report so you can spot trends and issues fast." },
      { type: "heading", text: "Generating insights" },
      { type: "steps", items: [
        "Open the AI Insights page.",
        "Generate a report — choose a Quick one- or two-sentence insight, or a detailed Executive report.",
      ] },
      { type: "callout", text: "Requires Empire Pro and an AI provider configured in Settings → AI Configuration." },
    ],
  },
  {
    slug: "ai-summaries",
    title: "AI summaries on your storefront",
    summary: "Show shoppers an AI-written overview of your reviews.",
    collection: "ai-features",
    keywords: ["ai summary", "storefront", "overview", "shopper", "widget"],
    proOnly: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "AI Summaries give shoppers a warm, at-a-glance overview of what customers love about a product, shown above your reviews on the storefront." },
      { type: "heading", text: "Turning it on" },
      { type: "steps", items: [
        "Configure an AI provider in Settings → AI Configuration.",
        "Add the 'Empire AI Summary' block to your product page in the theme editor.",
      ] },
      { type: "callout", text: "AI Summaries require Empire Pro. The summary is shopper-focused and only generates once a product has written reviews." },
    ],
  },
  {
    slug: "free-vs-empire-pro",
    title: "Free vs Empire Pro: what's the difference?",
    summary: "Compare the Free plan with Empire Pro at a glance.",
    collection: "billing-plans",
    keywords: ["free", "pro", "compare", "plans", "features", "limits", "pricing"],
    featured: true,
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Empire Reviews has two plans. Here's how they compare so you can pick the right one." },
      { type: "heading", text: "Free plan" },
      { type: "list", items: [
        "Up to 50 reviews stored.",
        "All core storefront widgets included.",
      ] },
      { type: "heading", text: "Empire Pro — $9.99/month, 7-day free trial" },
      { type: "list", items: [
        "Unlimited reviews.",
        "AI features: AI reply drafts, AI Insights, and AI Summaries.",
        "Bulk actions and all email campaign templates.",
        "Priority support.",
      ] },
    ],
  },
  {
    slug: "upgrading-to-empire-pro",
    title: "Upgrading to Empire Pro",
    summary: "Start your 7-day trial and unlock unlimited reviews and AI features.",
    collection: "billing-plans",
    keywords: ["upgrade", "pro", "trial", "subscribe", "billing", "plan"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Empire Pro is $9.99/month and comes with a 7-day free trial, so you can try everything before you're charged." },
      { type: "heading", text: "How to upgrade" },
      { type: "steps", items: [
        "Open the Plans page from the main navigation.",
        "Click 'Upgrade to Empire Pro'.",
        "Confirm the subscription through Shopify's billing screen.",
      ] },
      { type: "callout", text: "Your trial starts when you upgrade — unlimited reviews, AI features, and bulk actions unlock right away." },
    ],
  },
  {
    slug: "vip-referral-codes",
    title: "Using a VIP referral code",
    summary: "Activate Empire Pro at no cost with a VIP referral code.",
    collection: "billing-plans",
    keywords: ["vip", "referral", "code", "free pro", "promo", "coupon"],
    updated: "2026-06-21",
    body: [
      { type: "paragraph", text: "Have a VIP referral code? You can activate Empire Pro without paying — no subscription needed." },
      { type: "heading", text: "Redeeming your code" },
      { type: "steps", items: [
        "Open the Plans page from the main navigation.",
        "Enter your VIP referral code in the code field.",
        "Submit — your account unlocks Empire Pro features at no cost.",
      ] },
      { type: "callout", text: "If your code doesn't work, click 'Talk to a human' and the Empire team will help." },
    ],
  },
];

// ── Lookups / helpers ────────────────────────────────────────────────────────

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function getCollection(id: string): HelpCollection | undefined {
  return HELP_COLLECTIONS.find((c) => c.id === id);
}

export function getArticlesByCollection(collectionId: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.collection === collectionId);
}

export function getFeaturedArticles(): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.featured);
}

export function collectionArticleCount(collectionId: string): number {
  return getArticlesByCollection(collectionId).length;
}

/** Lightweight client-side search across title, summary, keywords, and body. */
export function searchArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  return HELP_ARTICLES.map((a) => {
    const haystack = [
      a.title,
      a.summary,
      a.keywords.join(" "),
      a.body.map((b) => ("text" in b ? b.text : "items" in b ? b.items.join(" ") : "")).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const score = terms.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
    return { a, score };
  })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((r) => r.a);
}

/** Build a Table of Contents from an article's heading blocks. */
export function tableOfContents(article: HelpArticle): { text: string; id: string }[] {
  return article.body
    .filter((b): b is { type: "heading"; text: string } => b.type === "heading")
    .map((b) => ({ text: b.text, id: b.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
}
