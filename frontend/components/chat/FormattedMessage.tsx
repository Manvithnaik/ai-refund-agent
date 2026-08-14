"use client";

import React from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import type { Decision } from "@/lib/types";

// ── Refund Decision Result Banner ────────────────────────────────────
export function RefundDecisionCard({
    decision,
    amount,
    refundId,
    reason,
}: {
    decision: Decision;
    amount?: number | null;
    refundId?: string | null;
    reason?: string | null;
}) {
    if (decision === "approved") {
        return (
            <div className="mb-3 p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Refund Request Approved</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-emerald-200/70">
                    {amount != null && (
                        <div>
                            <span className="text-emerald-700/80 block text-[10px] uppercase font-mono font-bold">Approved Amount</span>
                            <span className="font-extrabold text-sm text-emerald-950">
                                ₹{amount.toLocaleString("en-IN")}
                            </span>
                        </div>
                    )}
                    {refundId && (
                        <div>
                            <span className="text-emerald-700/80 block text-[10px] uppercase font-mono font-bold">Reference ID</span>
                            <span className="font-mono text-xs font-semibold text-emerald-950">{refundId}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (decision === "denied") {
        return (
            <div className="mb-3 p-3.5 rounded-xl bg-red-50/90 border border-red-200 text-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                    <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>Refund Policy Notice: Request Denied</span>
                </div>

                {reason && (
                    <div className="text-xs pt-1.5 border-t border-red-200/70 text-red-950">
                        <span className="text-red-700/80 block text-[10px] uppercase font-mono font-bold">Policy Reason</span>
                        <p className="mt-0.5 font-medium leading-relaxed">{reason}</p>
                    </div>
                )}
            </div>
        );
    }

    return null;
}

// ── Text Formatter (Highlights Order IDs, Bold text, Bullet lists) ──
export function FormattedText({ text }: { text: string }) {
    if (!text) return null;

    // Split into lines
    const lines = text.split("\n");

    return (
        <div className="space-y-1.5 leading-relaxed text-sm">
            {lines.map((line, lineIdx) => {
                if (!line.trim()) return <div key={lineIdx} className="h-1.5" />;

                // Check if bullet point
                const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("• ");
                const content = isBullet ? line.trim().substring(2) : line;

                // Parse bold text and Order IDs
                const parts = content.split(/(\*\*.*?\*\*|ORD-\d+)/g);

                const renderedLine = parts.map((part, partIdx) => {
                    if (part.startsWith("**") && part.endsWith("**")) {
                        return (
                            <strong key={partIdx} className="font-semibold text-slate-900">
                                {part.slice(2, -2)}
                            </strong>
                        );
                    }
                    if (/^ORD-\d+$/.test(part)) {
                        return (
                            <span
                                key={partIdx}
                                className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-purple-100 text-purple-800 border border-purple-200"
                            >
                                {part}
                            </span>
                        );
                    }
                    return part;
                });

                if (isBullet) {
                    return (
                        <div key={lineIdx} className="flex items-start gap-2 pl-1">
                            <span className="text-purple-600 font-bold text-xs mt-0.5">•</span>
                            <span className="flex-1">{renderedLine}</span>
                        </div>
                    );
                }

                return <p key={lineIdx}>{renderedLine}</p>;
            })}
        </div>
    );
}
