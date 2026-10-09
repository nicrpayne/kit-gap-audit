import { NextRequest, NextResponse } from "next/server";
import { bridgeTransportTokenFor, SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";

// `/api/version` is here on purpose, and it is the only route on this list
// that is not part of signing in. It answers ONE question — which commit is
// this process running — from a six-key allowlist that no request can widen
// (see lib/version.ts). Putting it behind the session would make it useless
// for the check it exists for: proving from outside, before anyone logs in,
// that the running build is the build that was pushed.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/version"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // These routes have their own fail-closed recipient authentication. Reader
  // cookies are never accepted by the operator app or any other API route.
  if (/^\/shared\/reports\/[^/]+\/?$/.test(pathname) || /^\/api\/report-access\/[^/]+\/(request|verify|logout)\/?$/.test(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Frame-Options", "DENY");
    return response;
  }

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
    if (pathname.startsWith("/api/bridge/")) {
      const bridgeToken = await bridgeTransportTokenFor(appPassword);
      if (authHeader === `Bearer ${bridgeToken}`) return NextResponse.next();
      return NextResponse.json({ error: "Unauthorized bridge transport" }, { status: 401 });
    }
    if (authHeader === `Bearer ${appPassword}`) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
