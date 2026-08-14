"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Next.js App Router Boundary Error:", error);
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-600 max-w-sm mb-6">
                {error.message || "An unexpected error occurred while loading the application."}
            </p>

            <div className="flex items-center gap-3">
                <button onClick={() => reset()} className="btn-primary flex items-center gap-1.5 cursor-pointer">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                </button>
                <Link href="/" className="btn-secondary text-xs">
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
