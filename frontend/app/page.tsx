"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Package,
  Search,
  FileText,
  Send,
  Bot,
  User,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { sendMessage } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { LoadingDots } from "@/components/ui";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  FormattedText,
  RefundDecisionCard,
} from "@/components/chat/FormattedMessage";

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! Welcome to ShopEase Customer Support.\n\nI can assist you with requesting a refund, checking your return eligibility, or tracking an existing refund status.\n\nTo begin, please share your order number (e.g. **ORD-1001**) or choose an option below.",
  timestamp: new Date(),
  decision: "no_action",
};

function AgentAvatar() {
  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-xs">
      <Bot className="w-4 h-4" />
    </div>
  );
}

function CustomerAvatar() {
  return (
    <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0 text-xs font-bold">
      <User className="w-4 h-4" />
    </div>
  );
}

function MessageItem({
  msg,
  onConfirmRefund,
}: {
  msg: ChatMessage;
  onConfirmRefund?: () => void;
}) {
  const isAgent = msg.role === "assistant";

  return (
    <div
      className={`flex gap-3 items-start fade-in-up ${!isAgent ? "flex-row-reverse" : ""
        }`}
    >
      {isAgent ? <AgentAvatar /> : <CustomerAvatar />}
      <div
        className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[72%] ${!isAgent ? "items-end" : ""
          }`}
      >
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] font-bold text-slate-600">
            {isAgent ? "ShopEase Support Agent" : "You"}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {msg.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div
          className={`px-4 py-3 text-sm leading-relaxed shadow-xs ${isAgent
            ? "bg-white border border-slate-200/90 text-slate-900"
            : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium"
            }`}
          style={
            isAgent
              ? { borderRadius: "6px 18px 18px 18px" }
              : { borderRadius: "18px 18px 6px 18px" }
          }
        >
          {isAgent && msg.decision && msg.decision !== "no_action" && (
            <RefundDecisionCard
              decision={msg.decision}
              amount={msg.refundAmount}
              refundId={msg.refundId}
              onConfirm={onConfirmRefund}
            />
          )}
          {isAgent ? (
            <FormattedText text={msg.content} />
          ) : (
            <p className="whitespace-pre-line">{msg.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

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
        setErrorMsg(
          "Unable to connect to support services. Please ensure backend is running on port 8000."
        );
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, sessionId]
  );

  const handleResetSession = () => {
    setMessages([INITIAL_MESSAGE]);
    setSessionId(undefined);
    setErrorMsg(null);
    setInput("");
  };

  const isHeroState = messages.length <= 1;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/20 to-slate-100 text-slate-900 items-center justify-between">
      {/* ── Customer Header Bar (Wide Header) ── */}
      <header className="w-full bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-3.5 sticky top-0 z-20 shadow-xs">
        <div className="w-full max-w-[1150px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-purple">
              SE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-slate-900 leading-tight">
                  ShopEase India
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  AI Support Agent
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Deterministic Policy Enforcement
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {messages.length > 1 && (
              <button
                onClick={handleResetSession}
                className="text-xs px-3 py-1.5 rounded-xl font-medium text-slate-600 hover:text-purple-700 bg-slate-100 hover:bg-purple-50 border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New Chat
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 live-dot" />
              Online
            </span>
            <Link
              href="/admin"
              className="text-xs px-3.5 py-1.5 rounded-xl font-bold text-white bg-slate-900 hover:bg-purple-900 border border-slate-800 transition-all flex items-center gap-1 shadow-xs"
            >
              Admin Console <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content Container (Max-Width 1150px) ── */}
      <main className="flex-1 w-full max-w-[1150px] mx-auto px-6 py-5 flex flex-col justify-between items-center">
        {isHeroState ? (
          /* ── Hero State ── */
          <div className="w-full flex-1 flex flex-col items-center justify-center my-auto py-3 fade-in-up max-w-5xl">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-100 to-indigo-100 text-purple-700 border border-purple-200 flex items-center justify-center text-lg font-bold mb-3 shadow-xs">
              <Sparkles className="w-6 h-6 text-purple-600 animate-pulse" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-1.5 text-center">
              How can we help you today?
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mb-6 text-center">
              Instant AI refund decisions backed by strict policy rules.
            </p>

            {/* Quick Action Spotlight Cards (Wider Layout) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4.5 w-full max-w-5xl">
              <SpotlightCard
                onClick={() =>
                  handleSend("I want to request a refund for my order.")
                }
                className="p-5 sm:p-6 text-left cursor-pointer group hover:border-purple-300"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Package className="w-5 h-5" />
                </div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors mb-1">
                  Request a Refund
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Return an eligible item or check policy rules.
                </p>
              </SpotlightCard>

              <SpotlightCard
                onClick={() =>
                  handleSend("I want to check the status of my refund.")
                }
                className="p-5 sm:p-6 text-left cursor-pointer group hover:border-purple-300"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Search className="w-5 h-5" />
                </div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors mb-1">
                  Check Status
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Track payout status of a previous return.
                </p>
              </SpotlightCard>

              <SpotlightCard
                onClick={() =>
                  handleSend("What is the ShopEase refund policy?")
                }
                className="p-5 sm:p-6 text-left cursor-pointer group hover:border-purple-300"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <FileText className="w-5 h-5" />
                </div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors mb-1">
                  Refund Policy
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  View 30-day windows and eligibility guidelines.
                </p>
              </SpotlightCard>
            </div>
          </div>
        ) : (
          /* ── Active Chat Workspace ── */
          <div className="w-full flex-1 overflow-y-auto space-y-4 pb-4 max-w-5xl">
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                onConfirmRefund={() =>
                  handleSend("Yes, please process my refund.")
                }
              />
            ))}

            {loading && (
              <div className="flex gap-3 items-start fade-in-up">
                <AgentAvatar />
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-xs">
                  <LoadingDots color="#9333ea" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="w-full max-w-5xl mb-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-red-50 border border-red-200 text-red-700 text-center">
            ⚠ {errorMsg}
          </div>
        )}

        {/* ── Compact Chat Composer ── */}
        <div className="w-full max-w-5xl mt-auto pt-1">
          <div className="composer p-2.5 sm:p-3 bg-white">
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
              placeholder="Ask a question or enter your order ID (e.g. ORD-1001)..."
              rows={1}
              className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder-slate-400 resize-none px-1 min-h-[38px] max-h-[70px] py-1 leading-normal"
              disabled={loading}
              autoFocus
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
              <span className="text-[11px] text-slate-400">
                Press{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                  Enter
                </kbd>{" "}
                to send
              </span>

              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="btn-primary flex items-center gap-1.5 py-1.5 px-4 text-xs"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
