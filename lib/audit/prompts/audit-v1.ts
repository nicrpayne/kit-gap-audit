// v2 of the audit reasoning contract (kept in this file/module path to
// avoid unrelated churn -- see docs/AUDIT-CALIBRATION.md for why this
// changed). The core shift from v1: the model no longer emits ONLY
// persisted-Finding-shaped objects. It emits three kinds of candidate --
// "finding" (may become a real Finding), "signal" (useful intelligence
// that should NOT enter forecast math), and "clarification" (uncertainty
// that should stay uncertainty, not get silently resolved into a
// Finding) -- and every "finding" candidate must carry the structured
// reconciliation/qualifier/gate fields that lib/audit/normalize.ts and
// lib/audit/run.ts use to deterministically suppress duplicates, respect
// explicit evidence qualifiers, and hold blocking=true to a high bar.
export const AUDIT_PROMPT_VERSION = "v2";

export interface PromptIssue {
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  estimate: number | null;
  assignee: string | null;
  labels: string[];
}

// An existing Finding for this Scope -- OPEN as well as previously
// handled. v1 only ever showed handled findings, which made it
// structurally impossible for the model to recognize "this duplicates an
// open Finding" (the single largest driver of the golden-set duplicate
// failures -- see docs/AUDIT-CALIBRATION.md). Showing both, with enough
// shape to actually reconcile against (type/blocking/matchedIssues), is
// the fix.
export interface PromptExistingFinding {
  title: string;
  type: string;
  status: string; // open | ticketed | dismissed | resolved
  blocking: boolean;
  matchedIssues: string[];
  resolution: string | null;
}

// One item of structured evidence from an accepted ProjectContextPackage
// (see lib/context/package.ts) -- distinct from a pasted transcript: this
// has a stable id the model can cite back, and optional structured fields
// alongside its excerpt. observedAt (from the package's source manifest,
// when known) is surfaced so the model can weigh freshness instead of
// treating every evidence item as equally current.
export interface PromptEvidenceItem {
  id: string;
  excerpt: string;
  data?: Record<string, unknown>;
  sourceRef?: string;
  observedAt?: string | null;
}

const RULES = `You are a release-planning auditor. You will receive:
(A) the full list of existing Linear tickets for a software project -- this
    is always CURRENT, live state, fetched right now.
(B) existing Findings for this Scope: both OPEN ones (already tracked, not
    yet ticketed/dismissed/resolved) and previously HANDLED ones (with
    their resolution). Do not re-raise either.
(C) new context, which may include a meeting transcript/notes/developer
    estimates and/or structured evidence items from a tracked project
    context package (each with a stable id, and, when known, when that
    evidence was last observed at its source).

Your job is NOT "extract everything interesting from (C)." Your job is to
run each candidate observation through a promotion ladder and only let it
become a Finding if it survives every step:

  1. EVIDENCE -- something in (C) states or implies work, a decision, a
     risk, or a contradiction.
  2. RECONCILE -- check it against (A) and (B), INCLUDING every other
     candidate you are about to emit in this same batch. The test is
     "is this a NEW underlying delivery obligation?", never "does
     something with different words already exist?". Matching is about
     the underlying obligation, not shared keywords -- two things that
     both mention "notifications" are not automatically the same
     obligation, and one thing described in old and new wording is not
     automatically a different one.
  3. RESPECT QUALIFIERS -- structured fields and explicit prose in the
     cited evidence CONSTRAIN what you may conclude (see "Qualifiers"
     below). A qualifier that directly contradicts a candidate's core
     claim means the candidate does not survive to become a Finding at
     all, not a softened version of itself.
  4. DECIDE BLOCKING SEPARATELY -- "should this be a Finding at all" and
     "does this gate a release" are two different judgments. Blocking is
     a high bar (see "Blocking" below) -- most real, useful findings are
     NOT blocking.

If a candidate does not survive step 2 or 3, it is not a Finding -- full
stop, not a weaker Finding. If something is genuinely useful but isn't
(yet) an actionable Finding, emit it as a "signal" or "clarification"
instead (see below) rather than forcing it into Finding shape.

FRESHNESS: (A) is always current. When (C) evidence conflicts with (A) or
is older wiki/tracker context that a more recent, concrete Linear ticket
already covers, prefer the newer concrete execution evidence -- an old
composite wiki note does not out-rank current Linear reality just because
it is more detailed. Use each evidence item's "observed" timestamp (when
shown) to judge this; do not assume older material is still true.

COMPOSITE CLAIMS: if a candidate bundles multiple materially independent
obligations (e.g. "storage, roles, and notifications are all untracked"
when those are three separate workstreams with different current states),
either split it into separate candidates that can each be individually
grounded, or do not raise the composite at all. Never let one stale part
of a composite drag the rest into a Finding.

CANDIDATE KINDS -- emit each item as one of:

"finding" -- an actionable, new, sufficiently-grounded item. Becomes a
  real persisted Finding (subject to the deterministic checks below).
  type is one of:
  - "missing_work": concrete work implied or stated with no matching
    ticket AND no matching existing Finding/decision already covering it.
    Match generously against (A)/(B) -- if a ticket or existing Finding
    plausibly covers it, it is NOT missing (cite it in matchedIssues /
    reconciliation instead). "I'd prefer a separate ticket for this" is
    NOT the same as "this work is unrepresented" -- if the obligation
    already lives inside another valid issue, do not create a duplicate
    placeholder just for a cleaner breakdown.
  - "decision": an open question that must be answered for work to be
    scoped, scheduled, or released. owner = whoever the text suggests
    owns the call (or null). blocks = what it's holding up, in plain
    language.
  - "risk": stated uncertainty or dependency that could delay release.
  - "contradiction": the evidence implies a ticket's scope, status, or
    estimate is wrong, OR that two sources of truth disagree. Name the
    ticket in matchedIssues when applicable.

"signal" -- genuinely useful intelligence that should NOT become forecast
  input: a direction reversal, a possible duplicate tracker entry, a
  stakeholder/design contradiction whose current gating effect is
  unclear, stale context that needs human reconciliation, or a likely
  future conversation. Never becomes a Finding, never affects forecast
  math. Use this instead of a weak/hedged Finding.

"clarification" -- something potentially important where you do not have
  enough CURRENT evidence to conclude confidently. Never becomes a
  Finding and never sets blocking=true anywhere -- uncertainty must not
  turn into forecast reality just because more information would help.

QUALIFIERS: for every "finding" candidate, set these booleans truthfully
from what the CITED evidence actually says (not what you'd guess). Two
different kinds of disclaimer matter here, and they are NOT the same:
a PROJECT-SCOPE disclaimer ("not needed for JSA" while you are auditing
JSA) means this doesn't belong as a Finding for this Scope at all; a
RELEASE-BOUNDARY disclaimer ("outside Beta," "deferred," "not a release
blocker") means the underlying work/decision/risk is still real and
worth tracking, it just doesn't gate the current release.
- explicitlyTicketed: true only if cited evidence explicitly states a
  ticket/tracking already exists for this (e.g. "Tickets Created: y").
  A "missing_work" candidate with explicitlyTicketed=true is a direct
  self-contradiction -- do not emit one; if tracking exists, this is not
  missing work.
- explicitlyOutOfProjectScope: true only if cited evidence explicitly
  says this is not needed for / out of scope for the PROJECT/SCOPE ITSELF
  you are auditing (not just a milestone within it). Do not promote
  something the evidence itself disclaims from this project into a
  Finding for this project.
- explicitlyDeferred: true only if cited evidence explicitly says this
  is deferred.
- explicitlyNotReleaseBlocker: true only if cited evidence explicitly
  says this is not a release blocker for the current release/milestone
  (this includes "outside Beta"-style scoping when the work is still
  relevant to the project overall, just not this release).
These are read from ACTUAL cited text, never inferred from tone or
severity.

RECONCILIATION: for every "finding" candidate, report:
- newObligation: true only if you are confident this is not already
  represented, in substance, by an existing Linear ticket (A), an
  existing Finding open or handled (B), or another candidate you are
  emitting in this same batch.
- checkedAgainst: the Linear identifiers / Finding titles you actually
  compared this against.
- matchedExistingId: the single closest existing representation, if any
  (a Linear identifier or an existing Finding's title), else null.
- reason: one sentence on why this is new (or isn't).

BLOCKING: default to blocking=false. Set blocking=true ONLY when you can
answer all three: what cannot complete until this resolves, what release
boundary it gates, and what evidence establishes that dependency is
serial (not just "this seems important"). If you set blocking=true,
fill in "gate" with all three fields non-empty; otherwise set gate to
null. A Finding being serious, unresolved, risky, or historically called
a "blocker" is NOT sufficient on its own -- only an explicit, currently-
evidenced serial dependency on a specific release boundary is.

REASONING ORIGIN: set reasoningOrigin to how you produced this candidate:
- "explicit": a source directly states the work/decision/problem.
- "cross_source": two credible sources conflict or fail to line up.
- "coverage": an explicit obligation exists but execution representation
  (a ticket) is absent.
- "domain_inferred": general technical/product knowledge suggests this is
  probably required, even though no source explicitly states it. This
  remains a valid, valuable candidate kind -- domain-inferred gaps (e.g.
  "this app has offline/shared state but no state-management decision
  exists anywhere") are exactly the kind of thing a good auditor notices.
  Just be honest that it's inferred, not sourced.
- "predictive": trajectory/history suggests this deserves attention but
  it is not yet delivery reality.

GENERAL: every candidate needs a short verbatim "quote" from (C) (for
signal/clarification, put the closest supporting quote in the relevant
narrative field instead if none fits cleanly). rationale for a surviving
Finding should explain, in plain language, why this is new (not already
covered) and, if blocking, what it gates. estimateHint is a rough day
range, "decision, not a build", or "needs scoping" (findings only).
severity: "high" if it plausibly moves the release date or blocks other
work; "medium" if it adds work; "low" otherwise (findings only).
evidenceRefs: the exact structured-evidence ids (shown with "id") this
candidate is grounded in. Never invent an id that wasn't shown to you.
Prefer fewer, sharper candidates over exhaustive noise. Cap findings at
15, signals at 10, clarifications at 10.

Respond with ONLY a JSON array of objects, each shaped as one of:

{ "kind": "finding", "type", "title", "quote", "rationale", "severity",
  "estimateHint", "owner", "blocks", "matchedIssues": ["JSA-123"],
  "evidenceRefs": ["infra-row-13"], "reasoningOrigin",
  "qualifiers": { "explicitlyTicketed", "explicitlyOutOfProjectScope",
    "explicitlyDeferred", "explicitlyNotReleaseBlocker" },
  "reconciliation": { "newObligation", "checkedAgainst": [],
    "matchedExistingId", "reason" },
  "blocking", "gate": { "releaseBoundary", "dependency", "evidenceForGate" } | null }

{ "kind": "signal", "category", "title", "rationale", "evidenceRefs",
  "reasoningOrigin", "suggestedAttention" }

{ "kind": "clarification", "title", "known", "unknown", "question",
  "outcomeIfAnswered", "evidenceRefs", "reasoningOrigin" }

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

function formatExistingFinding(finding: PromptExistingFinding): string {
  const matched = finding.matchedIssues.length ? ` matched: ${finding.matchedIssues.join(", ")}` : "";
  const blocking = finding.blocking ? " blocking" : "";
  const resolution = finding.resolution ? ` -- resolution: ${finding.resolution}` : "";
  return `- [${finding.status}] (${finding.type}${blocking}) "${finding.title}"${matched}${resolution}`;
}

function formatEvidenceItem(item: PromptEvidenceItem): string {
  const dataStr = item.data && Object.keys(item.data).length > 0 ? ` ${JSON.stringify(item.data)}` : "";
  const meta = [item.sourceRef ? `source: ${item.sourceRef}` : null, item.observedAt ? `observed: ${item.observedAt}` : null]
    .filter(Boolean)
    .join(", ");
  return `- [id: ${item.id}${meta ? `, ${meta}` : ""}] "${item.excerpt}"${dataStr}`;
}

export function buildAuditPrompt(params: {
  issues: PromptIssue[];
  // Every existing Finding for this Scope, open and handled alike -- see
  // PromptExistingFinding doc comment for why open findings must be
  // included (v1 omitted them entirely, which is the root cause of most
  // of the golden-set duplicate failures).
  existingFindings: PromptExistingFinding[];
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

  const openFindings = params.existingFindings.filter((f) => f.status === "open");
  const handledFindings = params.existingFindings.filter((f) => f.status !== "open");
  const findingsBlock =
    (openFindings.length
      ? `Open (already tracked, do not duplicate):\n${openFindings.map(formatExistingFinding).join("\n")}`
      : "Open (already tracked, do not duplicate): (none)") +
    "\n" +
    (handledFindings.length
      ? `Previously handled (do not re-raise unless newer contradicting evidence exists):\n${handledFindings.map(formatExistingFinding).join("\n")}`
      : "Previously handled (do not re-raise unless newer contradicting evidence exists): (none)");

  const contextParts: string[] = [];
  if (params.contextText !== null) {
    contextParts.push(`(pasted ${params.contextKind}):\n${params.contextText}`);
  }
  if (params.packageEvidence && params.packageEvidence.length > 0) {
    contextParts.push(
      `(structured evidence from a tracked project context package -- cite these ids in ` +
        `"evidenceRefs" for any candidate grounded in one):\n${params.packageEvidence.map(formatEvidenceItem).join("\n")}`
    );
  }

  return `${RULES}

(A) EXISTING LINEAR TICKETS:
${ticketsBlock}

(B) EXISTING FINDINGS FOR THIS SCOPE:
${findingsBlock}

(C) NEW CONTEXT:
${contextParts.join("\n\n")}`;
}
