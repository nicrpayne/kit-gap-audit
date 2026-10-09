import "server-only";
import type { SharingConfig } from "./sharingPolicy";

/** No report content, secrets, codes or recipient addresses are written to logs.
 * A delivery failure leaves the challenge unusable; the reader can resend. */
export async function sendReportCode(config: SharingConfig, input: { challengeId: string; shareId: string; email: string; code: string }, transport: typeof fetch = fetch) {
  const response = await transport("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${config.mail.key}`, "Content-Type": "application/json", "Idempotency-Key": `signal-report-${input.challengeId}` },
    body: JSON.stringify({ from: `Signal <${config.mail.from}>`, to: [input.email], subject: "Your Signal report sign-in code",
      text: `Your one-time Signal report code is ${input.code}.\n\nIt expires in 10 minutes. Enter it only at ${config.origin}/shared/reports/${encodeURIComponent(input.shareId)}\n\nIf you did not request this code, ignore this email. Never share this code with another person.` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Report email delivery failed.");
}
