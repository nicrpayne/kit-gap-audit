import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";
import { readJsonObject, RequestValidationError, validationResponse } from "@/lib/http/json";

export async function POST(req: NextRequest) {
  let password: string;
  try {
    const body = await readJsonObject(req, 8 * 1024);
    if (typeof body.password !== "string" || body.password.length === 0) {
      throw new RequestValidationError("password must be a non-empty string");
    }
    password = body.password;
  } catch (error) {
    return validationResponse(error);
  }
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return NextResponse.json(
      { error: "APP_PASSWORD is not configured on the server." },
      { status: 500 },
    );
  }

  if (password !== appPassword) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await sessionTokenFor(appPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
