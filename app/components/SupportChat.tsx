/**
 * Empire Reviews — Floating in-app merchant support chatbot.
 *
 * Shows a fixed bubble at bottom-right on every /app/* page.
 * Clicking opens a 360×480 chat panel that POSTs to /api/support.
 * Always offers a "Talk to a human" mailto escalation link.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useFetcher } from "@remix-run/react";

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
  /** The merchant's myshopify.com domain — used in the mailto escalation */
  shop?: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Safely escape text for display (no dangerouslySetInnerHTML) */
function escapeText(text: string): string {
  return text; // We use textContent via React children, never innerHTML — no escaping needed here.
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

// ── Styles (inline — app uses inline styles widely) ───────────────

const Z = 9999;

const styles = {
  bubble: (open: boolean): React.CSSProperties => ({
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: Z,
    width: 60,
    height: 60,
    borderRadius: "50%",
    // 3D gold orb: radial highlight + diagonal gradient for a domed look
    background: open
      ? "radial-gradient(circle at 32% 28%, #3a4374 0%, #1a1f36 70%)"
      : "radial-gradient(circle at 32% 28%, #fff0b8 0%, #e8c84a 38%, #c9a227 78%, #a8851a 100%)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // Layered shadow for depth; the glow keyframes take over when closed
    boxShadow: open
      ? "0 6px 16px rgba(0,0,0,0.30), inset 0 2px 4px rgba(255,255,255,0.18)"
      : "0 6px 16px rgba(0,0,0,0.28), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(120,90,0,0.35)",
    transition: "transform 0.15s ease, background 0.25s ease",
    outline: "none",
    color: open ? "#e8c84a" : "#1a1f36",
    fontSize: 24,
    fontWeight: 700,
    userSelect: "none",
    // Breathe + glow only when closed (idle), so it doesn't jiggle while chatting
    animation: open ? "none" : "empire-bubble-float 3s ease-in-out infinite, empire-bubble-glow 3s ease-in-out infinite",
  }),
  panel: (open: boolean): React.CSSProperties => ({
    position: "fixed",
    bottom: 86,
    right: 20,
    zIndex: Z,
    width: 360,
    height: 480,
    background: "#ffffff",
    borderRadius: 16,
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    opacity: open ? 1 : 0,
    pointerEvents: open ? "all" : "none",
    transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  }),
  header: {
    background: "linear-gradient(135deg, #1a1f36 0%, #2d3561 100%)",
    color: "#ffffff",
    padding: "14px 16px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } as React.CSSProperties,
  headerTitle: {
    fontWeight: 700,
    fontSize: "0.95rem",
    letterSpacing: "0.01em",
  } as React.CSSProperties,
  headerSub: {
    fontSize: "0.72rem",
    color: "#c9a227",
    marginTop: 1,
  } as React.CSSProperties,
  closeBtn: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: 20,
    lineHeight: 1,
    padding: "0 2px",
    display: "flex",
    alignItems: "center",
  } as React.CSSProperties,
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  msgRow: (role: Message["role"]): React.CSSProperties => ({
    display: "flex",
    justifyContent: role === "user" ? "flex-end" : "flex-start",
  }),
  bubble_msg: (role: Message["role"], isError?: boolean): React.CSSProperties => ({
    maxWidth: "82%",
    padding: "9px 13px",
    borderRadius: role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
    background: role === "user"
      ? "linear-gradient(135deg, #1a1f36, #2d3561)"
      : isError ? "#fff2f2" : "#f3f4f6",
    color: role === "user" ? "#ffffff" : isError ? "#c0392b" : "#202223",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    border: isError ? "1px solid #f5c6cb" : "none",
  }),
  typingDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#9ca3af",
    margin: "0 2px",
    animation: "empire-typing-bounce 1.2s infinite ease-in-out",
  } as React.CSSProperties,
  feedbackRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingLeft: 4,
  } as React.CSSProperties,
  feedbackLabel: {
    fontSize: "0.72rem",
    color: "#9ca3af",
  } as React.CSSProperties,
  feedbackBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "0.95rem",
    padding: "0 2px",
    lineHeight: 1,
    opacity: 0.8,
  } as React.CSSProperties,
  feedbackThanks: {
    fontSize: "0.72rem",
    color: "#16a34a",
    fontWeight: 600,
  } as React.CSSProperties,
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderTop: "1px solid #e5e7eb",
    background: "#fafafa",
    flexShrink: 0,
  } as React.CSSProperties,
  input: {
    flex: 1,
    border: "1.5px solid #d1d5db",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: "0.85rem",
    outline: "none",
    resize: "none" as const,
    fontFamily: "inherit",
    lineHeight: 1.4,
    maxHeight: 90,
    overflowY: "auto" as const,
    background: "#ffffff",
  },
  sendBtn: (disabled: boolean): React.CSSProperties => ({
    background: disabled ? "#d1d5db" : "linear-gradient(135deg, #c9a227, #e8c84a)",
    border: "none",
    borderRadius: 10,
    color: disabled ? "#9ca3af" : "#1a1f36",
    fontWeight: 700,
    fontSize: "0.82rem",
    cursor: disabled ? "default" : "pointer",
    padding: "8px 14px",
    alignSelf: "flex-end",
    transition: "background 0.15s ease",
    whiteSpace: "nowrap" as const,
  }),
  footer: {
    padding: "8px 14px",
    borderTop: "1px solid #f0f0f0",
    textAlign: "center" as const,
    background: "#fafafa",
    flexShrink: 0,
  } as React.CSSProperties,
  humanLink: {
    fontSize: "0.78rem",
    color: "#6d7175",
    textDecoration: "none",
  } as React.CSSProperties,
};

// ── Component ─────────────────────────────────────────────────────

export default function SupportChat({ shop }: SupportChatProps) {
  const [open, setOpen] = useState(false);
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

  // Record 👍/👎 on a bot answer → drives the learning loop (a 👎 becomes a "gap"
  // a human can correct in the Support & Learning panel).
  const sendFeedback = useCallback(
    (msgId: string, logId: string, helpful: boolean) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, feedback: helpful ? "up" : "down" } : m))
      );
      feedbackFetcher.submit(
        { intent: "feedback", logId, helpful },
        { method: "POST", action: "/api/support", encType: "application/json" }
      );
    },
    [feedbackFetcher]
  );

  // Scroll to bottom whenever messages update or panel opens
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  // Handle fetcher data when it comes back
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

    // Append user message immediately
    const userMsg: Message = { id: uid(), role: "user", content: q };
    setMessages((prev) => {
      const updated = [...prev, userMsg];

      // Build history for the API (exclude welcome/system messages)
      const history = updated
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1) // exclude the message we're about to send
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      fetcher.submit(
        { question: q, history },
        { method: "POST", action: "/api/support", encType: "application/json" }
      );

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

  const mailtoHref = buildMailto(shop, messages);

  return (
    <>
      {/* Inject animation keyframes once */}
      <style>{`
        @keyframes empire-typing-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        /* Gentle "breathing" up-down float for the closed support bubble */
        @keyframes empire-bubble-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-7px); }
        }
        /* Soft glowing pulse around the bubble, synced with the float */
        @keyframes empire-bubble-glow {
          0%, 100% { box-shadow: 0 6px 16px rgba(0,0,0,0.28), 0 0 0 0 rgba(232,200,74,0.55), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(120,90,0,0.35); }
          50%      { box-shadow: 0 14px 26px rgba(0,0,0,0.30), 0 0 22px 7px rgba(232,200,74,0.55), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(120,90,0,0.35); }
        }
        .empire-support-bubble:hover { transform: scale(1.08) !important; }
        .empire-support-bubble svg { display: block; }
        @media (prefers-reduced-motion: reduce) {
          .empire-support-bubble--float { animation: none !important; }
        }
      `}</style>

      {/* Chat panel */}
      <div style={styles.panel(open)} role="dialog" aria-label="Empire Reviews support chat" aria-modal="false">
        {/* Header */}
        <div style={styles.header}>
          <div style={{ fontSize: 22 }}>💬</div>
          <div>
            <div style={styles.headerTitle}>Empire Support</div>
            <div style={styles.headerSub}>Powered by your AI key</div>
          </div>
          <button
            style={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close support chat"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div style={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
          {messages.map((msg) => (
            <div key={msg.id} style={styles.msgRow(msg.role)}>
              <div style={styles.bubble_msg(msg.role, msg.isError)}>
                {escapeText(msg.content)}
              </div>
              {/* 👍/👎 feedback — only on real bot answers (have a logId) */}
              {msg.role === "assistant" && msg.logId && (
                <div style={styles.feedbackRow}>
                  {msg.feedback ? (
                    <span style={styles.feedbackThanks}>
                      {msg.feedback === "up" ? "Thanks for the feedback! 🙌" : "Thanks — we'll improve this. 🛠️"}
                    </span>
                  ) : (
                    <>
                      <span style={styles.feedbackLabel}>Was this helpful?</span>
                      <button
                        type="button"
                        style={styles.feedbackBtn}
                        aria-label="Helpful"
                        onClick={() => sendFeedback(msg.id, msg.logId as string, true)}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        style={styles.feedbackBtn}
                        aria-label="Not helpful"
                        onClick={() => sendFeedback(msg.id, msg.logId as string, false)}
                      >
                        👎
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
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

        {/* Input row */}
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
          <button
            style={styles.sendBtn(isLoading || !input.trim())}
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            Send
          </button>
        </div>

        {/* Footer — always-visible escalation */}
        <div style={styles.footer}>
          <a
            href={mailtoHref}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.humanLink}
            aria-label="Email Empire Reviews human support"
          >
            💌 Talk to a human — support@empirereviews.com
          </a>
        </div>
      </div>

      {/* Floating bubble trigger */}
      <button
        className={open ? "empire-support-bubble" : "empire-support-bubble empire-support-bubble--float"}
        style={styles.bubble(open)}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {open ? (
          <span style={{ fontSize: 22 }}>✕</span>
        ) : (
          /* Headset / support-agent icon */
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
