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
        <div className="w-full max-w-md mx-auto">
            {/* Nav bar */}
            <div className="mb-8 flex items-center justify-between">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-purple-700 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Customer Support
                </Link>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                    Admin Auth
                </span>
            </div>

            {/* Card */}
            <SpotlightCard className="bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden">
                {/* Card header */}
                <div className="px-8 pt-8 pb-6 border-b border-slate-100 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-extrabold text-slate-900 leading-snug">
                            Admin Console Login
                        </h1>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                            ShopEase Agent Operations Portal
                        </p>
                    </div>
                </div>

                {/* Form body */}
                <div className="px-8 py-8">
                    {error && (
                        <div className="mb-6 flex items-start gap-2 px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
                            <span className="mt-0.5">⚠</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate>
                        {/* Email field */}
                        <div className="mb-5">
                            <label
                                htmlFor="admin-email"
                                className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2"
                            >
                                Admin Email
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                    <Mail className="w-4 h-4 text-slate-400" />
                                </span>
                                <input
                                    id="admin-email"
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your admin email"
                                    required
                                    className="block w-full rounded-lg border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-100"
                                />
                            </div>
                        </div>

                        {/* Password field */}
                        <div className="mb-8">
                            <label
                                htmlFor="admin-password"
                                className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2"
                            >
                                Password
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                    <Lock className="w-4 h-4 text-slate-400" />
                                </span>
                                <input
                                    id="admin-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    required
                                    className="block w-full rounded-lg border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-100"
                                />
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl py-3 px-5 text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            <span>{loading ? "Authenticating…" : "Sign In to Admin Console"}</span>
                            {!loading && <ArrowRight className="w-4 h-4" />}
                        </button>
                    </form>
                </div>
            </SpotlightCard>
        </div>
    );
}

export default function AdminLoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 px-4 py-12">
            <Suspense fallback={<div className="text-xs text-slate-500">Loading…</div>}>
                <AdminLoginForm />
            </Suspense>
        </div>
    );
}
