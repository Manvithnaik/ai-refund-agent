import { LoadingDots } from "@/components/ui";

export default function Loading() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-3">
                <LoadingDots color="#9333ea" />
                <p className="text-xs font-semibold text-slate-500">Loading ShopEase Support App...</p>
            </div>
        </div>
    );
}
