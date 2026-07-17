export const ESTIMATE_PROMPT_VERSION = "v1";

export interface EstimateCandidate {
  externalId: string;
  title: string;
  description: string | null;
  state: string;
  points: number | null;
  labels: string[];
}

const RULES = `You are an experienced software delivery estimator. You will receive:
(A) context about the team, stack, and what this release is, and
(B) a batch of work tickets (title, description, workflow state, the team's
own point estimate if any, labels).

For EACH ticket, estimate how many working days it will take ONE competent
developer on this team to complete it -- implementation, testing, code
review, and integration included. Read the description carefully: estimate
what the work actually is, not what the title suggests.

Rules:
- Give a three-point estimate in days: "lowDays" (goes smoothly),
  "likelyDays" (realistic), "highDays" (hits complications).
- The team's own points are a signal, not the answer. If your reading of
  the ticket disagrees with their pointing by 2x or more, keep YOUR
  estimate and add the flag "bigger_than_pointed" or
  "smaller_than_pointed".
- If the description is missing, one-liner-vague, or the scope is
  ambiguous, widen the range substantially and add "unclear_scope".
- If the description implies work beyond what's written (migrations,
  platform-specific handling, coordination with another system), estimate
  it in and add "hidden_work".
- "relevance": judge from CONTENT whether this ticket is part of the
  release described in (A). "core" = required for it. "peripheral" =
  related but could ship after. "unrelated" = a different product or
  workstream entirely. Do not rely on labels for this; read the ticket.
- A ticket already in a "started" state is partially done -- estimate the
  REMAINING work, slightly reduced from a cold start.
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
