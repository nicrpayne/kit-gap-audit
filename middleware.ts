import { NextRequest, NextResponse } from "next/server";
import { bridgeTransportTokenFor, SESSION_COOKIE } from "@/lib/auth";
import { equalCredential } from "@/lib/auth/operatorPolicy";
import { authenticateOperatorCookie } from "@/lib/auth/operatorSessions";
import {
  AUTH_PRIVATE_HEADERS,
  isSameOriginWrite,
  isTrustedBearerWrite,
  isWriteRequest,
} from "@/lib/auth/requestPolicy";

// `/api/version` is here on purpose, and it is the only route on this list
// that is not part of signing in. It answers ONE question — which commit is
// this process running — from a six-key allowlist that no request can widen
// (see lib/version.ts). Putting it behind the session would make it useless
// for the check it exists for: proving from outside, before anyone logs in,
// that the running build is the build that was pushed.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout", "/api/version"];

const denied = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: AUTH_PRIVATE_HEADERS });
const allowed = () => NextResponse.next({ headers: AUTH_PRIVATE_HEADERS });

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // These routes have their own fail-closed recipient authentication. Reader
  // cookies are never accepted by the operator app or any other API route.
  if (
    /^\/shared\/reports\/[^/]+\/?$/.test(pathname) ||
    /^\/api\/report-access\/[^/]+\/(request|verify|logout|pdf)\/?$/.test(pathname)
  ) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Frame-Options", "DENY");
    return response;
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return allowed();
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    // Only explicit development/test runtimes may run without authentication.
    // A missing deployment secret must never expose the operator APIs.
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return !isWriteRequest(req.method) || isSameOriginWrite(req)
        ? allowed()
        : denied("This request must come from Signal.", 403);
    }
    return NextResponse.json(
      { error: "Operator authentication is not configured. Contact the administrator." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Preserve the existing machine-client contract. Bridge credentials remain
  // scoped; the shared password bearer is not accepted on bridge transports.
  if (pathname.startsWith("/api/")) {
    const credential = pathname.startsWith("/api/bridge/")
      ? await bridgeTransportTokenFor(appPassword)
      : appPassword;
    if (equalCredential(req.headers.get("authorization") ?? "", `Bearer ${credential}`)) {
      return !isWriteRequest(req.method) || isTrustedBearerWrite(req)
        ? allowed()
        : denied("This request must come from Signal.", 403);
    }
  }

  try {
    if (await authenticateOperatorCookie(req.cookies.get(SESSION_COOKIE)?.value, appPassword)) {
      return !isWriteRequest(req.method) || isSameOriginWrite(req)
        ? allowed()
        : denied("This request must come from Signal.", 403);
    }
  } catch {
    // A failed lookup must neither grant access nor clear a potentially valid
    // cookie. The user can retry after storage recovers without losing work.
    return denied("Sign-in verification is temporarily unavailable. Please retry.", 503);
  }
  if (pathname.startsWith("/api/")) return denied("Unauthorized", 401);

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl, { headers: AUTH_PRIVATE_HEADERS });
}

export const config = {
  // Next 15.5 supports Node middleware; Prisma cannot run in the Edge bundle.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
