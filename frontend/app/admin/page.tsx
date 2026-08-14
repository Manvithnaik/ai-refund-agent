"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getSessions } from "@/lib/api";
import type { Session } from "@/lib/types";
import {
  StatusBadge,
  OutcomeBadge,
  formatDuration,
  formatTime,
  LoadingDots,
  PageError,
} from "@/components/ui";

type FilterTab = "all" | "approved" | "denied" | "active";

export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const fetchSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
      setError(null);
    } catch {
      setError("Failed to load session list. Is backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 4000);
    return () => clearInterval(interval);
  }, []);

  const metrics = useMemo(() => {
    const total = sessions.length;
    const approvedSessions = sessions.filter((s) => s.outcome === "approved");
    const approvedCount = approvedSessions.length;
    const deniedCount = sessions.filter((s) => s.outcome === "denied").length;
    const activeCount = sessions.filter((s) => s.status === "active").length;
    const totalAmount = approvedSessions.reduce(
      (sum, s) => sum + (s.refund_amount || 0),
      0
    );

    return { total, approvedCount, deniedCount, activeCount, totalAmount };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === "approved" && s.outcome !== "approved") return false;
      if (filter === "denied" && s.outcome !== "denied") return false;
      if (filter === "active" && s.status !== "active") return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.customer_name?.toLowerCase().includes(q) ||
          s.customer_email?.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sessions, filter, search]);

  return (
    <div className="min-h-screen pb-12 bg-slate-50 text-slate-900 flex flex-col items-center">
      {/* ── Admin Header ── */}
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              ← Customer Support
            </Link>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-slate-900">
                Agent Operations Console
              </h1>
              <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                ShopEase Admin
              </span>
            </div>
          </div>

          <button onClick={fetchSessions} className="btn-secondary text-xs">
            ↻ Refresh Data
          </button>
        </div>
      </header>

      {/* ── Main Container (Centralized) ── */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Metrics Cards Grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs font-semibold text-slate-500 mb-1">Total Sessions</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.total}</p>
            <p className="text-[11px] text-slate-500 mt-1">{metrics.activeCount} currently active</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs font-semibold text-slate-500 mb-1">Approved Refunds</p>
            <p className="text-2xl font-bold text-emerald-600">{metrics.approvedCount}</p>
            <p className="text-[11px] text-emerald-700/80 mt-1">Policy verified</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs font-semibold text-slate-500 mb-1">Denied Requests</p>
            <p className="text-2xl font-bold text-red-600">{metrics.deniedCount}</p>
            <p className="text-[11px] text-red-600/80 mt-1">Rule enforced</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs font-semibold text-slate-500 mb-1">Total Disbursed</p>
            <p className="text-2xl font-bold text-slate-900">
              ₹{metrics.totalAmount.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">INR refund volume</p>
          </div>
        </div>

        {/* ── Sessions Table Card ── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          {/* Table Toolbar */}
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900">Agent Sessions</h2>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {filteredSessions.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Tabs */}
              <div className="flex p-1 bg-slate-200/70 rounded-lg border border-slate-200">
                {(["all", "approved", "denied", "active"] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all ${filter === tab
                        ? "bg-white text-blue-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer / session ID…"
                className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-slate-900 placeholder-slate-400 min-w-[200px]"
              />
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingDots color="#2563eb" />
            </div>
          ) : error ? (
            <PageError message={error} />
          ) : filteredSessions.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <p className="text-xs">No sessions match your filter query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3">Session ID</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Outcome</th>
                    <th className="px-6 py-3">Audit Logs</th>
                    <th className="px-6 py-3">Duration</th>
                    <th className="px-6 py-3">Started</th>
                    <th className="px-6 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSessions.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4 font-mono font-semibold text-blue-600">
                        <Link href={`/admin/${s.id}`} className="hover:underline">
                          {s.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{s.customer_name}</p>
                        {s.customer_email && (
                          <p className="text-[11px] text-slate-500">{s.customer_email}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-6 py-4">
                        <OutcomeBadge outcome={s.outcome} amount={s.refund_amount} />
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        {s.total_logs} events
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-600">
                        {formatDuration(s.started_at, s.ended_at)}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {formatTime(s.started_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/admin/${s.id}`}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Inspect →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
