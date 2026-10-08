import React from "react";
import type { ReportScopeEvidenceV1 } from "@/lib/reports/scopeEvidence";
import { referenceText, SCOPE_EVIDENCE_BOUNDARY, SCOPE_EVIDENCE_LEGACY } from "@/lib/reports/scopeEvidencePresentation";

/** Reads only frozen report JSON, including on share-preview and print routes. */
export default function ReportScopeEvidence({ receipts }: { receipts?: ReportScopeEvidenceV1 }) {
  return <section aria-label="Accepted Scope evidence" style={{ marginTop: 16, overflowWrap: "anywhere" }}>
    <h3>Accepted Scope evidence</h3>
    {!receipts ? <p>{SCOPE_EVIDENCE_LEGACY}</p> : <>
      <p style={{ fontSize: "0.85em", opacity: 0.85 }}>{SCOPE_EVIDENCE_BOUNDARY}</p>
      <p style={{ fontSize: "0.8em" }}>Frozen in report: {receipts.capturedAt}</p>
      {!receipts.capabilities.length && <p>No accepted capabilities in this report&apos;s Scope snapshot.</p>}
      {receipts.capabilities.map(capability => <details key={capability.id} open style={{ marginTop: 12 }}>
        <summary><strong>{capability.name}</strong> · revision {capability.revision}{capability.excludedFromScenario ? " · REMOVED IN THIS SCENARIO; historical receipt only" : " · accepted Scope at generation"}</summary>
        {!capability.references.length && <p>No evidence reference recorded for this capability.</p>}
        {capability.references.map((ref, index) => <div key={index} style={{ margin: "10px 0", padding: 12, border: "1px solid currentColor", borderRadius: 6 }}>
          {ref.capture ? <>
            <blockquote style={{ whiteSpace: "pre-wrap", margin: "0 0 8px" }}>{ref.capture.excerpt}</blockquote>
            <small>Source: {ref.capture.sourceRef}<br />Source date: {ref.capture.sourceDate ?? "not recorded"} · Accepted: {ref.capture.acceptedAt}</small>
            <details style={{ marginTop: 8 }} open>
              <summary>Original source and locator</summary>
              <small>Original reference: {ref.capture.externalRef ?? "not recorded"}<br />Evidence: {ref.evidenceId}<br />Snapshot: {ref.capture.contextSnapshotId}<br />Locator: {JSON.stringify(ref.capture.locator)}</small>
            </details>
            {ref.auditHref && <p><a href={ref.auditHref}>View original passage in Audit (Signal access required)</a></p>}
          </> : <p>Reference only; no verified captured quote: {referenceText(ref.reference)}</p>}
        </div>)}
      </details>)}
    </>}
  </section>;
}
