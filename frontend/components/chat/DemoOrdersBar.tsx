"use client";

import { Sparkles, Tag, ArrowRight } from "lucide-react";

interface DemoOrdersBarProps {
    onSelectOrder: (text: string) => void;
}

export function DemoOrdersBar({ onSelectOrder }: DemoOrdersBarProps) {
    const demoOrders = [
        {
            id: "ORD-1001",
            title: "ORD-1001 • Eligible Return",
            item: "Wireless Earbuds • Delivered 3 days ago",
            color: "hover:border-purple-300 hover:bg-purple-50/60 text-purple-800 bg-purple-50/30 border-purple-200/80",
            badge: "Full Refund",
            query: "I want to request a refund for order ORD-1001.",
        },
        {
            id: "ORD-1002",
            title: "ORD-1002 • Window Expired",
            item: "Smart Watch • Delivered 45 days ago",
            color: "hover:border-amber-300 hover:bg-amber-50/60 text-amber-900 bg-amber-50/30 border-amber-200/80",
            badge: "Policy Denied",
            query: "Can I get a refund for order ORD-1002?",
        },
        {
            id: "ORD-1014",
            title: "ORD-1014 • Damaged Item",
            item: "Leather Wallet • Reported Damaged",
            color: "hover:border-sky-300 hover:bg-sky-50/60 text-sky-900 bg-sky-50/30 border-sky-200/80",
            badge: "Special Case",
            query: "Check status of refund for order ORD-1014.",
        },
    ];

    return (
        <div className="w-full max-w-5xl mt-6 pt-5 border-t border-slate-200/80">
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Quick Test Order Scenarios
                    </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline-block">
                    Click any scenario to simulate customer query
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {demoOrders.map((ord) => (
                    <button
                        key={ord.id}
                        onClick={() => onSelectOrder(ord.query)}
                        className={`text-left p-3 rounded-xl border transition-all duration-200 group cursor-pointer shadow-xs ${ord.color}`}
                    >
                        <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold font-mono group-hover:text-purple-700 transition-colors">
                                {ord.title}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <p className="text-[11px] text-slate-600 font-medium truncate">
                            {ord.item}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
}
