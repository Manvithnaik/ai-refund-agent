"use client";

import { useState, useRef, useEffect } from "react";
import { sendMessage } from "@/lib/api";
import Link from "next/link";

// Decision type from the backend structured response
type Decision = "approved" | "denied" | "no_action" | "error";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  // decision comes from response.decision — NEVER from text parsing
  decision?: Decision;
}

const DEMO_PROMPTS = [
  "My name is Aarav Sharma, order ORD-1001",
  "Hi, I'm Ananya Verma, order ORD-1002",
  "Can I return order ORD-1004?",
];

const BOT_AVATAR = (
  <div
    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
    style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
  >
    <span className="text-white text-sm font-bold">R</span>
  </div>
);

const USER_AVATAR = (
  <div
    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
    style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
  >
    <span className="text-white text-sm font-bold">U</span>
  </div>
);

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-end fade-in-up">
      {BOT_AVATAR}
      <div className="bg-white border border-slate-200 shadow-sm px-5 py-3.5 rounded-2xl rounded-bl-sm max-w-xs">
        <div className="flex gap-1.5 items-center">
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isBot = msg.role === "assistant";

  // CRITICAL: Badge state is determined EXCLUSIVELY by msg.decision (from response.decision).
  // NEVER infer approval/denial by parsing msg.content.
  // A message can only ever be one of: approved | denied | no_action | error — never both.
  const isApproval = isBot && msg.decision === "approved";
  const isDenial = isBot && msg.decision === "denied";

  return (
    <div className={`flex gap-3 items-end fade-in-up ${!isBot ? "flex-row-reverse" : ""}`}>
      {isBot ? BOT_AVATAR : USER_AVATAR}
      <div className={`flex flex-col gap-1 max-w-[75%] ${!isBot ? "items-end" : ""}`}>
        <div
          className={`px-5 py-3.5 text-sm leading-relaxed ${isBot
              ? isApproval
                ? "bg-emerald-50/80 border border-emerald-200 text-slate-800 shadow-sm"
                : isDenial
                  ? "bg-rose-50/80 border border-rose-200 text-slate-800 shadow-sm"
                  : "bg-white border border-slate-200 text-slate-800 shadow-sm"
              : "text-white shadow-sm"
            }`}
          style={
            !isBot
              ? {
                background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                borderRadius: "20px 20px 4px 20px",
              }
              : { borderRadius: "4px 20px 20px 20px" }
          }
        >
          {isApproval && (
            <div className="flex items-center gap-1.5 mb-2 text-emerald-700 font-semibold text-xs tracking-wide">
              <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px]">✓</span>
              Refund Approved
            </div>
          )}
          {isDenial && (
            <div className="flex items-center gap-1.5 mb-2 text-rose-700 font-semibold text-xs tracking-wide">
              <span className="w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-[10px]">✕</span>
              Request Denied
            </div>
          )}
          <p className="whitespace-pre-line" style={{ color: isBot ? "#1e293b" : "white" }}>
            {msg.content}
          </p>
        </div>
        <span className="text-[11px] px-1" style={{ color: "var(--text-muted)" }}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Namaste! I'm RefundBot, your AI customer support assistant for ShopEase India. I can help you process refund requests quickly and efficiently.\n\nTo get started, could you please provide your name or registered email address?",
      timestamp: new Date(),
      decision: "no_action",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || isLoading) return;

    setInput("");
    setError(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await sendMessage(messageText, sessionId);
      setSessionId(response.session_id);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
        // Use the authoritative backend decision — NEVER parse response.message text
        decision: response.decision,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setError("Connection error. Please make sure the backend server is running.");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        id: "welcome-new",
        role: "assistant",
        content:
          "Namaste! I'm RefundBot. How can I help you with your refund request today?",
        timestamp: new Date(),
        decision: "no_action",
      },
    ]);
    setSessionId(undefined);
    setInput("");
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Top Header */}
      <header
        className="flex items-center justify-between px-8 py-4 border-b bg-white/90 backdrop-blur-md sticky top-0 z-10"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
          >
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-slate-900">RefundBot</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                India
              </span>
            </div>
            <p className="text-xs text-slate-500">ShopEase Customer Support</p>
          </div>
          <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
            Online
          </div>
        </div>

        <div className="flex items-center gap-3">
          {sessionId && (
            <Link
              href={`/admin/${sessionId}`}
              className="text-xs px-3.5 py-2 rounded-xl font-medium transition-all bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100/70"
            >
              View Agent Logs →
            </Link>
          )}
          <Link
            href="/admin"
            className="text-xs px-3.5 py-2 rounded-xl font-medium transition-all bg-slate-100 text-slate-700 hover:bg-slate-200/70"
          >
            Admin Dashboard
          </Link>
          <button onClick={handleNewChat} className="btn-primary text-xs py-2 px-4">
            + New Chat
          </button>
        </div>
      </header>

      {/* Main Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-8" style={{ maxWidth: "880px", margin: "0 auto", width: "100%" }}>
        <div className="flex flex-col gap-6">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Demo prompt pills */}
      {messages.length <= 1 && (
        <div
          className="px-4 pb-4"
          style={{ maxWidth: "880px", margin: "0 auto", width: "100%" }}
        >
          <p className="text-xs mb-2.5 px-1 font-medium text-slate-400">
            Try these demo queries:
          </p>
          <div className="flex gap-2 flex-wrap">
            {DEMO_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="text-xs px-3.5 py-2 rounded-xl font-medium transition-all bg-white text-indigo-600 border border-slate-200 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          className="mx-4 mb-3 px-4 py-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-600 shadow-sm"
          style={{ maxWidth: "880px", margin: "0 auto 12px", width: "100%" }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Input container */}
      <div className="px-4 pb-6 pt-3 border-t bg-white/80 backdrop-blur-md" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex gap-3 items-center rounded-2xl px-4 py-2.5 bg-white border shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"
          style={{
            borderColor: "var(--border)",
            maxWidth: "880px",
            margin: "0 auto",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask RefundBot about your order..."
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder-slate-400"
            disabled={isLoading}
            autoFocus
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="btn-primary flex-shrink-0"
            style={{ padding: "9px 18px", fontSize: "13px" }}
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
        <p className="text-center mt-2.5 text-[11px] text-slate-400">
          RefundBot AI Support · ShopEase India · Policy enforced server-side
        </p>
      </div>
    </div>
  );
}
