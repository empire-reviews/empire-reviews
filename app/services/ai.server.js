/**
 * Empire Reviews — Multi-Provider AI Service (BYOK)
 * Supports: OpenAI, Gemini, Claude, DeepSeek, Ollama
 */
// ─── PROVIDER ENDPOINTS ──────────────────────────────────────────
const PROVIDER_ENDPOINTS = {
    openai: "https://api.openai.com/v1/chat/completions",
    gemini: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    claude: "https://api.anthropic.com/v1/messages",
    deepseek: "https://api.deepseek.com/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    ollama: "http://localhost:11434/api/chat",
};
const PROVIDER_MODELS = {
    openai: "gpt-4o-mini",
    gemini: "gemini-2.0-flash",
    claude: "claude-3-haiku-20240307",
    deepseek: "deepseek-chat",
    groq: "llama-3.3-70b-versatile",
    ollama: "llama3",
};
// ─── UNIFIED AI CALL ─────────────────────────────────────────────
async function callAI(config, systemPrompt, userPrompt) {
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
    }
    catch (error) {
        console.error(`[AI Service] ${provider} error:`, error.message || error);
        throw new Error(`AI generation failed: ${error.message || "Unknown error"}`);
    }
}
// ─── PROVIDER ADAPTERS ───────────────────────────────────────────
/** OpenAI, DeepSeek & Groq (same API format) */
async function callOpenAICompatible(endpoint, apiKey, model, systemPrompt, userPrompt) {
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
async function callGemini(apiKey, systemPrompt, userPrompt) {
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
async function callClaude(apiKey, systemPrompt, userPrompt) {
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
async function callOllama(configKey, systemPrompt, userPrompt) {
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
        }
        else if (configKey.startsWith("http")) {
            endpoint = configKey.replace(/\/$/, "") + "/api/chat";
        }
        else {
            model = configKey; // just model name
        }
    }
    const headers = { "Content-Type": "application/json" };
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
export async function generateReply(config, reviewBody, rating, customerName) {
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
export async function generateInsights(config, reviews, reportType = "quick") {
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
export async function testAIConnection(config) {
    try {
        const result = await callAI(config, "You are a helpful assistant.", "Reply with only: Connection successful!");
        return { success: true, message: result || "Connected!" };
    }
    catch (error) {
        return { success: false, message: error.message || "Connection failed" };
    }
}
// ─── PUBLIC API: CAMPAIGN EMAIL GENERATION ───────────────────────
const CAMPAIGN_SYSTEM_PROMPT = `You are an expert email marketing copywriter for e-commerce stores.
Your job is to write a short, persuasive review-request email based on the merchant's description.

Rules:
- Return ONLY valid JSON with exactly two fields: "subject" and "body"
- subject: A compelling email subject line (max 60 characters)
- body: The email body text. Use {{ name }} as the customer name placeholder.
- Keep the body under 120 words. Be warm, human, and persuasive.
- Do NOT include any markdown, code fences, or extra text outside the JSON.

Example output format:
{"subject": "Your opinion matters to us 💬", "body": "Hi {{ name }},\\n\\nWe hope you loved your recent order! ..."}`;
export async function callAIForCampaign(config, prompt) {
    const userPrompt = `Merchant's instructions: "${prompt}"\n\nWrite the campaign email now. Return only JSON.`;
    const raw = await callAI(config, CAMPAIGN_SYSTEM_PROMPT, userPrompt);
    // Parse the JSON output from the AI
    try {
        // Strip any accidental code fences the AI might add
        const cleaned = raw.replace(/```json?/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.subject && parsed.body) {
            return { subject: parsed.subject, body: parsed.body };
        }
    }
    catch (e) {
        console.error("[AI Campaign] Failed to parse JSON response:", raw);
    }
    // Graceful fallback if parsing fails
    return {
        subject: "We'd love your feedback! 🌟",
        body: `Hi {{ name }},\n\nThank you for your recent order! We would love to hear your thoughts. Could you spare a moment to leave us a quick review?\n\nYour feedback helps us improve and grow.\n\nThank you!`
    };
}
