import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OPERATOR_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const LOGIN_WINDOW_MS = 5 * 60_000;
export const LOGIN_ATTEMPTS = 20;

export function equalCredential(left: string, right: string): boolean {
  // Compare fixed-length digests; neither a length mismatch nor a matching
  // prefix should reveal how much of a submitted credential was correct.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

export const operatorTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function operatorCredentialVersion(
  password: string,
  epoch = process.env.OPERATOR_SESSION_EPOCH ?? "1",
) {
  // Changing either the password or epoch invalidates all prior sessions,
  // without storing the shared password or altering report-reader sessions.
  return createHmac("sha256", password).update(`signal:operator-session:v1:${epoch}`).digest("hex");
}

export function legacySessionWindowOpen(
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): boolean {
  const start = Date.parse(env.OPERATOR_LEGACY_SESSION_FROM ?? "");
  const end = Date.parse(env.OPERATOR_LEGACY_SESSION_UNTIL ?? "");
  // Explicit, absolute and at most seven days. A restart never renews grace.
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    end - start <= 7 * 24 * 60 * 60_000 &&
    start <= now &&
    now < end
  );
}

export function isOperatorToken(token: string | undefined): token is string {
  return !!token && /^op1_[0-9a-f]{64}$/.test(token);
}
