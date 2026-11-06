import type { NextRequest } from "next/server";

export const AUTH_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};

export const isWriteRequest = (method: string) =>
  !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

/** Pin the external origin in proxy deployments; never trust forwarded hosts. */
export function operatorOrigin(req: NextRequest): string | null {
  const configured = process.env.OPERATOR_APP_ORIGIN;
  if (!configured) return req.nextUrl.origin;
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSameOriginWrite(req: NextRequest): boolean {
  const expected = operatorOrigin(req);
  return (
    !!expected &&
    req.headers.get("origin") === expected &&
    req.headers.get("sec-fetch-site") !== "cross-site"
  );
}

// Machine clients may omit Origin when supplying explicit bearer credentials.
// Browser credentials are ambient, so cookie-only writes always need Origin.
export function isTrustedBearerWrite(req: NextRequest): boolean {
  return (
    req.headers.get("sec-fetch-site") !== "cross-site" &&
    (!req.headers.has("origin") || isSameOriginWrite(req))
  );
}
