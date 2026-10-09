"use client";
import { useState } from "react";
import styles from "./RecipientReport.module.css";
import ReportPdfDownload from "./ReportPdfDownload";

export default function ReportReaderAccess({ shareId, signedIn = false }: { shareId: string; signedIn?: boolean }) {
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function action(kind: "request" | "verify" | "logout") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/report-access/${encodeURIComponent(shareId)}/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "request" ? { email } : { challengeId: challenge, code }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Please try again.");
      if (kind === "request") { setChallenge(result.challengeId); setCode(""); setMessage(result.message); }
      else window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  if (signedIn) return <div className={`${styles.actions} ${styles.noPrint}`}><ReportPdfDownload url={`/api/report-access/${encodeURIComponent(shareId)}/pdf`} /><button onClick={() => window.print()}>Print view</button><button disabled={busy} onClick={() => action("logout")}>Sign out of report</button><p className={styles.muted}>Downloaded copies cannot be revoked. Keep them private.</p>{error && <p role="alert">{error}</p>}</div>;
  return <section className={`${styles.panel} ${styles.form}`}><h1>Open your private report</h1><p>Only approved email addresses can view this report. Your sign-in here does not open the Signal working app.</p>
    <form onSubmit={e => { e.preventDefault(); void action(challenge ? "verify" : "request"); }}>
      <label htmlFor="reader-email">Your approved email address</label><input id="reader-email" type="email" autoComplete="email" value={email} required disabled={busy || Boolean(challenge)} onChange={e => setEmail(e.target.value)} />
      {challenge && <><label htmlFor="reader-code">Eight-digit sign-in code</label><input id="reader-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code} required onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} /><p className={styles.muted}>The code expires after 10 minutes. Codes are never shown in this page or URL.</p></>}
      <div className={styles.actions}><button className={styles.primary} disabled={busy} type="submit">{busy ? "Please wait…" : challenge ? "Verify and open report" : "Email me a sign-in code"}</button>
        {challenge && <button disabled={busy} type="button" onClick={() => { setChallenge(null); setMessage(""); setError(""); }}>Use another email / request a new code</button>}</div>
    </form>
    {message && <p role="status" className={styles.notice}>{message}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    <p className={styles.muted}>If access has expired or been revoked, ask the person who shared the report for a new invitation.</p>
  </section>;
}
