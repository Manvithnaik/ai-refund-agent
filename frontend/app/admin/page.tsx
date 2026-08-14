"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Banknote,
  Search,
  RefreshCw,
  ArrowLeft,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
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
import { SpotlightCard } from "@/components/ui/SpotlightCard";

type FilterTab = "all" | "approved" | "denied" | "active";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

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
    <div className="min-h-screen pb-12 bg-gradient-to-br from-slate-50 via-purple-50/20 to-slate-100 text-slate-900 flex flex-col items-center">
      {/* ── Admin Header ── */}
      <header className="w-full bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 sticky top-0 z-20 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-purple-600 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Customer Support
            </Link>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-slate-900">
                Agent Operations Console
              </h1>
              <span className="text-[10px] uppercase font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                ShopEase Admin
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={fetchSessions} className="btn-secondary text-xs flex items-center gap-1.5 cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Data
            </button>

            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-xl font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Metrics Cards Grid with Spotlight Glow ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SpotlightCard className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Sessions</span>
              <BarChart3 className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{metrics.total}</p>
            <p className="text-[11px] text-slate-500 mt-1">{metrics.activeCount} currently active</p>
          </SpotlightCard>

          <SpotlightCard className="p-5" spotlightColor="rgba(34, 197, 94, 0.15)" borderColor="rgba(34, 197, 94, 0.4)">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Approved Refunds</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-600">{metrics.approvedCount}</p>
            <p className="text-[11px] text-emerald-700/80 mt-1">Policy verified</p>
          </SpotlightCard>

          <SpotlightCard className="p-5" spotlightColor="rgba(239, 68, 68, 0.15)" borderColor="rgba(239, 68, 68, 0.4)">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Denied Requests</span>
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-extrabold text-red-600">{metrics.deniedCount}</p>
            <p className="text-[11px] text-red-600/80 mt-1">Rule enforced</p>
          </SpotlightCard>

          <SpotlightCard className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Disbursed</span>
              <Banknote className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900">
              ₹{metrics.totalAmount.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">INR refund volume</p>
          </SpotlightCard>
        </div>

        {/* ── Sessions Table Card ── */}
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
          {/* Table Toolbar */}
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900">Agent Audit Sessions</h2>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                {filteredSessions.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Tabs */}
              <div className="flex p-1 bg-slate-200/70 rounded-xl border border-slate-200">
                {(["all", "approved", "denied", "active"] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${filter === tab
                      ? "bg-white text-purple-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer / session ID…"
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:border-purple-500 text-slate-900 placeholder-slate-400 min-w-[210px]"
                />
              </div>
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingDots color="#9333ea" />
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
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3.5">Session ID</th>
                    <th className="px-6 py-3.5">Customer</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Outcome</th>
                    <th className="px-6 py-3.5">Audit Logs</th>
                    <th className="px-6 py-3.5">Duration</th>
                    <th className="px-6 py-3.5">Started</th>
                    <th className="px-6 py-3.5 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSessions.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-purple-50/30 transition-colors group"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-purple-700">
                        <Link href={`/admin/${s.id}`} className="hover:underline">
                          {s.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{s.customer_name ?? "Customer"}</p>
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
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 transition-colors"
                        >
                          <span>Inspect</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
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
