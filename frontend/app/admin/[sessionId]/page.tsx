"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { getSessionDetail } from "@/lib/api";
import type { SessionDetail, AgentLog } from "@/lib/types";
import {
  StatusBadge,
  OutcomeBadge,
  formatDuration,
  formatTime,
  LoadingDots,
  PageError,
} from "@/components/ui";

const EVENT_CONFIG: Record<
  string,
  { icon: string; color: string; label: string; bg: string }
> = {
  request_received: { icon: "📥", color: "#2563eb", label: "Request Received", bg: "#eff6ff" },
  customer_identified: { icon: "👤", color: "#16a34a", label: "Customer Identified", bg: "#f0fdf4" },
  order_lookup: { icon: "📦", color: "#0284c7", label: "Order Lookup", bg: "#f0f9ff" },
  no_existing_refund: { icon: "🔍", color: "#0284c7", label: "No Active Refund", bg: "#f0f9ff" },
  policy_check: { icon: "📋", color: "#9333ea", label: "Policy Check", bg: "#faf5ff" },
  eligibility_checked: { icon: "📊", color: "#9333ea", label: "Eligibility Result", bg: "#faf5ff" },
  tool_call: { icon: "🔧", color: "#d97706", label: "Tool Call", bg: "#fffbeb" },
  tool_result: { icon: "✅", color: "#16a34a", label: "Tool Execution", bg: "#f0fdf4" },
  tool_error: { icon: "❌", color: "#dc2626", label: "Tool Error", bg: "#fef2f2" },
  retry_attempt: { icon: "🔄", color: "#d97706", label: "Retry Attempt", bg: "#fffbeb" },
  refund_approved: { icon: "💚", color: "#16a34a", label: "Refund Approved", bg: "#f0fdf4" },
  refund_denied: { icon: "🔴", color: "#dc2626", label: "Refund Denied", bg: "#fef2f2" },
  agent_response: { icon: "💬", color: "#4f46e5", label: "Agent Response", bg: "#eef2ff" },
  llm_error: { icon: "⚠️", color: "#dc2626", label: "LLM Exception", bg: "#fef2f2" },
  session_ended: { icon: "🏁", color: "#64748b", label: "Session Completed", bg: "#f1f5f9" },
};

function LogEntryItem({ log, index }: { log: AgentLog; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = EVENT_CONFIG[log.event_type] ?? {
    icon: "•",
    color: "#64748b",
    label: log.event_type,
    bg: "#f1f5f9",
  };
  const hasParams = Boolean(log.tool_input || log.tool_output || log.error_message);

  return (
    <div className="flex gap-3.5 fade-in-up" style={{ animationDelay: `${Math.min(index * 25, 300)}ms` }}>
      {/* Timeline marker */}
      <div className="flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 border shadow-xs"
          style={{ background: cfg.bg, borderColor: `${cfg.color}30` }}
        >
          {cfg.icon}
        </div>
        <div className="w-px flex-1 mt-1 bg-slate-200" style={{ minHeight: 16 }} />
      </div>

      {/* Content */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
            {log.tool_name && (
              <span className="text-[11px] px-2 py-0.5 rounded font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                {log.tool_name}
              </span>
            )}
            {log.retry_count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-900">
                Retry #{log.retry_count}
              </span>
            )}
            {log.duration_ms != null && (
              <span className="text-[11px] font-mono text-slate-400">
                {log.duration_ms}ms
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">
            {new Date(log.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        {log.message && (
          <p className="text-xs leading-relaxed text-slate-700 font-normal mb-1.5">
            {log.message}
          </p>
        )}

        {log.error_message && (
          <div className="text-xs px-3 py-2 rounded-lg mb-1.5 font-mono bg-red-50 text-red-700 border border-red-200">
            ⚠ {log.error_message}
          </div>
        )}

        {hasParams && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1 mt-1"
          >
            {expanded ? "▼ Hide payload" : "▶ Show payload"}
          </button>
        )}

        {expanded && hasParams && (
          <div className="mt-2 space-y-2 fade-in-up">
            {log.tool_input && (
              <div>
                <p className="text-[10px] uppercase font-mono font-bold text-slate-500 mb-1">
                  Input Parameters:
                </p>
                <pre className="text-[11px] p-3 rounded-xl overflow-x-auto bg-slate-900 text-emerald-400 font-mono border border-slate-800">
                  {JSON.stringify(log.tool_input, null, 2)}
                </pre>
              </div>
            )}
            {log.tool_output && (
              <div>
                <p className="text-[10px] uppercase font-mono font-bold text-slate-500 mb-1">
                  Execution Output:
                </p>
                <pre className="text-[11px] p-3 rounded-xl overflow-x-auto bg-slate-900 text-sky-300 font-mono border border-slate-800">
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

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchDetail = async () => {
    try {
      const data = await getSessionDetail(sessionId);
      setSession(data);
      setError(null);
    } catch {
      setError("Unable to load session details. Verify backend connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(() => {
      if (session?.status === "active" || loading) {
        fetchDetail();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [sessionId, session?.status]);

  useEffect(() => {
    if (session?.status === "active") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.logs?.length]);

  const isLive = session?.status === "active";
  const refundReq = session?.refund_requests?.[0];

  return (
    <div className="min-h-screen pb-12 bg-slate-50 text-slate-900 flex flex-col items-center">
      {/* Header */}
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
            >
              ← Back to Sessions
            </Link>
            <div className="w-px h-4 bg-slate-200" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-slate-900">Session Audit Inspector</h1>
                {isLive && (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-500">{sessionId}</p>
            </div>
          </div>

          <button onClick={fetchDetail} className="btn-secondary text-xs">
            ↻ Refresh Log
          </button>
        </div>
      </header>

      {/* Main Content (Centralized) */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {loading && !session ? (
          <div className="py-24 flex justify-center">
            <LoadingDots color="#2563eb" />
          </div>
        ) : error ? (
          <PageError message={error} />
        ) : session ? (
          <>
            {/* Metadata Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Customer Profile
                </p>
                <p className="font-bold text-sm text-slate-900">
                  {session.customer?.name ?? "Unidentified Customer"}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {session.customer?.email ?? "No email provided"}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Session Status
                </p>
                <div>
                  <StatusBadge status={session.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Started {formatTime(session.started_at)}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Refund Request Outcome
                </p>
                <div>
                  <OutcomeBadge
                    outcome={session.outcome ?? refundReq?.status ?? "none"}
                    amount={refundReq?.refund_amount}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Duration: {formatDuration(session.started_at, session.ended_at)}
                </p>
              </div>
            </div>

            {/* Event Timeline Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
                <div>
                  <h2 className="font-bold text-sm text-slate-900">Deterministic Audit Trail</h2>
                  <p className="text-xs text-slate-500">
                    Chronological sequence of agent tool calls, decision gates, and business outcomes.
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {session.logs.length} Events
                </span>
              </div>

              {session.logs.length === 0 ? (
                <p className="text-xs text-center py-12 text-slate-500">
                  No execution events logged yet for this session.
                </p>
              ) : (
                <div>
                  {session.logs.map((log, i) => (
                    <LogEntryItem key={log.id} log={log} index={i} />
                  ))}

                  {isLive && (
                    <div className="flex gap-3 items-center pt-2">
                      <LoadingDots color="#2563eb" />
                      <span className="text-xs text-slate-500">
                        Agent is listening &amp; processing tools…
                      </span>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
