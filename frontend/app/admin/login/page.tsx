"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

function AdminLoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectPath = searchParams.get("from") || "/admin";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || loading) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                router.push(redirectPath);
                router.refresh();
            } else {
                setError(data.message || "Invalid credentials. Please try again.");
            }
        } catch {
            setError("Server error during login. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-lg mx-auto">
            {/* Top Header Navigation */}
            <div className="mb-6 flex items-center justify-between px-1">
                <Link
                    href="/"
                    className="text-xs font-semibold text-slate-600 hover:text-purple-700 transition-colors flex items-center gap-2 py-1"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Customer Support
                </Link>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                    Admin Auth
                </span>
            </div>

            {/* Spacious Login Card */}
            <SpotlightCard className="p-8 sm:p-10 bg-white border border-slate-200 shadow-lg rounded-2xl">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-purple">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="font-extrabold text-xl text-slate-900 leading-tight">
                            Admin Console Login
                        </h1>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            ShopEase Agent Operations Portal
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 px-4 py-3 rounded-xl text-xs font-medium bg-red-50 border border-red-200 text-red-700 fade-in-up">
                        ⚠ {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                            Admin Email
                        </label>
                        <div className="relative">
                            <Mail className="w-4.5 h-4.5 text-slate-400 absolute left-3.5 top-3.5" />
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@123"
                                required
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-purple-500 focus:bg-white text-slate-900 placeholder-slate-400 transition-all shadow-xs"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                            Password
                        </label>
                        <div className="relative">
                            <Lock className="w-4.5 h-4.5 text-slate-400 absolute left-3.5 top-3.5" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-purple-500 focus:bg-white text-slate-900 placeholder-slate-400 transition-all shadow-xs"
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="btn-primary w-full py-3 px-5 flex items-center justify-center gap-2 text-sm font-bold rounded-xl cursor-pointer shadow-md"
                        >
                            <span>{loading ? "Authenticating..." : "Sign In to Admin Console"}</span>
                            {!loading && <ArrowRight className="w-4 h-4" />}
                        </button>
                    </div>
                </form>
            </SpotlightCard>
        </div>
    );
}

export default function AdminLoginPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 px-4 py-12 sm:py-16 text-slate-900">
            <Suspense fallback={<div className="text-xs text-slate-500">Loading auth...</div>}>
                <AdminLoginForm />
            </Suspense>
        </div>
    );
}
