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

// One item of structured evidence from an accepted ProjectContextPackage
// (see lib/context/package.ts) -- distinct from a pasted transcript: this
// has a stable id the model can cite back, and optional structured fields
// alongside its excerpt.
export interface PromptEvidenceItem {
  id: string;
  excerpt: string;
  data?: Record<string, unknown>;
}

const RULES = `You are a release-planning auditor. You will receive:
(A) the full list of existing Linear tickets for a software project,
(B) previously handled findings with their resolutions (do not re-raise), and
(C) new context, which may include a meeting transcript/notes/developer
    estimates and/or structured evidence items from a tracked project
    context package (each with a stable id).

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
- If a finding is grounded in one or more STRUCTURED EVIDENCE items (each
  shown with an "id"), set "evidenceRefs" to the array of exactly those
  ids. If it's grounded only in a transcript/notes paragraph with no
  structured evidence item behind it, omit "evidenceRefs" or leave it [].
  Never invent an id that wasn't shown to you.
- Prefer fewer, sharper findings over exhaustive noise. Cap at 15.

Respond with ONLY a JSON array of objects:
{ "type", "title", "quote", "rationale", "severity", "estimateHint",
  "owner", "blocks", "blocking", "matchedIssues": ["JSA-123", ...],
  "evidenceRefs": ["infra-row-13", ...] }
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

function formatEvidenceItem(item: PromptEvidenceItem): string {
  const dataStr = item.data && Object.keys(item.data).length > 0 ? ` ${JSON.stringify(item.data)}` : "";
  return `- [id: ${item.id}] "${item.excerpt}"${dataStr}`;
}

export function buildAuditPrompt(params: {
  issues: PromptIssue[];
  priorFindings: PromptPriorFinding[];
  // Pasted transcript/notes/spreadsheet text, when one was provided. Null
  // when this audit run is driven only by package evidence.
  contextKind: string | null;
  contextText: string | null;
  // Structured evidence from an accepted ProjectContextPackage, when one
  // was provided. Rendered as its own block, never flattened into
  // contextText, so the model sees (and can cite back) each item's own id.
  packageEvidence?: PromptEvidenceItem[];
}): string {
  const ticketsBlock = params.issues.length
    ? params.issues.map(formatIssue).join("\n")
    : "(no existing tickets)";

  const handledBlock = params.priorFindings.length
    ? params.priorFindings.map(formatPriorFinding).join("\n")
    : "(none)";

  const contextParts: string[] = [];
  if (params.contextText !== null) {
    contextParts.push(`(pasted ${params.contextKind}):\n${params.contextText}`);
  }
  if (params.packageEvidence && params.packageEvidence.length > 0) {
    contextParts.push(
      `(structured evidence from a tracked project context package -- cite these ids in ` +
        `"evidenceRefs" for any finding grounded in one):\n${params.packageEvidence.map(formatEvidenceItem).join("\n")}`
    );
  }

  return `${RULES}

(A) EXISTING LINEAR TICKETS:
${ticketsBlock}

(B) PREVIOUSLY HANDLED FINDINGS (do not re-raise these):
${handledBlock}

(C) NEW CONTEXT:
${contextParts.join("\n\n")}`;
}
