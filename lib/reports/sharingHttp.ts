import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";
import { equalSecret, PRIVATE_HEADERS, SharingError } from "./sharingPolicy";

export function privateJson(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: PRIVATE_HEADERS }); }
export function sharingFailure(error: unknown) {
  return privateJson({ error: error instanceof SharingError ? error.message : "The report request could not be completed. Please try again." }, error instanceof SharingError ? error.status : 500);
}
export function requireOrigin(req: NextRequest, expectedOrigin: string) {
  if (req.headers.get("origin") !== expectedOrigin || req.headers.get("sec-fetch-site") === "cross-site") throw new SharingError("This request must come from Signal.", 403);
}
export async function requireReportOwner(req: NextRequest, write = false, purpose = "managing private shares") {
  const password = process.env.APP_PASSWORD;
  // New publication management never inherits middleware's local fail-open.
  if (!password) throw new SharingError(`Operator authentication must be configured before ${purpose}.`, 503);
  const bearer = req.headers.get("authorization") ?? "";
  if (equalSecret(bearer, `Bearer ${password}`)) return;
  if (!equalSecret(req.cookies.get(SESSION_COOKIE)?.value ?? "", await sessionTokenFor(password))) throw new SharingError("Operator sign-in required.", 401);
  if (write) requireOrigin(req, req.nextUrl.origin);
}
export async function sharingBody(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new SharingError("JSON is required.", 415);
  if (Number(req.headers.get("content-length") ?? 0) > 8192) throw new SharingError("Request is too large.", 413);
  const reader = req.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); throw new SharingError("Request is too large.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let body;
  try { body = JSON.parse(raw); } catch { throw new SharingError("Invalid request."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SharingError("Invalid request.");
  return body as Record<string, unknown>;
}
