import React from "react";
import { capturedEvidenceAuditHref, type CapabilityEvidenceReference } from "@/lib/scope/capabilityEvidence";

export default function ScopeCapturedEvidence({ evidence, index, scopeId }: { evidence: CapabilityEvidenceReference; index: number; scopeId: string }) {
  const capture = evidence.capture;
  if (!capture || evidence.state !== "captured_at_acceptance") return null;
  const locator = Object.entries(capture.locator);
  const auditHref = capturedEvidenceAuditHref(scopeId, evidence);
  return <li className="rounded px-3 py-2" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
    <div className="i-label">Reference {index + 1} · captured at acceptance</div>
    <blockquote className="mt-1 break-words whitespace-pre-wrap text-[10.5px] leading-relaxed text-[var(--i-text-soft)]">{capture.excerpt}</blockquote>
    {auditHref && <a href={auditHref} className="mt-2 inline-block rounded border border-[var(--i-signal)] px-3 py-2 text-[11px] font-semibold text-[var(--i-signal)] hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--i-signal)]">View original passage in Audit →</a>}
    {evidence.evidenceId && <div className="mt-1 break-all text-[9px] text-[var(--i-text-faint)]">Evidence ID · {evidence.evidenceId}</div>}
    <div className="mt-1 break-all text-[9.5px] text-[var(--i-text-faint)]">Source · {capture.sourceRef}</div>
    {capture.externalRef && capture.externalRef !== capture.sourceRef && <div className="mt-1 break-all text-[9px] text-[var(--i-text-faint)]">Original reference · {capture.externalRef}</div>}
    {capture.sourceUrl && <a href={capture.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[9.5px] text-[var(--i-signal)] hover:underline">Open original source ↗</a>}
    <div className="mt-1 break-words text-[9px] text-[var(--i-text-faint)]">Source date · {capture.sourceDate?.slice(0, 10) ?? "Not recorded in this source receipt"}</div>
    <div className="mt-1 break-words text-[9px] text-[var(--i-text-faint)]">{locator.length ? locator.map(([key, value]) => `${key} · ${String(value)}`).join(" · ") : "Quote hash / character locator · Not recorded; original reference shown above when supplied"}</div>
    <div className="mt-1 break-all text-[9px] text-[var(--i-text-faint)]">Original snapshot · {capture.contextSnapshotId}</div>
    <div className="mt-0.5 text-[8.5px] text-[var(--i-text-faint)]">Captured with the accepted assertion; not a claim about current source state.</div>
  </li>;
}
