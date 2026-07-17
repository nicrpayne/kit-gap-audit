import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    // No password configured: fail open in local/dev so setup isn't blocked,
    // but this should always be set before deploying.
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await sessionTokenFor(appPassword);

  if (cookie === expected) {
    return NextResponse.next();
  }

  // Programmatic access (e.g. an external agent submitting a transcript):
  // API routes also accept `Authorization: Bearer <APP_PASSWORD>` in place
  // of the cookie session. Page routes stay cookie-only.
  if (pathname.startsWith("/api/")) {
    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${appPassword}`) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
