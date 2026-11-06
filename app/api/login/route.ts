import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { equalCredential, OPERATOR_SESSION_SECONDS } from "@/lib/auth/operatorPolicy";
import { consumeLoginAttempt, createOperatorSession } from "@/lib/auth/operatorSessions";
import { AUTH_PRIVATE_HEADERS, isSameOriginWrite } from "@/lib/auth/requestPolicy";
import { readJsonObject, RequestValidationError } from "@/lib/http/json";

const failure = (error: string, status: number, extra: Record<string, string> = {}) =>
  NextResponse.json({ error }, { status, headers: { ...AUTH_PRIVATE_HEADERS, ...extra } });

export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req)) return failure("This request must come from Signal.", 403);
  let password: string;
  try {
    const body = await readJsonObject(req, 8 * 1024);
    if (typeof body.password !== "string" || !body.password || body.password.length > 1024) {
      throw new RequestValidationError(
        "password must be a non-empty string of at most 1024 characters",
      );
    }
    password = body.password;
  } catch (error) {
    if (error instanceof RequestValidationError) return failure(error.message, error.status);
    return failure("Unable to read sign-in request. Please retry.", 400);
  }
  const configured = process.env.APP_PASSWORD;
  if (!configured)
    return failure("Operator authentication is not configured. Contact the administrator.", 503);
  try {
    const attempt = await consumeLoginAttempt();
    if (!attempt.allowed)
      return failure("Too many sign-in attempts. Please wait a few minutes and try again.", 429, {
        "Retry-After": String(attempt.retryAfter),
      });
    if (!equalCredential(password, configured)) return failure("Incorrect password.", 401);
    const session = await createOperatorSession(configured);
    const response = NextResponse.json({ ok: true }, { headers: AUTH_PRIVATE_HEADERS });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OPERATOR_SESSION_SECONDS,
      expires: session.expiresAt,
    });
    return response;
  } catch {
    return failure("Sign-in is temporarily unavailable. Please retry.", 503);
  }
}
