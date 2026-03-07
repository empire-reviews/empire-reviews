/**
 * Empire Reviews — Multi-Provider AI Service (BYOK)
 * Supports: OpenAI, Gemini, Claude, DeepSeek, Ollama
 */

export type AIProvider = "openai" | "gemini" | "claude" | "deepseek" | "ollama" | "groq";

interface AIConfig {
    provider: AIProvider;
    apiKey: string;
}

// ─── PROVIDER ENDPOINTS ──────────────────────────────────────────
const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    gemini: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    claude: "https://api.anthropic.com/v1/messages",
    deepseek: "https://api.deepseek.com/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    ollama: "http://localhost:11434/api/chat",
};

const PROVIDER_MODELS: Record<AIProvider, string> = {
    openai: "gpt-4o-mini",
    gemini: "gemini-2.0-flash",
    claude: "claude-3-haiku-20240307",
    deepseek: "deepseek-chat",
    groq: "llama-3.3-70b-versatile",
    ollama: "llama3",
};

// ─── UNIFIED AI CALL ─────────────────────────────────────────────
async function callAI(config: AIConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const { provider, apiKey } = config;

    try {
        switch (provider) {
            case "openai":
            case "deepseek":
            case "groq":
                return await callOpenAICompatible(PROVIDER_ENDPOINTS[provider], apiKey, PROVIDER_MODELS[provider], systemPrompt, userPrompt);
            case "gemini":
                return await callGemini(apiKey, systemPrompt, userPrompt);
            case "claude":
                return await callClaude(apiKey, systemPrompt, userPrompt);
            case "ollama":
                return await callOllama(apiKey, systemPrompt, userPrompt);
            default:
                throw new Error(`Unsupported AI provider: ${provider}`);
        }
    } catch (error: any) {
        console.error(`[AI Service] ${provider} error:`, error.message || error);
        throw new Error(`AI generation failed: ${error.message || "Unknown error"}`);
    }
}

// ─── PROVIDER ADAPTERS ───────────────────────────────────────────

/** OpenAI, DeepSeek & Groq (same API format) */
async function callOpenAICompatible(endpoint: string, apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            max_tokens: 300,
            temperature: 0.7,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
}

/** Google Gemini */
async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${PROVIDER_ENDPOINTS.gemini}?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

/** Anthropic Claude */
async function callClaude(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch(PROVIDER_ENDPOINTS.claude, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: PROVIDER_MODELS.claude,
            max_tokens: 300,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text?.trim() || "";
}

/** Ollama (local) */
async function callOllama(configKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    let endpoint = "http://localhost:11434/api/chat";
    let model = "llama3";
    let apiKey = "";

    if (configKey) {
        if (configKey.includes("|")) {
            const parts = configKey.split("|");
            endpoint = parts[0].replace(/\/$/, "") + "/api/chat";
            model = parts[1];
            if (parts.length > 2) {
                apiKey = parts[2];
            }
        } else if (configKey.startsWith("http")) {
            endpoint = configKey.replace(/\/$/, "") + "/api/chat";
        } else {
            model = configKey; // just model name
        }
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            stream: false,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.message?.content?.trim() || "";
}

// ─── PUBLIC API: REPLY GENERATION ────────────────────────────────

const REPLY_SYSTEM_PROMPT = `You are a professional, warm, and empathetic customer service assistant for an online store. 
Your job is to write short, genuine replies to customer reviews.

Rules:
- Keep replies under 3 sentences
- Be warm and personal — use the customer's name if given
- For positive reviews: thank them genuinely, mention something specific from their review
- For negative reviews: apologize sincerely, show empathy, offer to make it right
- Never sound robotic or corporate
- Don't use excessive emojis (1 max)
- Match the tone of the review (casual review = casual reply)`;

export async function generateReply(
    config: AIConfig,
    reviewBody: string,
    rating: number,
    customerName?: string | null
): Promise<string> {
    const userPrompt = `Customer "${customerName || "Anonymous"}" left a ${rating}-star review:
"${reviewBody}"

Write a short, genuine reply from the store owner.`;

    return callAI(config, REPLY_SYSTEM_PROMPT, userPrompt);
}

// ─── PUBLIC API: INSIGHTS GENERATION ─────────────────────────────

const INSIGHTS_SYSTEM_PROMPT_QUICK = `You are an analytics AI for an e-commerce review management tool.
Analyze a batch of recent customer reviews and provide a brief, actionable insight.

Rules:
- Output exactly 1-2 sentences
- Mention specific patterns you spot (e.g. shipping, quality, sizing)
- Be actionable — tell the merchant what to focus on
- If reviews are mostly positive, highlight what's working
- If there are issues, flag them clearly but constructively`;

const INSIGHTS_SYSTEM_PROMPT_EXEC = `You are an executive analytics AI for an e-commerce review management tool.
Analyze a batch of recent customer reviews and provide a detailed business intelligence report.

Rules:
- Use markdown formatting
- Include the following exact sections with emoji bullet points:
  - 🌟 What's working:
  - ⚠️ Major pain points:
  - 💡 Actionable advice:
- Be specific, referencing patterns or recurring words in the reviews
- Keep it professional, concise, and highly informative
- Do not add any introductory or concluding text outside of those 3 sections`;

export async function generateInsights(
    config: AIConfig,
    reviews: Array<{ body: string | null; rating: number }>,
    reportType: "quick" | "executive" = "quick"
): Promise<{ summary: string; score: number }> {
    const reviewTexts = reviews
        .filter(r => r.body)
        .map((r, i) => `${i + 1}. [${r.rating}★] "${r.body}"`)
        .join("\n");

    if (!reviewTexts) {
        return { summary: "Not enough review data to analyze.", score: 0 };
    }

    const systemPrompt = reportType === "executive" ? INSIGHTS_SYSTEM_PROMPT_EXEC : INSIGHTS_SYSTEM_PROMPT_QUICK;
    const userPrompt = `Here are the most recent customer reviews:\n\n${reviewTexts}\n\nProvide the insight summary based on the requested rules.`;

    const summary = await callAI(config, systemPrompt, userPrompt);
    const avgRating = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;

    return { summary, score: avgRating };
}

// ─── PUBLIC API: CONNECTION TEST ─────────────────────────────────

export async function testAIConnection(config: AIConfig): Promise<{ success: boolean; message: string }> {
    try {
        const result = await callAI(config, "You are a helpful assistant.", "Reply with only: Connection successful!");
        return { success: true, message: result || "Connected!" };
    } catch (error: any) {
        return { success: false, message: error.message || "Connection failed" };
    }
}
