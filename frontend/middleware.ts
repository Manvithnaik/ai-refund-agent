import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // Protect /admin routes (except /admin/login)
    if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
        const sessionToken = request.cookies.get("admin_session")?.value;

        if (!sessionToken) {
            const loginUrl = new URL("/admin/login", request.url);
            loginUrl.searchParams.set("from", path);
            return NextResponse.redirect(loginUrl);
        }
    }

    // If user visits /admin/login while already logged in
    if (path === "/admin/login") {
        const sessionToken = request.cookies.get("admin_session")?.value;
        if (sessionToken) {
            return NextResponse.redirect(new URL("/admin", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/admin/:path*"],
};
