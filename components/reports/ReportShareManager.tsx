"use client";
import { useRef, useState } from "react";
import styles from "./RecipientReport.module.css";

type Share = { id: string; revision: number; path: string; createdAt: string; expiresAt: string; revokedAt: string | null; recipients: { email: string; revokedAt: string | null }[] };
const emailsFrom = (value: string) => value.split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
const activeEmails = (share: Share) => share.recipients.filter(r => !r.revokedAt).map(r => r.email).join("\n");

export default function ReportShareManager({ reportId, pair, ready, missing, initialShares, publicOrigin }: { reportId: string; pair: boolean; ready: boolean; missing: string[]; initialShares: Share[]; publicOrigin: string | null }) {
  const [shares, setShares] = useState(initialShares), [emails, setEmails] = useState(""), [days, setDays] = useState(30), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [editEmails, setEditEmails] = useState(""), [revoking, setRevoking] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  async function send(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/shares`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save access. Try again.");
      const share: Share = data.share;
      setShares(previous => [share, ...previous.filter(s => s.id !== share.id)]);
      // Retry an uncertain response with the same key, but a confirmed create
      // completes that intent. A later replacement must get a fresh identity.
      if (method === "POST") { request.current = null; setReviewed(false); }
      setEditing(null); setRevoking(null);
      setMessage(method === "POST" ? "Private link created. Copy it below and send it only to the approved recipients. No invitation has been sent." : body.action === "revoke" ? "Access revoked. Previously downloaded or printed copies cannot be recalled." : "Recipient access updated. Removed readers must sign in again if you re-add them.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save access."); }
    finally { setBusy(false); }
  }
  async function create() {
    const body = { emails: emailsFrom(emails), pair, days, reviewedPrivateContent: reviewed };
    const key = JSON.stringify(body);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    await send("POST", { ...body, requestId: request.current.id });
  }
  async function copy(path: string) {
    try { await navigator.clipboard.writeText(new URL(path, publicOrigin ?? window.location.origin).href); setError(""); setMessage("Private link copied. The link alone does not grant access."); }
    catch { setError("Copy was unavailable. Select and copy the private link shown below."); }
  }
  return <section className={styles.panel} aria-labelledby="sharing-title">
    <h2 id="sharing-title">Share with named recipients</h2>
    <p>Only the exact email addresses you approve can request a one-time sign-in code. Readers cannot change Signal. This captures the report below, not future project changes.</p>
    <p className={styles.notice}>Names, quotes, estimates and project details are included. Review the executive preview below before granting access. A recipient can still copy, print or photograph what they can read; revocation cannot recall those copies.</p>
    {!ready && <div className={styles.notice} role="status"><strong>Private sharing is not configured yet.</strong><p>Ask the administrator to configure {missing.join(", ")}. Do not paste credentials here. You can review the preview now; publication and sign-in stay disabled until setup is complete.</p></div>}
    <form className={styles.form} onSubmit={e => { e.preventDefault(); void create(); }}>
      <label htmlFor="share-recipients">Who may read this report?</label><textarea id="share-recipients" rows={3} value={emails} onChange={e => setEmails(e.target.value)} placeholder="Approved email addresses, one per line" required maxLength={6500} disabled={!ready || busy} />
      <label htmlFor="share-expiry">Access expires after</label><select id="share-expiry" value={days} onChange={e => setDays(Number(e.target.value))} disabled={!ready || busy}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>
      <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={!ready || busy} />I reviewed the captured content below and approve sharing it with these recipients.</label>
      <button className={styles.primary} disabled={!ready || busy || !reviewed || !emails.trim()}>{busy ? "Saving…" : `Create private ${pair ? "comparison" : "report"} link`}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.notice}>{message}</p>}
    <h3>Existing private links</h3><p className={styles.muted}>Each link holds its own immutable snapshot. Updating this project or its report does not update an existing link.</p>
    {!shares.length && <p>No private links created for this saved report.</p>}
    {shares.map(share => {
      const expired = Date.parse(share.expiresAt) <= Date.now(), closed = !!share.revokedAt || expired;
      return <details key={share.id} open><summary>{share.revokedAt ? "Revoked" : expired ? "Expired" : "Private link"} · expires {new Date(share.expiresAt).toLocaleDateString()} · {share.recipients.filter(r => !r.revokedAt).length} approved recipients</summary>
        <p><a href={`${publicOrigin ?? ""}${share.path}`} target="_blank" rel="noreferrer">{publicOrigin}{share.path}</a></p>
        <ul>{share.recipients.map(r => <li key={r.email}>{r.email}{r.revokedAt ? " — access removed" : ""}</li>)}</ul>
        {!closed && <div className={styles.actions}><button type="button" onClick={() => void copy(share.path)}>Copy private link</button><button type="button" disabled={busy} onClick={() => { setEditing(share.id); setEditEmails(activeEmails(share)); setRevoking(null); }}>Edit recipients</button><button type="button" disabled={busy} onClick={() => { setRevoking(share.id); setEditing(null); }}>Revoke this link…</button></div>}
        {!closed && editing === share.id && <form className={styles.form} onSubmit={e => { e.preventDefault(); void send("PATCH", { shareId: share.id, revision: share.revision, action: "recipients", emails: emailsFrom(editEmails) }); }}><label htmlFor={`edit-${share.id}`}>Approved recipients</label><textarea id={`edit-${share.id}`} rows={3} value={editEmails} onChange={e => setEditEmails(e.target.value)} maxLength={6500} required /><p>Removing an email immediately blocks future reads and invalidates its sign-in codes and sessions.</p><div className={styles.actions}><button disabled={busy}>Save recipients</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div></form>}
        {!closed && revoking === share.id && <div className={styles.notice}><p>Revoke this link for everyone? This cannot be undone; you can create a new link later.</p><div className={styles.actions}><button disabled={busy} onClick={() => void send("PATCH", { shareId: share.id, revision: share.revision, action: "revoke" })}>Yes, revoke access</button><button onClick={() => setRevoking(null)}>Cancel</button></div></div>}
      </details>;
    })}
  </section>;
}
