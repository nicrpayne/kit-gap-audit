/** A source's lifecycle is not its importance. No title/tense heuristics and
 * no automatic acceptance: this only prepares the status offered for review. */
export function decisionSourceDisposition(payload: Record<string, unknown>, quotes: string[] = []) {
  const status = String(payload.sourceStatus ?? payload.status ?? "").toLowerCase();
  const approval = String(payload.approvalBasis ?? payload.approval_basis ?? "");
  const explicitlyOpen = ["open", "unresolved", "proposed", "pending"].includes(status);
  const contradicted = payload.unresolvedContradiction === true;
  const approved = ["decided", "closed", "resolved"].includes(status) && approval === "approved";
  // Legacy transcripts sometimes retain an explicit record but no structured
  // lifecycle. A nearby free-form 'agreed' or 'settled' is NOT enough.
  const recordedDecision = !status && quotes.some(quote => /\bStatus:\s*DECIDED\b/i.test(quote));
  const decided = !explicitlyOpen && !contradicted && (approved || recordedDecision);
  return {
    status: decided ? "decided" as const : "open" as const,
    resolution: decided ? String(payload.resolution ?? payload.statement ?? quotes.find(quote => /\bStatus:\s*DECIDED\b/i.test(quote)) ?? "Accepted historical agreement from the cited source.") : null,
    readinessRole: ["release_scope", "reference"].includes(String(payload.readinessRole)) ? String(payload.readinessRole) : "needs_review",
  };
}

export const READINESS_ROLES = ["release_scope", "reference", "needs_review"] as const;
export function blocksReleaseReadiness(decision: { status: string; readinessRole?: string; gate?: unknown }) {
  return decision.status === "open" && !decision.gate && decision.readinessRole !== "reference";
}
