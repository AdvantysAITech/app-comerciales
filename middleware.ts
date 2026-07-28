import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const estaLogueado = !!req.auth;

    if (!estaLogueado) {
        const loginUrl = new URL("/login", req.nextUrl.origin);
        return NextResponse.redirect(loginUrl);
    }
});

export const config = {
    matcher: ["/", "/visitas/:path*", "/oportunidades/:path*", "/ajustes/:path*"]
};