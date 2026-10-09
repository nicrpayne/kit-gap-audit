import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const READER_COOKIE = "signal_report_reader";
export const CODE_TTL_MS = 10 * 60_000;
export const SESSION_TTL_MS = 8 * 60 * 60_000;
export const REQUEST_MESSAGE = "If this address is approved for this report, a sign-in code will arrive shortly. Check spam or ask the person who shared it with you.";
export interface SharingConfig { secret: string; origin: string; mail: { key: string; from: string } }
export class SharingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function emailAddress(value: unknown) {
  if (typeof value !== "string" || value.length > 254) throw new SharingError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) || email.includes("..")) throw new SharingError("Enter a valid email address.");
  return email;
}
export function recipientList(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) throw new SharingError("Choose 1–25 approved email addresses.");
  return [...new Set(value.map(emailAddress))].sort();
}
export function sharingSetup(env: Readonly<Record<string, string | undefined>> = process.env): { config: SharingConfig | null; missing: string[] } {
  const missing: string[] = [];
  const secret = env.REPORT_SHARING_SECRET ?? "";
  if (secret.length < 32) missing.push("Report access secret (at least 32 characters)");
  let origin = "";
  try {
    const url = new URL(env.REPORT_PUBLIC_ORIGIN ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    origin = url.origin;
  } catch { missing.push("HTTPS Signal report origin"); }
  let from = "";
  try { from = emailAddress(env.REPORT_EMAIL_FROM); } catch { missing.push("Verified sending email address"); }
  const key = env.RESEND_API_KEY ?? "";
  if (!key.trim()) missing.push("Email delivery service key (Resend)");
  return { missing, config: missing.length ? null : { secret, origin, mail: { key, from } } };
}
export function requireSharingConfig() {
  const result = sharingSetup();
  if (!result.config) throw new SharingError("Private sharing is not configured. Ask the report owner to finish email setup.", 503);
  return result.config;
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const keyedHash = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export const newCode = () => randomInt(0, 100_000_000).toString().padStart(8, "0");
export const newSession = () => randomBytes(32).toString("base64url");
export const codeHash = (secret: string, challenge: string, code: string) => keyedHash(secret, `report-code:v1:${challenge}:${code}`);
export function shareIsActive(share: { revokedAt: Date | null; expiresAt: Date }, now: Date) {
  return !share.revokedAt && share.expiresAt.getTime() > now.getTime();
}
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
};
