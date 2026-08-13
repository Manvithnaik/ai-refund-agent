"use client";

import { useState, useEffect, useRef } from "react";
import { getSessionDetail, type SessionDetail, type AgentLog } from "@/lib/api";
import Link from "next/link";
import { use } from "react";

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string; bg: string }> = {
  request_received: { icon: "📥", color: "#2563eb", label: "Request Received", bg: "#eff6ff" },
  customer_identified: { icon: "👤", color: "#059669", label: "Customer Identified", bg: "#ecfdf5" },
  order_lookup: { icon: "📦", color: "#2563eb", label: "Order Lookup", bg: "#eff6ff" },
  policy_check: { icon: "📋", color: "#7c3aed", label: "Policy Check", bg: "#f5f3ff" },
  tool_call: { icon: "🔧", color: "#d97706", label: "Tool Call", bg: "#fffbeb" },
  tool_result: { icon: "✅", color: "#059669", label: "Tool Result", bg: "#ecfdf5" },
  tool_error: { icon: "❌", color: "#dc2626", label: "Tool Error", bg: "#fef2f2" },
  retry_attempt: { icon: "🔄", color: "#d97706", label: "Retry Attempt", bg: "#fffbeb" },
  refund_approved: { icon: "💚", color: "#059669", label: "Refund Approved", bg: "#ecfdf5" },
  refund_denied: { icon: "🔴", color: "#dc2626", label: "Refund Denied", bg: "#fef2f2" },
  agent_response: { icon: "💬", color: "#2563eb", label: "Agent Response", bg: "#eff6ff" },
  llm_error: { icon: "⚠️", color: "#dc2626", label: "LLM Error", bg: "#fef2f2" },
  session_ended: { icon: "🏁", color: "#64748b", label: "Session Ended", bg: "#f8fafc" },
};

function LogEntry({ log, index }: { log: AgentLog; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = EVENT_CONFIG[log.event_type] || { icon: "•", color: "#64748b", label: log.event_type, bg: "#f8fafc" };
  const hasDetails = log.tool_input || log.tool_output || log.error_message;

  return (
    <div className="flex gap-4 fade-in-up" style={{ animationDelay: `${index * 30}ms` }}>
      {/* Timeline marker */}
      <div className="flex flex-col items-center">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 border shadow-xs"
          style={{ background: cfg.bg, borderColor: `${cfg.color}30` }}
        >
          {cfg.icon}
        </div>
        <div className="w-px flex-1 mt-1 bg-slate-200" style={{ minHeight: "16px" }} />
      </div>

      {/* Content card */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
            {log.tool_name && (
              <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                {log.tool_name}
              </span>
            )}
            {log.retry_count > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                Retry #{log.retry_count}
              </span>
            )}
            {log.duration_ms != null && (
              <span className="text-xs text-slate-400">
                {log.duration_ms}ms
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">
            {new Date(log.created_at).toLocaleTimeString([], {
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            })}
          </span>
        </div>

        {log.message && (
          <p className="text-sm leading-relaxed text-slate-700 mb-2 font-medium">
            {log.message}
          </p>
        )}

        {log.error_message && (
          <div className="text-xs px-3 py-2 rounded-lg mb-2 font-mono bg-rose-50 text-rose-600 border border-rose-200">
            {log.error_message}
          </div>
        )}

        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
          >
            {expanded ? "▼ Hide" : "▶ Show"} parameters
          </button>
        )}

        {expanded && hasDetails && (
          <div className="mt-2 space-y-2">
            {log.tool_input && (
              <div>
                <p className="text-[11px] mb-1 font-semibold text-slate-400 uppercase">
                  Input Parameters:
                </p>
                <pre className="text-xs p-3 rounded-xl overflow-x-auto bg-slate-900 text-emerald-400 font-mono shadow-xs">
                  {JSON.stringify(log.tool_input, null, 2)}
                </pre>
              </div>
            )}
            {log.tool_output && (
              <div>
                <p className="text-[11px] mb-1 font-semibold text-slate-400 uppercase">
                  Execution Output:
                </p>
                <pre className="text-xs p-3 rounded-xl overflow-x-auto bg-slate-900 text-indigo-300 font-mono shadow-xs">
                  {JSON.stringify(log.tool_output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchSession = async () => {
    try {
      const data = await getSessionDetail(sessionId);
      setSession(data);
      setError(null);
    } catch {
      setError("Failed to load session. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    if (session?.status === "active") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.logs?.length]);

  const isLive = session?.status === "active";
  const outcome = session?.refund_requests?.[0];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="px-8 py-4 border-b bg-white/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-10" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">
            ← Back to Sessions
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-slate-900">
                Session Audit Detail
              </h1>
              {isLive && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
                  LIVE
                </div>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400">
              {sessionId}
            </p>
          </div>
        </div>

        {outcome && (
          <div className={`px-4 py-1.5 rounded-xl text-xs font-bold border shadow-xs ${outcome.status === "approved"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-rose-50 text-rose-700 border-rose-200"
            }`}>
            {outcome.status === "approved"
              ? `✓ Refund Approved — ₹${outcome.refund_amount?.toLocaleString('en-IN')}`
              : `✕ Refund Denied`}
          </div>
        )}
      </header>

      <div className="px-8 py-8 max-w-4xl mx-auto">
        {loading && !session ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
              <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
              <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
            </div>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-rose-500 font-medium">{error}</div>
        ) : session ? (
          <>
            {/* Metadata Summary Grid */}
            <div className="grid grid-cols-3 gap-5 mb-8">
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-400 mb-1">Customer Profile</p>
                <p className="font-bold text-sm text-slate-800">
                  {session.customer?.name || "Unidentified"}
                </p>
                {session.customer?.email && (
                  <p className="text-xs text-slate-400">
                    {session.customer.email}
                  </p>
                )}
              </div>
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-400 mb-1">Session Status</p>
                <p className={`font-bold text-sm capitalize ${session.status === "completed" ? "text-emerald-600"
                    : session.status === "error" ? "text-rose-600" : "text-amber-600"
                  }`}>
                  {session.status}
                </p>
                <p className="text-xs text-slate-400">
                  Started at {new Date(session.started_at).toLocaleTimeString()}
                </p>
              </div>
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-400 mb-1">Audit Events</p>
                <p className="font-bold text-sm text-indigo-600">
                  {session.logs.length} logged
                </p>
                <p className="text-xs text-slate-400">tool execution sequence</p>
              </div>
            </div>

            {/* Event Timeline */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
              <h2 className="font-bold text-sm text-slate-800 mb-6 border-b border-slate-100 pb-3">
                Agent Deterministic Event Timeline
              </h2>
              {session.logs.length === 0 ? (
                <p className="text-sm text-center py-8 text-slate-400">
                  No events logged yet...
                </p>
              ) : (
                <div>
                  {session.logs.map((log, i) => (
                    <LogEntry key={log.id} log={log} index={i} />
                  ))}
                  {isLive && (
                    <div className="flex gap-4">
                      <div className="w-8 flex justify-center">
                        <div className="flex gap-1 pt-2">
                          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
                          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
                          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
                        </div>
                      </div>
                      <p className="text-xs pt-2.5 text-slate-400 font-medium">
                        Agent is processing refund workflow...
                      </p>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
