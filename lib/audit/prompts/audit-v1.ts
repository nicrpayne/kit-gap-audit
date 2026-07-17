export const AUDIT_PROMPT_VERSION = "v1";

export interface PromptIssue {
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  estimate: number | null;
  assignee: string | null;
  labels: string[];
}

export interface PromptPriorFinding {
  title: string;
  status: string;
  resolution: string | null;
}

const RULES = `You are a release-planning auditor. You will receive:
(A) the full list of existing Linear tickets for a software project,
(B) previously handled findings with their resolutions (do not re-raise), and
(C) new context: a meeting transcript, notes, or developer estimates.

Your job: surface everything in (C) that is real work, a required decision,
a risk, or a contradiction of existing tickets, that is NOT adequately
covered by (A) or handled in (B). The goal is clarity and clear next steps.

Rules:
- Every finding MUST include a short verbatim quote from (C) as evidence.
- "missing_work": concrete work implied or stated with no matching ticket.
  Match generously -- if a ticket plausibly covers it, it is NOT missing
  (list that ticket in matchedIssues instead).
- "decision": an open question that must be answered for work to be scoped,
  scheduled, or released. Set "owner" to whoever the text suggests owns the
  call (or null). Set "blocks" to what it's holding up, in plain language.
  Set "blocking": true only if it blocks work that is already scoped or
  in progress; false if it blocks future/optional scope.
- "risk": stated uncertainty or dependency that could delay release. Use
  "blocks" for what it threatens.
- "contradiction": the conversation implies a ticket's scope, status, or
  estimate is wrong. Name the ticket in matchedIssues.
- severity: "high" if it plausibly moves the release date or blocks other
  work; "medium" if it adds work; "low" otherwise.
- estimateHint: rough range in days, or "decision, not a build", or
  "needs scoping".
- Prefer fewer, sharper findings over exhaustive noise. Cap at 15.

Respond with ONLY a JSON array of objects:
{ "type", "title", "quote", "rationale", "severity", "estimateHint",
  "owner", "blocks", "blocking", "matchedIssues": ["JSA-123", ...] }
No markdown, no preamble.`;

function formatIssue(issue: PromptIssue): string {
  const meta = [
    issue.estimate != null ? `estimate: ${issue.estimate}` : null,
    issue.assignee ? `assignee: ${issue.assignee}` : null,
    issue.labels.length ? `labels: ${issue.labels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const description = issue.description ? issue.description.replace(/\s+/g, " ") : "(no description)";
  return `- ${issue.identifier} [${issue.state}] "${issue.title}"${meta ? ` (${meta})` : ""}\n  ${description}`;
}

function formatPriorFinding(finding: PromptPriorFinding): string {
  return `- [${finding.status}] "${finding.title}"${finding.resolution ? ` -- resolution: ${finding.resolution}` : ""}`;
}

export function buildAuditPrompt(params: {
  issues: PromptIssue[];
  priorFindings: PromptPriorFinding[];
  contextKind: string;
  contextText: string;
}): string {
  const ticketsBlock = params.issues.length
    ? params.issues.map(formatIssue).join("\n")
    : "(no existing tickets)";

  const handledBlock = params.priorFindings.length
    ? params.priorFindings.map(formatPriorFinding).join("\n")
    : "(none)";

  return `${RULES}

(A) EXISTING LINEAR TICKETS:
${ticketsBlock}

(B) PREVIOUSLY HANDLED FINDINGS (do not re-raise these):
${handledBlock}

(C) NEW CONTEXT (${params.contextKind}):
${params.contextText}`;
}
