"use client";
import React, { useEffect, useRef } from "react";
import type { AuditPassageReceipt } from "@/lib/audit/passageReceipt";

export default function AuditOriginalPassage({ receipt, onClose }: { receipt: AuditPassageReceipt; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const passage = receipt.passage;
  return <dialog ref={dialog} aria-labelledby="original-passage-title" onCancel={onClose} onClose={onClose}
    style={{ position: "fixed", margin: "auto", width: "min(720px, 92vw)", maxHeight: "85vh", overflow: "auto", padding: 24, border: "1px solid var(--i-signal)", borderRadius: 12, background: "var(--i-panel)", color: "var(--i-text)", overflowWrap: "anywhere" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <h2 id="original-passage-title" style={{ fontSize: 20 }}>Original source passage</h2>
      <button type="button" autoFocus onClick={onClose} aria-label="Close original source passage">Close ✕</button>
    </div>
    <p style={{ margin: "12px 0", color: "var(--i-amber)" }}>Historical snapshot · read-only. This is the exact linked source, not today&apos;s project state.</p>
    {passage ? <>
      <blockquote style={{ whiteSpace: "pre-wrap", padding: 16, borderLeft: "3px solid var(--i-signal)", background: "var(--i-recess)", margin: "16px 0" }}>{passage.quote}</blockquote>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", gap: "10px 16px", fontSize: 13 }}>
        <dt>Source</dt><dd>{passage.sourceRef}</dd>
        <dt>Source date</dt><dd>{passage.sourceDate ?? "Not recorded"}</dd>
        <dt>Snapshot recorded</dt><dd>{passage.snapshotRecordedAt}</dd>
        <dt>Original reference</dt><dd>{passage.externalRef ?? "Not recorded"}</dd>
        <dt>Snapshot</dt><dd>{receipt.snapshotId}</dd>
        <dt>Evidence</dt><dd>{receipt.evidenceId}</dd>
        <dt>Locator</dt><dd>{JSON.stringify(passage.locator)}</dd>
      </dl>
      {passage.surroundingContext ? <details style={{ marginTop: 16 }}><summary>Supplied surrounding context</summary><p style={{ whiteSpace: "pre-wrap" }}>{passage.surroundingContext}</p></details> : <p style={{ marginTop: 16, fontSize: 12 }}>Only this passage was supplied here; a full conversation is not attached to this receipt.</p>}
    </> : <p role="alert">The requested passage is unavailable in this project&apos;s original snapshot. No current quote has been substituted.</p>}
    <button type="button" onClick={onClose} style={{ marginTop: 20, border: "1px solid var(--i-signal)", borderRadius: 6, padding: "8px 12px" }}>Return to current Audit</button>
  </dialog>;
}
