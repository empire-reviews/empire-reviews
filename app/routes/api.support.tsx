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

// ── Live presence (Online/Offline + typing) for the support inbox ──────────
const OWNER_SHOP = (process.env.OWNER_SHOP || "").trim();
const ONLINE_WINDOW_MS = 35000; // owner counts as online if seen within 35s
const TYPING_WINDOW_MS = 6000; // typing shown if owner typed to this shop within 6s

async function computePresence(forShop: string): Promise<{ online: boolean; typing: boolean }> {
  try {
    const p = await prisma.supportPresence.findUnique({ where: { scope: "owner" } });
    if (!p) return { online: false, typing: false };
    const now = Date.now();
    const online = now - new Date(p.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
    const typing =
      online &&
      p.typingShop === forShop &&
      !!p.typingAt &&
      now - new Date(p.typingAt).getTime() < TYPING_WINDOW_MS;
    return { online, typing };
  } catch {
    // Table may be mid-migration — never break the widget over presence.
    return { online: false, typing: false };
  }
}

// ── Astra: the AI assistant that answers merchants in the Messages thread ──
// Same tiering as the old chat: curated LearnedAnswer → merchant BYOK key →
// Empire platform key → canned KB. Returns escalate=true when it genuinely
// can't help (no answer) or the answer itself routes the merchant to a human.
const ESCALATE_RE = /talk to (a )?(human|person|team)|reach (out to )?(a )?(human|our team)|connect you/i;

async function answerAsAstra(
  shop: string,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ answer: string; usedAi: boolean; learned: boolean; escalate: boolean }> {
  // Tier 0: human-verified LearnedAnswer
  try {
    const learned = await prisma.learnedAnswer.findMany({
      where: { active: true },
      select: { answer: true, keywords: true, question: true },
      take: 200,
    });
    const q = question.toLowerCase();
    const hit = learned.find((l) => {
      const kws = (l.keywords || "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (kws.some((k) => q.includes(k))) return true;
      const lq = (l.question || "").toLowerCase().trim();
      return lq.length > 0 && (q.includes(lq) || lq.includes(q));
    });
    if (hit) return { answer: hit.answer, usedAi: false, learned: true, escalate: false };
  } catch (e) {
    console.error("[astra] learned lookup failed:", (e as Error).message);
  }

  let settings: { aiProvider: string | null; aiApiKey: string | null } | null = null;
  try {
    settings = await prisma.settings.findFirst({ where: { shop }, select: { aiProvider: true, aiApiKey: true } });
  } catch { /* degrade */ }

  // Tier 1: merchant's own BYOK key (if present)
  if (settings?.aiProvider && settings?.aiApiKey) {
    try {
      const key = decrypt(settings.aiApiKey);
      if (key) {
        const answer = await generateSupportAnswer({ provider: settings.aiProvider as AIProvider, apiKey: key }, question, history, SUPPORT_SYSTEM_PROMPT);
        return { answer, usedAi: true, learned: false, escalate: ESCALATE_RE.test(answer) };
      }
    } catch (e) {
      console.error("[astra] merchant AI failed:", (e as Error).message);
    }
  }

  // Tier 2: Empire platform key
  const platform = getPlatformAIConfig();
  if (platform) {
    try {
      const answer = await generateSupportAnswer(platform, question, history, SUPPORT_SYSTEM_PROMPT);
      return { answer, usedAi: true, learned: false, escalate: ESCALATE_RE.test(answer) };
    } catch (e) {
      console.error("[astra] platform AI failed:", (e as Error).message);
    }
  }

  // Tier 3: canned KB answer
  const canned = getCannedAnswer(question);
  if (canned) return { answer: canned, usedAi: false, learned: false, escalate: ESCALATE_RE.test(canned) };

  // Nothing could answer → escalate to a human.
  return { answer: "", usedAi: false, learned: false, escalate: true };
}

async function getThreadStatus(shop: string): Promise<"ai" | "human"> {
  try {
    const t = await prisma.supportThread.findUnique({ where: { shop }, select: { status: true } });
    return t?.status === "human" ? "human" : "ai";
  } catch {
    return "ai";
  }
}

async function setThreadHuman(shop: string): Promise<void> {
  try {
    await prisma.supportThread.upsert({ where: { shop }, create: { shop, status: "human" }, update: { status: "human" } });
  } catch (e) {
    console.error("[support] setThreadHuman failed:", (e as Error).message);
  }
}

const ASTRA_HANDOFF = "Let me bring in a teammate for this — someone from the Empire team will reply right here shortly. 👋";
const ASTRA_CONNECTING = "Connecting you with the Empire team — someone will reply here shortly. 👋";

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

  let rawBody: any;
  try {
    rawBody = await request.json();
  } catch {
    return json({ success: false, answer: "Invalid request body.", canEscalate: true }, { status: 400 });
  }

  // ── Feedback path: record 👍/👎 on a previously-logged answer ──────
  // This is the signal the learning loop runs on — a 👎 surfaces the answer as a
  // "gap" in the Support & Learning panel for a human to correct.
  if (rawBody && rawBody.intent === "feedback") {
    const logId = String(rawBody.logId || "");
    const helpful = rawBody.helpful === true ? true : rawBody.helpful === false ? false : null;
    if (!logId || helpful === null) {
      return json({ ok: false, error: "Invalid feedback" }, { status: 400 });
    }
    try {
      // Re-scope by shop so a merchant can only rate their own conversations.
      await prisma.supportLog.updateMany({
        where: { id: logId, shop: session.shop },
        data: { helpful },
      });
    } catch (e) {
      console.error("[support] feedback update failed:", (e as Error).message);
    }
    return json({ ok: true });
  }

  // ── Messages inbox: merchant ↔ Empire team (two-way support thread) ──
  // The widget's Messages tab lists the thread and posts new merchant messages.
  // Owner replies are written from the Support & Learning panel (sender:"team").
  if (rawBody && rawBody.intent === "list_messages") {
    try {
      const rows = await prisma.supportMessage.findMany({
        where: { shop: session.shop, archivedAt: null },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, sender: true, body: true, createdAt: true },
      });
      // Mark team→merchant messages as read now that the merchant is viewing them.
      await prisma.supportMessage.updateMany({
        where: { shop: session.shop, sender: "team", readAt: null },
        data: { readAt: new Date() },
      });
      const presence = await computePresence(session.shop);
      const mode = await getThreadStatus(session.shop);
      return json({ ok: true, messages: rows, presence, mode });
    } catch (e) {
      console.error("[support] list_messages failed (table may be mid-migration):", (e as Error).message);
      return json({ ok: true, messages: [], presence: { online: false, typing: false }, mode: "ai" });
    }
  }

  // Owner heartbeat + typing signal — written by the Support & Learning panel.
  if (rawBody && rawBody.intent === "owner_presence") {
    if (!OWNER_SHOP || session.shop !== OWNER_SHOP) return json({ ok: false }, { status: 403 });
    const typingShop = rawBody.typingShop ? String(rawBody.typingShop).slice(0, 120) : null;
    try {
      await prisma.supportPresence.upsert({
        where: { scope: "owner" },
        create: { scope: "owner", lastSeenAt: new Date(), typingShop, typingAt: typingShop ? new Date() : null },
        update: { lastSeenAt: new Date(), ...(typingShop ? { typingShop, typingAt: new Date() } : {}) },
      });
    } catch (e) {
      console.error("[support] owner_presence failed:", (e as Error).message);
    }
    return json({ ok: true });
  }

  // Merchant widget asks: is the team online / typing to me right now?
  if (rawBody && rawBody.intent === "presence") {
    const presence = await computePresence(session.shop);
    return json({ ok: true, presence });
  }

  // Owner panel polls this to show new merchant messages live (no full reload).
  if (rawBody && rawBody.intent === "owner_threads") {
    if (!OWNER_SHOP || session.shop !== OWNER_SHOP) return json({ ok: false, threads: [] }, { status: 403 });
    try {
      const rows = await prisma.supportMessage.findMany({
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: { id: true, shop: true, sender: true, body: true, readAt: true, createdAt: true },
      });
      const map = new Map<string, { shop: string; messages: unknown[]; unread: number; lastAt: Date }>();
      for (const m of rows) {
        if (!map.has(m.shop)) map.set(m.shop, { shop: m.shop, messages: [], unread: 0, lastAt: m.createdAt });
        const t = map.get(m.shop)!;
        t.messages.push({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt });
        if (m.sender === "merchant" && !m.readAt) t.unread += 1;
        t.lastAt = m.createdAt;
      }
      // Only surface threads that reached a human — Astra-handled chats don't
      // clutter the owner inbox.
      let humanShops = new Set<string>();
      try {
        const ts = await prisma.supportThread.findMany({ where: { status: "human" }, select: { shop: true } });
        humanShops = new Set(ts.map((t) => t.shop));
      } catch { /* if the table is missing, show nothing rather than everything */ }

      const threads = Array.from(map.values())
        .filter((t) => humanShops.has(t.shop))
        .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      return json({ ok: true, threads });
    } catch (e) {
      console.error("[support] owner_threads failed:", (e as Error).message);
      return json({ ok: true, threads: [] });
    }
  }

  if (rawBody && rawBody.intent === "send_message") {
    const text = String(rawBody.body || "").trim().slice(0, 2000);
    if (!text) return json({ ok: false, error: "Empty message" }, { status: 400 });
    try {
      const merchantMsg = await prisma.supportMessage.create({
        data: { shop: session.shop, sender: "merchant", body: text },
        select: { id: true, sender: true, body: true, createdAt: true },
      });

      // If the thread is already with a human, Astra stays out of it.
      const status = await getThreadStatus(session.shop);
      if (status === "human") {
        return json({ ok: true, message: merchantMsg, mode: "human" });
      }

      // Otherwise Astra answers (merchant key → platform key → canned KB).
      const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(rawBody.history)
        ? rawBody.history
            .slice(-MAX_HISTORY_TURNS)
            .filter((m: any) => m && typeof m === "object" && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
            .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
        : [];
      const astra = await answerAsAstra(session.shop, text, history);

      if (astra.escalate || !astra.answer) {
        await setThreadHuman(session.shop);
        const handoff = await prisma.supportMessage.create({
          data: { shop: session.shop, sender: "astra", body: ASTRA_HANDOFF },
          select: { id: true, sender: true, body: true, createdAt: true },
        });
        return json({ ok: true, message: merchantMsg, astra: handoff, mode: "human", escalated: true });
      }

      const astraMsg = await prisma.supportMessage.create({
        data: { shop: session.shop, sender: "astra", body: astra.answer },
        select: { id: true, sender: true, body: true, createdAt: true },
      });
      return json({ ok: true, message: merchantMsg, astra: astraMsg, mode: "ai" });
    } catch (e) {
      console.error("[support] send_message failed:", (e as Error).message);
      return json({ ok: false, error: "Could not send message right now." }, { status: 500 });
    }
  }

  // Start a fresh session — archive the current messages and hand back to Astra.
  if (rawBody && rawBody.intent === "new_conversation") {
    try {
      await prisma.supportMessage.updateMany({
        where: { shop: session.shop, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      await prisma.supportThread.upsert({
        where: { shop: session.shop },
        create: { shop: session.shop, status: "ai" },
        update: { status: "ai" },
      });
      return json({ ok: true, mode: "ai" });
    } catch (e) {
      console.error("[support] new_conversation failed:", (e as Error).message);
      return json({ ok: false }, { status: 500 });
    }
  }

  // Explicit escalation — the dedicated "Talk to a human" button or a 👎 on Astra.
  if (rawBody && rawBody.intent === "escalate") {
    try {
      await setThreadHuman(session.shop);
      const msg = await prisma.supportMessage.create({
        data: { shop: session.shop, sender: "astra", body: ASTRA_CONNECTING },
        select: { id: true, sender: true, body: true, createdAt: true },
      });
      return json({ ok: true, mode: "human", message: msg });
    } catch (e) {
      console.error("[support] escalate failed:", (e as Error).message);
      return json({ ok: false }, { status: 500 });
    }
  }

  try {
    const body = rawBody;
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
  // and spot when many hit the same bug. Returns the log id so the widget can
  // attach 👍/👎 feedback to this exact answer.
  const finish = async (
    answer: string,
    opts: { success: boolean; usedAi: boolean; learned?: boolean; escalated: boolean; needsHuman?: boolean }
  ) => {
    let logId: string | null = null;
    try {
      const row = await prisma.supportLog.create({
        data: {
          shop: session.shop,
          question,
          answer,
          usedAi: opts.usedAi,
          learned: opts.learned ?? false,
          escalated: opts.escalated,
        },
        select: { id: true },
      });
      logId = row.id;
    } catch (logErr) {
      console.error("[support] conversation logging failed:", (logErr as Error).message);
    }
    return json({
      success: opts.success,
      answer,
      canEscalate: true,
      ...(logId ? { logId } : {}),
      ...(opts.needsHuman ? { needsHuman: true } : {}),
    });
  };

  // ── Tier 0: Curated LearnedAnswer (human-verified) wins ──────────
  // The bot's memory of past corrections. A match here means a human already
  // taught the bot the right answer to this kind of question — trust it over AI.
  try {
    const learned = await prisma.learnedAnswer.findMany({
      where: { active: true },
      select: { answer: true, keywords: true, question: true },
      take: 200,
    });
    const q = question.toLowerCase();
    const hit = learned.find((l) => {
      const kws = (l.keywords || "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (kws.some((k) => q.includes(k))) return true;
      // also match if the stored question is very close (substring either way)
      const lq = (l.question || "").toLowerCase().trim();
      return lq.length > 0 && (q.includes(lq) || lq.includes(q));
    });
    if (hit) {
      return finish(hit.answer, { success: true, usedAi: false, learned: true, escalated: false });
    }
  } catch (e) {
    console.error("[support] learned-answer lookup failed (degrading):", (e as Error).message);
  }

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
