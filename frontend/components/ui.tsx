/**
 * Shared UI components used across both customer chat and admin pages.
 */

import type { Outcome, SessionStatus } from "@/lib/types";

// ---------- Loading spinner / dots ----------

export function LoadingDots({ color = "#4f46e5" }: { color?: string }) {
    return (
        <span className="inline-flex items-center gap-1" aria-label="Loading">
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: color }} />
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: color }} />
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: color }} />
        </span>
    );
}

// ---------- Status badge (active / completed / error) ----------

export function StatusBadge({ status }: { status: SessionStatus | string }) {
    const map: Record<string, string> = {
        active: "badge badge-pending",
        completed: "badge badge-approved",
        error: "badge badge-denied",
    };
    const labels: Record<string, string> = {
        active: "Active",
        completed: "Completed",
        error: "Error",
    };
    return (
        <span className={map[status] ?? "badge badge-neutral"}>
            {status === "active" && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 live-dot inline-block" />
            )}
            {labels[status] ?? status}
        </span>
    );
}

// ---------- Outcome badge ----------

export function OutcomeBadge({
    outcome,
    amount,
}: {
    outcome: Outcome | string;
    amount?: number | null;
}) {
    if (outcome === "approved") {
        return (
            <span className="badge badge-approved">
                ✓ Approved{amount ? ` ₹${amount.toLocaleString("en-IN")}` : ""}
            </span>
        );
    }
    if (outcome === "denied") {
        return <span className="badge badge-denied">✕ Denied</span>;
    }
    if (outcome === "pending_confirmation") {
        return <span className="badge badge-info">⏳ Awaiting Confirmation</span>;
    }
    if (outcome === "refund_status") {
        return <span className="badge badge-info">ℹ Status Query</span>;
    }
    if (outcome === "pending" || outcome === "in_progress") {
        return <span className="badge badge-pending">● In Progress</span>;
    }
    if (outcome === "error") {
        return <span className="badge badge-denied">⚠ Error</span>;
    }
    return <span className="badge badge-neutral">—</span>;
}

// ---------- Duration formatter ----------

export function formatDuration(start: string, end: string | null): string {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ---------- Time formatter ----------

export function formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ---------- Page error state ----------

export function PageError({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-3xl">⚠️</span>
            <p className="text-sm font-medium text-rose-600">{message}</p>
        </div>
    );
}

// ---------- Full-page loading state ----------

export function PageLoading() {
    return (
        <div className="flex items-center justify-center py-24">
            <LoadingDots />
        </div>
    );
}
