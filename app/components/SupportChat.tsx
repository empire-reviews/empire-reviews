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
}

interface SupportActionData {
  success?: boolean;
  answer?: string;
  canEscalate?: boolean;
  needsHuman?: boolean;
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
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: open ? "#1a1f36" : "linear-gradient(135deg, #c9a227 0%, #e8c84a 100%)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    transition: "transform 0.15s ease, background 0.2s ease",
    outline: "none",
    color: open ? "#c9a227" : "#1a1f36",
    fontSize: 24,
    fontWeight: 700,
    userSelect: "none",
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
  const isLoading = fetcher.state !== "idle";

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
        { question: q, history: JSON.stringify(history) },
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
      {/* Inject typing animation keyframes once */}
      <style>{`
        @keyframes empire-typing-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
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
            style={styles.humanLink}
            aria-label="Email Empire Reviews human support"
          >
            💌 Talk to a human — support@empirereviews.com
          </a>
        </div>
      </div>

      {/* Floating bubble trigger */}
      <button
        style={styles.bubble(open)}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {open ? "✕" : "?"}
      </button>
    </>
  );
}
