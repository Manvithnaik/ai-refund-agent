"use client";

import { useState, useEffect } from "react";
import { getSessions, type Session } from "@/lib/api";
import Link from "next/link";

function OutcomeBadge({ outcome, amount }: { outcome: string; amount: number | null }) {
  if (outcome === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
        ✓ Approved {amount ? `₹${amount.toLocaleString('en-IN')}` : ""}
      </span>
    );
  }
  if (outcome === "denied") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">
        ✕ Denied
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">
      ⏳ In Progress
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    completed: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
    active: { bg: "#fffbeb", text: "#92400e", border: "#fef3c7" },
    error: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
  };
  const c = colors[status] || { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {status}
    </span>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function AdminPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
      setError(null);
    } catch {
      setError("Failed to load sessions. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalApproved = sessions.filter((s) => s.outcome === "approved").length;
  const totalDenied = sessions.filter((s) => s.outcome === "denied").length;
  const totalRevenue = sessions
    .filter((s) => s.outcome === "approved")
    .reduce((sum, s) => sum + (s.refund_amount || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Top Header */}
      <header className="px-8 py-4 border-b bg-white/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-10" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
          >
            ← Back to Chat
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-slate-900">Admin Dashboard</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                ShopEase India
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Agent Audit Logs &amp; Refund Analytics
            </p>
          </div>
        </div>
        <button
          onClick={fetchSessions}
          className="text-xs font-semibold px-3.5 py-2 rounded-xl transition-all bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100/70"
        >
          ↻ Refresh Data
        </button>
      </header>

      <div className="px-8 py-8 max-w-7xl mx-auto">
        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-5 mb-8">
          {[
            { label: "Total Sessions", value: sessions.length, color: "#4f46e5", bg: "#eef2ff", icon: "💬" },
            { label: "Approved Refunds", value: totalApproved, color: "#059669", bg: "#ecfdf5", icon: "✓" },
            { label: "Denied Requests", value: totalDenied, color: "#dc2626", bg: "#fef2f2", icon: "✕" },
            { label: "Amount Refunded", value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: "#7c3aed", bg: "#f5f3ff", icon: "₹" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500">
                  {stat.label}
                </span>
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ background: stat.bg, color: stat.color }}
                >
                  {stat.icon}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-slate-900">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Sessions Table Card */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-sm text-slate-800">
              Recent Agent Sessions
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              Auto-refreshes every 5s
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
                <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
                <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#4f46e5" }} />
              </div>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-rose-500 font-medium">
              {error}
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <p className="text-3xl mb-2">🤖</p>
              <p className="text-sm font-medium">No sessions logged yet.</p>
              <Link href="/" className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:underline">
                Go to Chat to start a session →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    {["Session ID", "Customer", "Status", "Outcome", "Logs", "Duration", "Started"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link href={`/admin/${s.id}`} className="font-mono text-xs font-bold text-indigo-600 hover:underline">
                          {s.id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {s.customer_name}
                          </p>
                          {s.customer_email && (
                            <p className="text-xs text-slate-400">
                              {s.customer_email}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-6 py-4">
                        <OutcomeBadge outcome={s.outcome} amount={s.refund_amount} />
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600">
                        {s.total_logs} events
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600">
                        {formatDuration(s.started_at, s.ended_at)}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {formatTime(s.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
