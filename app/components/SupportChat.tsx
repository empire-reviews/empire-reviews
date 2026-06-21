/**
 * Empire Reviews — Floating in-app support center.
 *
 * A Judge.me/Intercom-style support widget rendered in the admin (a fixed gold
 * bubble at bottom-right). Opening it reveals a tabbed panel:
 *   • Home     — personalized greeting, search, featured card → AI chat, recommended articles
 *   • Help     — knowledge base: collections → articles → article view (with Table of Contents)
 *   • Messages — (Phase 1 stub) empty state + "Talk to a human"; Phase 2 = real DB-backed inbox
 *   • Chat     — the AI assistant (3-tier key + FAQ + human handoff) with 👍/👎 learning loop
 *
 * Help content comes from app/lib/help-articles.ts — the same source that will
 * feed the public SEO help pages, so the widget and the website never drift.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import {
  HELP_COLLECTIONS,
  getArticle,
  getArticlesByCollection,
  getFeaturedArticles,
  collectionArticleCount,
  searchArticles,
  tableOfContents,
  type HelpArticle,
  type HelpBlock,
} from "../lib/help-articles";

// ── Types ────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  isError?: boolean;
  logId?: string; // server log id — lets us attach 👍/👎 feedback to this answer
  feedback?: "up" | "down"; // set once the user rates this answer
}

interface SupportActionData {
  success?: boolean;
  answer?: string;
  canEscalate?: boolean;
  needsHuman?: boolean;
  logId?: string;
  error?: string;
}

interface SupportChatProps {
  /** The merchant's myshopify.com domain — used for the greeting + mailto escalation */
  shop?: string;
}

type View = "home" | "help" | "collection" | "article" | "chat" | "messages";

// ── Helpers ──────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** "empire-test-1.myshopify.com" → "empire-test-1" for a friendly greeting. */
function shopName(shop?: string): string {
  if (!shop) return "there";
  return shop.replace(/\.myshopify\.com$/i, "");
}

function buildMailto(shop: string | undefined, history: Message[]): string {
  const subject = encodeURIComponent("Empire Reviews Support Request");
  const shopLine = shop ? `Shop: ${shop}\n` : "";
  const historyLines = history
    .filter((m) => m.role !== "system")
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Merchant" : "Bot"}: ${m.content}`)
    .join("\n");
  const body = encodeURIComponent(
    `Hi Empire Reviews team,\n\nI need help with the app.\n\n${shopLine}\nRecent chat:\n${historyLines}\n\n---\nPlease describe your issue below:\n`
  );
  return `mailto:support@empirereviews.com?subject=${subject}&body=${body}`;
}

function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Styles (inline — app uses inline styles widely) ───────────────

const Z = 9999;
const NAVY = "#1a1f36";
const NAVY2 = "#2d3561";
const GOLD = "#c9a227";
const GOLD2 = "#e8c84a";

const styles = {
  bubble: (open: boolean): React.CSSProperties => ({
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: Z,
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: open
      ? "radial-gradient(circle at 32% 28%, #3a4374 0%, #1a1f36 70%)"
      : "radial-gradient(circle at 32% 28%, #fff0b8 0%, #e8c84a 38%, #c9a227 78%, #a8851a 100%)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: open
      ? "0 6px 16px rgba(0,0,0,0.30), inset 0 2px 4px rgba(255,255,255,0.18)"
      : "0 6px 16px rgba(0,0,0,0.28), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(120,90,0,0.35)",
    transition: "transform 0.15s ease, background 0.25s ease",
    outline: "none",
    color: open ? GOLD2 : NAVY,
    fontSize: 24,
    fontWeight: 700,
    userSelect: "none",
    animation: open ? "none" : "empire-bubble-float 3s ease-in-out infinite, empire-bubble-glow 3s ease-in-out infinite",
  }),
  panel: (open: boolean): React.CSSProperties => ({
    position: "fixed",
    bottom: 86,
    right: 20,
    zIndex: Z,
    width: 372,
    height: 564,
    maxHeight: "calc(100vh - 110px)",
    background: "#ffffff",
    borderRadius: 18,
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    opacity: open ? 1 : 0,
    pointerEvents: open ? "all" : "none",
    transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  }),
  // Header — tall gradient on Home, compact bar elsewhere
  header: (tall: boolean): React.CSSProperties => ({
    background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`,
    color: "#ffffff",
    padding: tall ? "20px 18px 22px" : "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  }),
  headerTitle: { fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.01em" } as React.CSSProperties,
  headerSub: { fontSize: "0.72rem", color: GOLD, marginTop: 1 } as React.CSSProperties,
  greetingBig: { fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.25, margin: 0 } as React.CSSProperties,
  iconBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "none",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    width: 28,
    height: 28,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as React.CSSProperties,
  closeBtn: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    color: "#cbd2e0",
    cursor: "pointer",
    fontSize: 20,
    lineHeight: 1,
    padding: "0 2px",
    display: "flex",
    alignItems: "center",
  } as React.CSSProperties,
  body: {
    flex: 1,
    overflowY: "auto" as const,
    background: "#f7f8fa",
  },
  // search box
  searchWrap: { padding: "14px 16px 6px" } as React.CSSProperties,
  search: {
    width: "100%",
    border: "1.5px solid #e1e4ea",
    borderRadius: 12,
    padding: "11px 14px",
    fontSize: "0.88rem",
    outline: "none",
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    boxSizing: "border-box" as const,
  },
  // generic card
  card: {
    background: "#ffffff",
    border: "1px solid #eef0f3",
    borderRadius: 14,
    margin: "10px 16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    overflow: "hidden",
  } as React.CSSProperties,
  rowBtn: {
    width: "100%",
    background: "none",
    border: "none",
    borderBottom: "1px solid #f1f2f5",
    padding: "13px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    textAlign: "left" as const,
  },
  rowTitle: { fontSize: "0.86rem", fontWeight: 600, color: "#1f2330", lineHeight: 1.35 } as React.CSSProperties,
  rowSub: { fontSize: "0.74rem", color: "#8a909c", marginTop: 2 } as React.CSSProperties,
  chevron: { marginLeft: "auto", color: "#c2c7d0", fontSize: "1rem", flexShrink: 0 } as React.CSSProperties,
  sectionLabel: { fontSize: "0.72rem", fontWeight: 700, color: "#9aa0ac", textTransform: "uppercase" as const, letterSpacing: "0.04em", margin: "16px 16px 2px" } as React.CSSProperties,
  // featured / CTA card
  cta: {
    margin: "-12px 16px 4px",
    position: "relative" as const,
    background: "#ffffff",
    border: "1px solid #eef0f3",
    borderRadius: 14,
    padding: "14px 16px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    textAlign: "left" as const,
    width: "calc(100% - 32px)",
  },
  // article view
  articleWrap: { padding: "16px 18px 24px" } as React.CSSProperties,
  articleTitle: { fontSize: "1.15rem", fontWeight: 800, color: "#1a1f2e", lineHeight: 1.3, margin: "0 0 4px" } as React.CSSProperties,
  articleMeta: { fontSize: "0.72rem", color: "#9aa0ac", margin: "0 0 14px" } as React.CSSProperties,
  proCallout: { background: "#f0f6f2", border: "1px solid #cfe6d8", borderRadius: 10, padding: "10px 12px", margin: "0 0 14px", fontSize: "0.8rem", color: "#1f6b3d" } as React.CSSProperties,
  toc: { background: "#fff", border: "1px solid #eef0f3", borderRadius: 10, padding: "10px 12px", margin: "0 0 16px" } as React.CSSProperties,
  tocItem: { display: "block", background: "none", border: "none", padding: "3px 0", color: GOLD, fontSize: "0.8rem", cursor: "pointer", textAlign: "left" as const, width: "100%" },
  h4: { fontSize: "0.95rem", fontWeight: 700, color: "#1a1f2e", margin: "16px 0 6px", scrollMarginTop: 8 } as React.CSSProperties,
  p: { fontSize: "0.86rem", lineHeight: 1.6, color: "#3b4150", margin: "0 0 10px" } as React.CSSProperties,
  calloutBox: { background: "#fffbe9", border: "1px solid #f3e2a8", borderRadius: 10, padding: "10px 12px", margin: "8px 0 12px", fontSize: "0.82rem", color: "#705c12", lineHeight: 1.5 } as React.CSSProperties,
  // empty state (Messages)
  empty: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center" as const, color: "#6b7280" },
  primaryBtn: {
    background: NAVY,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "11px 20px",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    textDecoration: "none",
  } as React.CSSProperties,
  // chat
  messages: { flex: 1, overflowY: "auto" as const, padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 10, background: "#f7f8fa" },
  msgRow: (role: Message["role"]): React.CSSProperties => ({ display: "flex", flexDirection: "column", alignItems: role === "user" ? "flex-end" : "flex-start" }),
  bubble_msg: (role: Message["role"], isError?: boolean): React.CSSProperties => ({
    maxWidth: "82%",
    padding: "9px 13px",
    borderRadius: role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
    background: role === "user" ? `linear-gradient(135deg, ${NAVY}, ${NAVY2})` : isError ? "#fff2f2" : "#ffffff",
    color: role === "user" ? "#ffffff" : isError ? "#c0392b" : "#202223",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    border: isError ? "1px solid #f5c6cb" : role === "assistant" ? "1px solid #eef0f3" : "none",
  }),
  typingDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#9ca3af", margin: "0 2px", animation: "empire-typing-bounce 1.2s infinite ease-in-out" } as React.CSSProperties,
  feedbackRow: { display: "flex", alignItems: "center", gap: 4, marginTop: 4, paddingLeft: 4 } as React.CSSProperties,
  feedbackLabel: { fontSize: "0.72rem", color: "#9ca3af" } as React.CSSProperties,
  feedbackBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "0.95rem", padding: "0 2px", lineHeight: 1, opacity: 0.8 } as React.CSSProperties,
  feedbackThanks: { fontSize: "0.72rem", color: "#16a34a", fontWeight: 600 } as React.CSSProperties,
  inputRow: { display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #e5e7eb", background: "#fafafa", flexShrink: 0 } as React.CSSProperties,
  input: { flex: 1, border: "1.5px solid #d1d5db", borderRadius: 10, padding: "8px 12px", fontSize: "0.85rem", outline: "none", resize: "none" as const, fontFamily: "inherit", lineHeight: 1.4, maxHeight: 90, overflowY: "auto" as const, background: "#ffffff" },
  sendBtn: (disabled: boolean): React.CSSProperties => ({ background: disabled ? "#d1d5db" : `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, border: "none", borderRadius: 10, color: disabled ? "#9ca3af" : NAVY, fontWeight: 700, fontSize: "0.82rem", cursor: disabled ? "default" : "pointer", padding: "8px 14px", alignSelf: "flex-end", transition: "background 0.15s ease", whiteSpace: "nowrap" as const }),
  humanLink: { fontSize: "0.78rem", color: "#6d7175", textDecoration: "none" } as React.CSSProperties,
  footer: { padding: "8px 14px", borderTop: "1px solid #f0f0f0", textAlign: "center" as const, background: "#fafafa", flexShrink: 0 } as React.CSSProperties,
  // bottom tab bar
  tabBar: { display: "flex", borderTop: "1px solid #eceef1", background: "#ffffff", flexShrink: 0 } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "9px 0 8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    color: active ? NAVY : "#9aa0ac",
    fontWeight: active ? 700 : 500,
    fontSize: "0.7rem",
  }),
};

// ── Article body renderer ────────────────────────────────────────

function ArticleBlock({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "heading":
      return <h4 id={slugifyHeading(block.text)} style={styles.h4}>{block.text}</h4>;
    case "paragraph":
      return <p style={styles.p}>{block.text}</p>;
    case "list":
      return (
        <ul style={{ ...styles.p, paddingLeft: 18, margin: "0 0 10px" }}>
          {block.items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
        </ul>
      );
    case "steps":
      return (
        <ol style={{ ...styles.p, paddingLeft: 18, margin: "0 0 10px" }}>
          {block.items.map((it, i) => <li key={i} style={{ marginBottom: 5 }}>{it}</li>)}
        </ol>
      );
    case "callout":
      return <div style={styles.calloutBox}>💡 {block.text}</div>;
    default:
      return null;
  }
}

// ── Component ─────────────────────────────────────────────────────

export default function SupportChat({ shop }: SupportChatProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [articleSlug, setArticleSlug] = useState<string | null>(null);
  const [articleBack, setArticleBack] = useState<View>("help");
  const [query, setQuery] = useState("");

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your Empire Reviews assistant. Ask me how to do anything in the app — adding widgets, managing reviews, email campaigns, AI features, and more.",
    },
  ]);
  const [input, setInput] = useState("");
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetcher = useFetcher<SupportActionData>();
  const feedbackFetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const sendFeedback = useCallback(
    (msgId: string, logId: string, helpful: boolean) => {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: helpful ? "up" : "down" } : m)));
      feedbackFetcher.submit(
        { intent: "feedback", logId, helpful },
        { method: "POST", action: "/api/support", encType: "application/json" }
      );
    },
    [feedbackFetcher]
  );

  // Scroll chat to bottom when messages change / chat opens
  useEffect(() => {
    if (view === "chat") listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, view]);

  useEffect(() => {
    if (open && view === "chat") setTimeout(() => inputRef.current?.focus(), 120);
  }, [open, view]);

  // Append assistant answers when the fetcher returns
  const lastFetcherData = fetcher.data;
  const prevDataRef = useRef<SupportActionData | undefined>(undefined);
  useEffect(() => {
    if (!lastFetcherData || lastFetcherData === prevDataRef.current) return;
    prevDataRef.current = lastFetcherData;
    const answer = lastFetcherData.answer ?? "";
    const isError = !lastFetcherData.success && !answer;
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        content: answer || "Something went wrong. Please try again or talk to a human.",
        isError: isError || lastFetcherData.needsHuman,
        logId: lastFetcherData.logId,
      },
    ]);
  }, [lastFetcherData]);

  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || isLoading) return;
    const userMsg: Message = { id: uid(), role: "user", content: q };
    setMessages((prev) => {
      const updated = [...prev, userMsg];
      const history = updated
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1)
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      fetcher.submit({ question: q, history }, { method: "POST", action: "/api/support", encType: "application/json" });
      return updated;
    });
    setInput("");
  }, [input, isLoading, fetcher]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Navigation helpers ──
  const openArticle = useCallback((slug: string, from: View) => {
    setArticleSlug(slug);
    setArticleBack(from);
    setView("article");
  }, []);
  const openCollection = useCallback((id: string) => {
    setCollectionId(id);
    setView("collection");
  }, []);
  const goTab = useCallback((v: View) => {
    setView(v);
    setQuery("");
  }, []);
  const back = useCallback(() => {
    if (view === "article") setView(articleBack);
    else if (view === "collection") setView("help");
    else if (view === "chat") setView("home");
    else setView("home");
  }, [view, articleBack]);

  const mailtoHref = buildMailto(shop, messages);
  const name = shopName(shop);
  const featured = getFeaturedArticles();
  const results = query.trim() ? searchArticles(query) : [];
  const isDetail = view === "article" || view === "chat" || view === "collection";
  const activeTab: View = view === "collection" || view === "article" ? "help" : view === "chat" ? "home" : view;

  return (
    <>
      <style>{`
        @keyframes empire-typing-bounce { 0%,80%,100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-5px); opacity: 1; } }
        @keyframes empire-bubble-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes empire-bubble-glow {
          0%,100% { box-shadow: 0 6px 16px rgba(0,0,0,0.28), 0 0 0 0 rgba(232,200,74,0.55), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(120,90,0,0.35); }
          50% { box-shadow: 0 14px 26px rgba(0,0,0,0.30), 0 0 22px 7px rgba(232,200,74,0.55), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(120,90,0,0.35); }
        }
        .empire-support-bubble:hover { transform: scale(1.08) !important; }
        .empire-support-bubble svg { display: block; }
        .empire-hc-row:hover { background: #f7f8fa; }
        @media (prefers-reduced-motion: reduce) { .empire-support-bubble--float { animation: none !important; } }
      `}</style>

      <div style={styles.panel(open)} role="dialog" aria-label="Empire Reviews support" aria-modal="false">
        {/* ── Header ── */}
        <div style={styles.header(view === "home")}>
          {isDetail && (
            <button style={styles.iconBtn} onClick={back} aria-label="Back">‹</button>
          )}
          {view === "home" ? (
            <div>
              <div style={{ fontSize: "0.74rem", color: GOLD, fontWeight: 600, marginBottom: 6 }}>EMPIRE SUPPORT</div>
              <h2 style={styles.greetingBig}>Hi {name} 👋<br />How can we help?</h2>
            </div>
          ) : (
            <div>
              <div style={styles.headerTitle}>
                {view === "help" && "Help Center"}
                {view === "collection" && (HELP_COLLECTIONS.find((c) => c.id === collectionId)?.title ?? "Help")}
                {view === "article" && "Help Center"}
                {view === "chat" && "Empire Assistant"}
                {view === "messages" && "Messages"}
              </div>
              {view === "chat" && <div style={styles.headerSub}>Typically replies instantly</div>}
            </div>
          )}
          <button style={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close support">✕</button>
        </div>

        {/* ── HOME ── */}
        {view === "home" && (
          <div style={styles.body}>
            {/* Search */}
            <div style={{ padding: "12px 16px 4px" }}>
              <input
                style={styles.search}
                placeholder="Search for help…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
                onFocus={() => { if (!query) setView("help"); }}
                aria-label="Search help articles"
              />
            </div>
            {/* CTA → chat */}
            <button style={styles.cta} className="empire-hc-row" onClick={() => setView("chat")}>
              <span style={{ fontSize: 22 }}>💬</span>
              <span>
                <span style={styles.rowTitle}>Ask our assistant</span>
                <span style={styles.rowSub}>Instant answers about anything in the app</span>
              </span>
              <span style={styles.chevron}>→</span>
            </button>
            {/* Recommended articles */}
            <div style={styles.sectionLabel}>Recommended</div>
            <div style={styles.card}>
              {featured.map((a) => (
                <button key={a.slug} className="empire-hc-row" style={styles.rowBtn} onClick={() => openArticle(a.slug, "home")}>
                  <span>
                    <span style={styles.rowTitle}>{a.title}</span>
                    <span style={styles.rowSub}>{a.summary}</span>
                  </span>
                  <span style={styles.chevron}>›</span>
                </button>
              ))}
            </div>
            <div style={{ height: 10 }} />
          </div>
        )}

        {/* ── HELP (collections or search results) ── */}
        {view === "help" && (
          <div style={styles.body}>
            <div style={styles.searchWrap}>
              <input
                style={styles.search}
                placeholder="Search for help…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                aria-label="Search help articles"
              />
            </div>
            {query.trim() ? (
              <>
                <div style={styles.sectionLabel}>{results.length} result{results.length === 1 ? "" : "s"}</div>
                <div style={styles.card}>
                  {results.length === 0 ? (
                    <div style={{ padding: 18, fontSize: "0.84rem", color: "#8a909c" }}>
                      No articles found. Try the <button onClick={() => setView("chat")} style={{ ...styles.tocItem, display: "inline", width: "auto", padding: 0 }}>AI assistant</button> instead.
                    </div>
                  ) : results.map((a) => (
                    <button key={a.slug} className="empire-hc-row" style={styles.rowBtn} onClick={() => openArticle(a.slug, "help")}>
                      <span>
                        <span style={styles.rowTitle}>{a.title}</span>
                        <span style={styles.rowSub}>{a.summary}</span>
                      </span>
                      <span style={styles.chevron}>›</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={styles.sectionLabel}>{HELP_COLLECTIONS.length} collections</div>
                <div style={styles.card}>
                  {HELP_COLLECTIONS.map((c) => (
                    <button key={c.id} className="empire-hc-row" style={styles.rowBtn} onClick={() => openCollection(c.id)}>
                      <span style={{ fontSize: 20 }}>{c.icon}</span>
                      <span>
                        <span style={styles.rowTitle}>{c.title}</span>
                        <span style={styles.rowSub}>{collectionArticleCount(c.id)} article{collectionArticleCount(c.id) === 1 ? "" : "s"}</span>
                      </span>
                      <span style={styles.chevron}>›</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div style={{ height: 10 }} />
          </div>
        )}

        {/* ── COLLECTION (articles in a collection) ── */}
        {view === "collection" && collectionId && (
          <div style={styles.body}>
            <div style={styles.card}>
              {getArticlesByCollection(collectionId).map((a) => (
                <button key={a.slug} className="empire-hc-row" style={styles.rowBtn} onClick={() => openArticle(a.slug, "collection")}>
                  <span>
                    <span style={styles.rowTitle}>{a.title}{a.proOnly ? " ⭐" : ""}</span>
                    <span style={styles.rowSub}>{a.summary}</span>
                  </span>
                  <span style={styles.chevron}>›</span>
                </button>
              ))}
            </div>
            <div style={{ height: 10 }} />
          </div>
        )}

        {/* ── ARTICLE ── */}
        {view === "article" && articleSlug && (() => {
          const a = getArticle(articleSlug) as HelpArticle | undefined;
          if (!a) return <div style={styles.body}><div style={{ padding: 24 }}>Article not found.</div></div>;
          const toc = tableOfContents(a);
          return (
            <div style={styles.body}>
              <div style={styles.articleWrap}>
                <h2 style={styles.articleTitle}>{a.title}</h2>
                <p style={styles.articleMeta}>Updated {a.updated}</p>
                {a.proOnly && <div style={styles.proCallout}>⭐ <strong>Available on Empire Pro.</strong> Upgrade from the Plans page to unlock this feature.</div>}
                {toc.length > 1 && (
                  <div style={styles.toc}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9aa0ac", marginBottom: 4 }}>ON THIS PAGE</div>
                    {toc.map((t) => (
                      <button key={t.id} style={styles.tocItem} onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t.text}</button>
                    ))}
                  </div>
                )}
                {a.body.map((b, i) => <ArticleBlock key={i} block={b} />)}
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #eef0f3", fontSize: "0.8rem", color: "#8a909c" }}>
                  Still need help?{" "}
                  <button onClick={() => setView("chat")} style={{ ...styles.tocItem, display: "inline", width: "auto", padding: 0 }}>Ask the assistant</button>
                  {" "}or{" "}
                  <a href={mailtoHref} target="_blank" rel="noopener noreferrer" style={{ color: GOLD }}>email us</a>.
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── MESSAGES (Phase 1 stub) ── */}
        {view === "messages" && (
          <div style={styles.body}>
            <div style={styles.empty}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>💬</div>
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>No messages yet</div>
              <div style={{ fontSize: "0.84rem", marginBottom: 18 }}>Reach the Empire team and we'll get back to you by email.</div>
              <a href={mailtoHref} target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>Send us a message →</a>
              <button onClick={() => setView("chat")} style={{ ...styles.tocItem, textAlign: "center", marginTop: 14, color: GOLD }}>or ask the AI assistant</button>
            </div>
          </div>
        )}

        {/* ── CHAT ── */}
        {view === "chat" && (
          <>
            <div style={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
              {messages.map((msg) => (
                <div key={msg.id} style={styles.msgRow(msg.role)}>
                  <div style={styles.bubble_msg(msg.role, msg.isError)}>{msg.content}</div>
                  {msg.role === "assistant" && msg.logId && (
                    <div style={styles.feedbackRow}>
                      {msg.feedback ? (
                        <span style={styles.feedbackThanks}>{msg.feedback === "up" ? "Thanks for the feedback! 🙌" : "Thanks — we'll improve this. 🛠️"}</span>
                      ) : (
                        <>
                          <span style={styles.feedbackLabel}>Was this helpful?</span>
                          <button type="button" style={styles.feedbackBtn} aria-label="Helpful" onClick={() => sendFeedback(msg.id, msg.logId as string, true)}>👍</button>
                          <button type="button" style={styles.feedbackBtn} aria-label="Not helpful" onClick={() => sendFeedback(msg.id, msg.logId as string, false)}>👎</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div style={styles.msgRow("assistant")}>
                  <div style={styles.bubble_msg("assistant")}>
                    <span style={styles.typingDot} />
                    <span style={{ ...styles.typingDot, animationDelay: "0.2s" }} />
                    <span style={{ ...styles.typingDot, animationDelay: "0.4s" }} />
                  </div>
                </div>
              )}
              <div ref={listEndRef} />
            </div>
            <div style={styles.inputRow}>
              <textarea
                ref={inputRef}
                style={styles.input}
                rows={1}
                placeholder="Ask me anything about Empire Reviews…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                maxLength={1000}
                aria-label="Support question"
              />
              <button style={styles.sendBtn(isLoading || !input.trim())} onClick={handleSend} disabled={isLoading || !input.trim()} aria-label="Send message">Send</button>
            </div>
            <div style={styles.footer}>
              <a href={mailtoHref} target="_blank" rel="noopener noreferrer" style={styles.humanLink} aria-label="Email Empire Reviews human support">
                💌 Talk to a human — support@empirereviews.com
              </a>
            </div>
          </>
        )}

        {/* ── Bottom tab bar (hidden in chat, which has its own input) ── */}
        {view !== "chat" && (
          <div style={styles.tabBar}>
            <button style={styles.tab(activeTab === "home")} onClick={() => goTab("home")}>
              <span style={{ fontSize: 17 }}>🏠</span>Home
            </button>
            <button style={styles.tab(activeTab === "help")} onClick={() => goTab("help")}>
              <span style={{ fontSize: 17 }}>❓</span>Help
            </button>
            <button style={styles.tab(activeTab === "messages")} onClick={() => goTab("messages")}>
              <span style={{ fontSize: 17 }}>✉️</span>Messages
            </button>
          </div>
        )}
      </div>

      {/* Floating bubble trigger */}
      <button
        className={open ? "empire-support-bubble" : "empire-support-bubble empire-support-bubble--float"}
        style={styles.bubble(open)}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support" : "Open support"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {open ? (
          <span style={{ fontSize: 22 }}>✕</span>
        ) : (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1a1f36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
            <path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z" fill="#1a1f36" />
            <path d="M3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z" fill="#1a1f36" />
            <path d="M19 17v1a4 4 0 0 1-4 4h-3" />
          </svg>
        )}
      </button>
    </>
  );
}
