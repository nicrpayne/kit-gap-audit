import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { revokeOperatorSession } from "@/lib/auth/operatorSessions";
import { AUTH_PRIVATE_HEADERS, isSameOriginWrite } from "@/lib/auth/requestPolicy";

export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req))
    return NextResponse.json(
      { error: "This request must come from Signal." },
      { status: 403, headers: AUTH_PRIVATE_HEADERS },
    );
  try {
    await revokeOperatorSession(req.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ ok: true }, { headers: AUTH_PRIVATE_HEADERS });
    response.cookies.set(SESSION_COOKIE, "", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
    });
    return response;
  } catch {
    // Do not claim revocation or delete the cookie if the database write failed.
    return NextResponse.json(
      { error: "Sign-out could not be completed. Please retry." },
      { status: 503, headers: AUTH_PRIVATE_HEADERS },
    );
  }
}
