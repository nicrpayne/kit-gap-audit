import type { ReportScopeEvidenceV1 } from "./scopeEvidence";
import { markdownBlockquoteLines, markdownInlineText } from "./markdown";

export const SCOPE_EVIDENCE_BOUNDARY = "Historical evidence captured when Scope was accepted; not a fresh source check and not evidence for an operator-entered numerical estimate. Estimate authority is shown separately in the frozen estimate basis.";
export const SCOPE_EVIDENCE_LEGACY = "Scope evidence receipts were not captured in this older report. They are not backfilled from today's data.";
export const referenceText = (value: unknown): string => typeof value === "string" ? value : JSON.stringify(value) ?? "No reference recorded";

export function scopeEvidenceMarkdown(receipts?: ReportScopeEvidenceV1): string[] {
  const out = ["", "### Accepted Scope evidence"];
  if (!receipts) return [...out, SCOPE_EVIDENCE_LEGACY];
  out.push(SCOPE_EVIDENCE_BOUNDARY, `Frozen in report: ${markdownInlineText(receipts.capturedAt)}.`);
  if (!receipts.capabilities.length) out.push("No accepted capabilities in this report's Scope snapshot.");
  for (const capability of receipts.capabilities) {
    out.push(`- **${markdownInlineText(capability.name)}** · revision ${capability.revision}${capability.excludedFromScenario ? " · REMOVED IN THIS SCENARIO; historical receipt only" : " · accepted Scope at generation"}`);
    if (!capability.references.length) out.push("  - No evidence reference recorded for this capability.");
    for (const ref of capability.references) {
      const capture = ref.capture;
      if (!capture) { out.push(`  - Reference only; no verified captured quote: ${markdownInlineText(referenceText(ref.reference))}`); continue; }
      out.push(...markdownBlockquoteLines(capture.excerpt, "  "));
      out.push(`  - Source: ${markdownInlineText(capture.sourceRef)} · source date ${markdownInlineText(capture.sourceDate ?? "not recorded")} · accepted ${markdownInlineText(capture.acceptedAt)}.`);
      out.push(`  - Original reference: ${markdownInlineText(capture.externalRef ?? "not recorded")} · evidence ${markdownInlineText(ref.evidenceId ?? "not recorded")} · snapshot ${markdownInlineText(capture.contextSnapshotId)}.`);
      out.push(`  - Locator: ${markdownInlineText(JSON.stringify(capture.locator))}`);
      if (ref.auditHref) out.push(`  - [View original passage in Audit (Signal access required)](${ref.auditHref})`);
    }
  }
  return out;
}
