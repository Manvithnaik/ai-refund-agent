"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { sendMessage } from "@/lib/api";
import type { ChatMessage, Decision } from "@/lib/types";
import { LoadingDots } from "@/components/ui";

// ── Initial Welcome Message ──────────────────────────────────────────
const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! Welcome to ShopEase Customer Support.\n\nI can assist you with requesting a refund, checking your return eligibility, or tracking an existing refund status.\n\nTo begin, please share your order number or registered email.",
  timestamp: new Date(),
  decision: "no_action",
};

// ── Agent & Customer Avatars ─────────────────────────────────────────
function AgentAvatar() {
  return (
    <div
      className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-semibold shadow-xs"
      aria-hidden
    >
      SE
    </div>
  );
}

function CustomerAvatar() {
  return (
    <div
      className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0 text-xs font-semibold"
      aria-hidden
    >
      You
    </div>
  );
}

// ── Contextual Refund Result Card (Driven exclusively by backend data) ──
function RefundResultCard({
  decision,
  amount,
  refundId,
  reason,
  onConfirm,
}: {
  decision: Decision;
  amount?: number | null;
  refundId?: string | null;
  reason?: string | null;
  onConfirm?: () => void;
}) {
  if (decision === "approved") {
    return (
      <div className="result-card-approved mb-3 space-y-2 text-slate-800">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
            ✓
          </span>
          Refund Approved
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-emerald-200/60">
          {amount != null && (
            <div>
              <span className="text-emerald-800/70 block text-[11px]">Approved Amount</span>
              <span className="font-bold text-sm text-emerald-900">
                ₹{amount.toLocaleString("en-IN")}
              </span>
            </div>
          )}
          {refundId && (
            <div>
              <span className="text-emerald-800/70 block text-[11px]">Refund Reference</span>
              <span className="font-mono text-xs text-emerald-900">{refundId}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (decision === "denied") {
    return (
      <div className="result-card-denied mb-3 space-y-2 text-slate-800">
        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
          <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
            ✕
          </span>
          Refund Request Denied
        </div>

        {reason && (
          <div className="text-xs pt-1 border-t border-red-200/60 text-red-900">
            <span className="text-red-800/70 block text-[11px]">Reason</span>
            <p className="mt-0.5">{reason}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── Message Bubble Component ─────────────────────────────────────────
function MessageItem({ msg, onConfirmRefund }: { msg: ChatMessage; onConfirmRefund?: () => void }) {
  const isAgent = msg.role === "assistant";

  return (
    <div className={`flex gap-3 items-start fade-in-up ${!isAgent ? "flex-row-reverse" : ""}`}>
      {isAgent ? <AgentAvatar /> : <CustomerAvatar />}
      <div className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[75%] ${!isAgent ? "items-end" : ""}`}>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] font-semibold text-slate-500">
            {isAgent ? "ShopEase Support" : "You"}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div
          className={`px-4 py-3 text-sm leading-relaxed ${isAgent
            ? "bg-white border border-slate-200 text-slate-900 shadow-xs"
            : "bg-blue-600 text-white font-normal shadow-xs"
            }`}
          style={
            isAgent
              ? { borderRadius: "4px 16px 16px 16px" }
              : { borderRadius: "16px 16px 4px 16px" }
          }
        >
          {isAgent && msg.decision && (
            <RefundResultCard
              decision={msg.decision}
              amount={msg.refundAmount}
              refundId={msg.refundId}
              onConfirm={onConfirmRefund}
            />
          )}
          <p className="whitespace-pre-line">{msg.content}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Customer Support Page Component ─────────────────────────────
export default function CustomerSupportPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const msg = (textToSend ?? input).trim();
      if (!msg || loading) return;

      setInput("");
      setErrorMsg(null);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: msg,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await sendMessage(msg, sessionId);
        setSessionId(res.session_id);

        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.message,
          timestamp: new Date(),
          decision: res.decision,
          refundAmount: res.refund_amount,
          refundId: res.refund_id,
        };

        setMessages((prev) => [...prev, botMsg]);
      } catch {
        setErrorMsg("Unable to connect to support services. Please try again in a moment.");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, sessionId]
  );

  const isHeroState = messages.length <= 1;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 items-center justify-between">
      {/* ── Customer Header Bar (Full Width Screen Header) ── */}
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              SE
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900 leading-tight">
                ShopEase India
              </h1>
              <p className="text-xs text-slate-500 font-medium">Customer Support</p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 live-dot" />
              Online
            </span>
            <Link
              href="/admin"
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors shadow-2xs hover:text-blue-600"
            >
              Admin Console →
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content Container (Strictly Centered horizontally & vertically) ── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 flex flex-col justify-between items-center">
        {isHeroState ? (
          /* ── Clean Compact Empty State ── */
          <div className="w-full flex-1 flex flex-col items-center justify-center my-auto py-8 text-center fade-in-up">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center text-xl font-bold mb-4 shadow-xs">
              💬
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2 text-center">
              How can we help?
            </h2>
            <p className="text-sm text-slate-600 max-w-md mb-8 text-center">
              Get assistance with your orders, process returns, or check refund status instantly.
            </p>

            {/* Quick Action Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mb-6">
              <button
                onClick={() => handleSend("I want to request a refund for my order.")}
                className="action-card group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  📦
                </div>
                <p className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition-colors mb-0.5">
                  Request a Refund
                </p>
                <p className="text-xs text-slate-500">
                  Return an order or check eligibility.
                </p>
              </button>

              <button
                onClick={() => handleSend("I want to check the status of my refund.")}
                className="action-card group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  🔍
                </div>
                <p className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition-colors mb-0.5">
                  Check Status
                </p>
                <p className="text-xs text-slate-500">
                  Track payout status of a return.
                </p>
              </button>

              <button
                onClick={() => handleSend("What is the ShopEase refund policy?")}
                className="action-card group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  📋
                </div>
                <p className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition-colors mb-0.5">
                  Refund Policy
                </p>
                <p className="text-xs text-slate-500">
                  Read return windows and rules.
                </p>
              </button>
            </div>
          </div>
        ) : (
          /* ── Active Chat Workspace ── */
          <div className="w-full flex-1 overflow-y-auto space-y-6 pb-6">
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                onConfirmRefund={() => handleSend("Yes, please process my refund.")}
              />
            ))}

            {loading && (
              <div className="flex gap-3 items-start fade-in-up">
                <AgentAvatar />
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-xs">
                  <LoadingDots color="#2563eb" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="w-full mb-4 px-4 py-3 rounded-xl text-xs font-medium bg-red-50 border border-red-200 text-red-700 text-center">
            ⚠ {errorMsg}
          </div>
        )}

        {/* ── Clean Message Composer ── */}
        <div className="w-full mt-auto pt-2">
          <div className="composer p-3 bg-white">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message or order ID..."
              rows={2}
              className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder-slate-400 resize-none px-1"
              disabled={loading}
              autoFocus
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
              <span className="text-[11px] text-slate-400">
                Press <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">Enter</kbd> to send
              </span>

              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="btn-primary"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
