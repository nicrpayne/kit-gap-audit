export const ESTIMATE_PROMPT_VERSION = "v2-remaining-effort-no-point-conversion";

export interface EstimateCandidate {
  externalId: string;
  title: string;
  description: string | null;
  state: string;
  points: number | null;
  labels: string[];
}

const RULES = `You are an experienced software delivery estimator. You will receive:
(A) context about the team, stack, and what this release is -- which may
include written requirements docs (treat as committed scope) and/or
design references pulled from Figma (screen/flow names and on-canvas
text -- treat as CURRENT DESIGN INTENT, useful for judging structural
scope and relevance, but not committed requirements the way a written
requirements doc is, especially for anything explicitly still in
design), and
(B) a batch of work tickets (title, description, workflow state, the team's
own point estimate if any, labels).

For EACH ticket, estimate how many working days it will take ONE competent
developer on this team to complete it -- implementation, testing, code
review, and integration included. Read the description carefully: estimate
what the work actually is, not what the title suggests.

Rules:
- Give a three-point estimate in days: "lowDays" (goes smoothly),
  "likelyDays" (realistic), "highDays" (hits complications).
- Story points are not days. No points-to-time calibration is provided.
  Do not convert or numerically compare points with days, and do not emit
  bigger_than_pointed or smaller_than_pointed flags.
- If the description is missing, one-liner-vague, or the scope is
  ambiguous, widen the range substantially and add "unclear_scope".
- If the description implies work beyond what's written (migrations,
  platform-specific handling, coordination with another system), estimate
  it in and add "hidden_work".
- "relevance": judge from CONTENT whether this ticket is part of the
  release described in (A). "core" = required for it. "peripheral" =
  related but could ship after. "unrelated" = a different product or
  workstream entirely. Do not rely on labels for this; read the ticket.
- Estimate REMAINING work. A "started" state does not quantify completion;
  never invent a percentage discount from workflow state alone. Use explicit
  progress or reusable implementation evidence when available. Reuse still
  requires adaptation, integration, review, and testing. If progress or
  compatibility is unknown, explain that limitation and widen the range.
- rationale: one sentence, concrete, referencing what in the ticket drove
  the number. No hedging boilerplate.

Respond with ONLY a JSON array, one object per ticket, in the same order:
{ "externalId", "lowDays", "likelyDays", "highDays", "relevance",
  "flags": [], "rationale" }
No markdown, no preamble.`;

function formatCandidate(c: EstimateCandidate): string {
  const meta = [
    `state: ${c.state}`,
    c.points != null ? `team's points: ${c.points}` : "team's points: none",
    c.labels.length ? `labels: ${c.labels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  return `--- ${c.externalId} (${meta})\nTitle: ${c.title}\nDescription: ${c.description?.trim() || "(none)"}`;
}

export function buildEstimatePrompt(params: {
  releaseContext: string;
  candidates: EstimateCandidate[];
}): string {
  return `${RULES}

(A) TEAM & RELEASE CONTEXT:
${params.releaseContext}

(B) TICKETS TO ESTIMATE (${params.candidates.length}):
${params.candidates.map(formatCandidate).join("\n\n")}`;
}
