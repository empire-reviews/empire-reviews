/**
 * Empire Reviews — In-app merchant support chatbot endpoint.
 *
 * POST /api/support
 *   Body (JSON): { question: string; history?: Array<{ role: "user"|"assistant"; content: string }> }
 *   Response:    { success: boolean; answer: string; canEscalate: boolean; needsHuman?: boolean }
 *
 * Auth: Shopify embedded admin (authenticate.admin).
 *
 * AI key resolution (3-tier):
 *   1. Merchant's own BYOK key (settings.aiProvider + settings.aiApiKey — AES-encrypted in DB).
 *   2. Empire's platform key from env (SUPPORT_AI_PROVIDER + SUPPORT_AI_KEY — raw, not encrypted).
 *   3. Canned KB answer → human escalation (needsHuman: true).
 *
 * The tier used is never exposed to the client.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../utils/encryption.server";
import { generateSupportAnswer, type AIProvider } from "../services/ai.server";
import { getCannedAnswer, SUPPORT_SYSTEM_PROMPT } from "../lib/support-kb";

const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_TURNS = 10;

// ── Platform fallback key (Empire's own server env var, not encrypted) ─────
function getPlatformAIConfig(): { provider: AIProvider; apiKey: string } | null {
  const provider = (process.env.SUPPORT_AI_PROVIDER || "").trim() as AIProvider;
  const apiKey = (process.env.SUPPORT_AI_KEY || "").trim();
  if (!provider || !apiKey) return null;
  const VALID: AIProvider[] = ["openai", "gemini", "claude", "deepseek", "groq", "ollama"];
  if (!VALID.includes(provider)) return null;
  return { provider, apiKey };
}

// Only allow POST — return 405 on GET so Remix doesn't 404
export const loader = async () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Authenticate as an embedded admin app
  let session: { shop: string };
  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate body
  let question: string;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  try {
    const body = await request.json();
    question = (body.question ?? "").toString().trim();
    if (Array.isArray(body.history)) {
      history = body.history
        .slice(-MAX_HISTORY_TURNS)
        .filter(
          (m: unknown) =>
            m &&
            typeof m === "object" &&
            typeof (m as any).role === "string" &&
            typeof (m as any).content === "string" &&
            ["user", "assistant"].includes((m as any).role)
        )
        .map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content).slice(0, 2000),
        }));
    }
  } catch {
    return json(
      { success: false, answer: "Invalid request body.", canEscalate: true },
      { status: 400 }
    );
  }

  if (!question) {
    return json(
      { success: false, answer: "Please enter a question.", canEscalate: true },
      { status: 400 }
    );
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return json(
      { success: false, answer: "Question is too long (max 1000 characters).", canEscalate: true },
      { status: 400 }
    );
  }

  // Load merchant settings — RESILIENT: if the DB is down or the schema is mid-
  // migration (the exact situation where a merchant most needs to reach us), we
  // degrade to canned/human instead of 500-ing. The support bot must survive an
  // app failure, because it's how the user tells us the app failed.
  let settings: { aiProvider: string | null; aiApiKey: string | null } | null = null;
  try {
    settings = await prisma.settings.findFirst({
      where: { shop: session.shop },
      select: { aiProvider: true, aiApiKey: true },
    });
  } catch (dbErr) {
    console.error("[support] settings lookup failed (degrading gracefully):", (dbErr as Error).message);
  }

  // Log every exchange (best-effort) so we can see what merchants ask, how often,
  // and spot when many hit the same bug. Never let a logging failure break the reply.
  const finish = async (
    answer: string,
    opts: { success: boolean; usedAi: boolean; escalated: boolean; needsHuman?: boolean }
  ) => {
    try {
      await prisma.supportLog.create({
        data: { shop: session.shop, question, answer, usedAi: opts.usedAi, escalated: opts.escalated },
      });
    } catch (logErr) {
      console.error("[support] conversation logging failed:", (logErr as Error).message);
    }
    return json({
      success: opts.success,
      answer,
      canEscalate: true,
      ...(opts.needsHuman ? { needsHuman: true } : {}),
    });
  };

  // ── Tier 1: Merchant's own BYOK key ──────────────────────────────
  if (settings?.aiProvider && settings?.aiApiKey) {
    try {
      const decryptedKey = decrypt(settings.aiApiKey);
      if (decryptedKey) {
        const answer = await generateSupportAnswer(
          { provider: settings.aiProvider as AIProvider, apiKey: decryptedKey },
          question,
          history,
          SUPPORT_SYSTEM_PROMPT
        );
        return finish(answer, { success: true, usedAi: true, escalated: false });
      }
    } catch (err) {
      console.error("[support] merchant AI call failed:", (err as Error).message);
      // Fall through to tier 2
    }
  }

  // ── Tier 2: Empire's platform key (env vars, not encrypted) ──────
  const platformConfig = getPlatformAIConfig();
  if (platformConfig) {
    try {
      const answer = await generateSupportAnswer(
        platformConfig,
        question,
        history,
        SUPPORT_SYSTEM_PROMPT
      );
      return finish(answer, { success: true, usedAi: true, escalated: false });
    } catch (err) {
      console.error("[support] platform AI call failed:", (err as Error).message);
      // Fall through to tier 3
    }
  }

  // ── Tier 3: Canned KB answer → human escalation ──────────────────
  const canned = getCannedAnswer(question);
  if (canned) {
    return finish(canned, { success: true, usedAi: false, escalated: false });
  }

  return finish(
    "I wasn't able to look that up right now. Please use the \"Talk to a human\" button below and our team will help you shortly.",
    { success: false, usedAi: false, escalated: true, needsHuman: true }
  );
};
