import { NextResponse } from "next/server";

const ADMIN_EMAIL = "admin@123";
const ADMIN_PASSWORD = "123456";
const AUTH_COOKIE = "admin_session";

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            const response = NextResponse.json({ success: true, message: "Authenticated successfully" });

            response.cookies.set({
                name: AUTH_COOKIE,
                value: "authenticated_admin_token_982347",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 7, // 7 days
            });

            return response;
        }

        return NextResponse.json(
            { success: false, message: "Invalid email or password" },
            { status: 401 }
        );
    } catch {
        return NextResponse.json(
            { success: false, message: "Invalid request payload" },
            { status: 400 }
        );
    }
}
