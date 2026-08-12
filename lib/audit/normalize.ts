export type FindingType = "missing_work" | "decision" | "risk" | "contradiction";
export type Severity = "high" | "medium" | "low";

// How a candidate was produced -- see docs/AUDIT-CALIBRATION.md. Kept
// distinguishable ("inferred from domain knowledge" vs "explicitly
// required by project evidence") without a schema model per candidate:
// it is validated here and persisted as a prefix on Finding.rationale by
// lib/audit/run.ts (see ORIGIN_TAG below), never as a separate column.
export type ReasoningOrigin = "explicit" | "cross_source" | "coverage" | "domain_inferred" | "predictive";

const VALID_ORIGINS = new Set<ReasoningOrigin>([
  "explicit",
  "cross_source",
  "coverage",
  "domain_inferred",
  "predictive",
]);

export interface FindingQualifiers {
  explicitlyTicketed: boolean;
  // Evidence explicitly says this is not needed for / out of scope for the
  // PROJECT/SCOPE ITSELF (e.g. "not needed for JSA," where JSA is the
  // Scope being audited) -- a scope-relevance disclaimer. Distinct from
  // the two below, which disclaim only a specific release/milestone
  // WITHIN an otherwise-relevant scope (e.g. "outside Beta," "deferred").
  // See lib/audit/run.ts's qualifierContradiction/resolveBlocking for how
  // each is applied.
  explicitlyOutOfProjectScope: boolean;
  explicitlyDeferred: boolean;
  explicitlyNotReleaseBlocker: boolean;
}

export interface FindingReconciliation {
  newObligation: boolean;
  checkedAgainst: string[];
  matchedExistingId: string | null;
  reason: string | null;
}

export interface FindingGate {
  releaseBoundary: string;
  dependency: string;
  evidenceForGate: string;
}

export interface NormalizedFinding {
  kind: "finding";
  type: FindingType;
  title: string;
  quote: string;
  rationale: string;
  severity: Severity;
  estimateHint: string | null;
  owner: string | null;
  blocks: string | null;
  // The model's OWN requested value -- lib/audit/run.ts is what actually
  // decides the persisted value, by additionally requiring `gate` to be
  // fully populated and no disqualifying qualifier to be set. Never
  // trusted directly.
  blockingRequested: boolean;
  gate: FindingGate | null;
  matchedIssues: string[];
  evidenceRefs: string[];
  reasoningOrigin: ReasoningOrigin;
  qualifiers: FindingQualifiers;
  reconciliation: FindingReconciliation;
}

export interface NormalizedSignal {
  kind: "signal";
  category: string;
  title: string;
  rationale: string;
  evidenceRefs: string[];
  reasoningOrigin: ReasoningOrigin;
  suggestedAttention: string | null;
}

export interface NormalizedClarification {
  kind: "clarification";
  title: string;
  known: string | null;
  unknown: string | null;
  question: string;
  outcomeIfAnswered: string | null;
  evidenceRefs: string[];
  reasoningOrigin: ReasoningOrigin;
}

export interface NormalizedAuditOutput {
  findings: NormalizedFinding[];
  signals: NormalizedSignal[];
  clarifications: NormalizedClarification[];
}

const VALID_TYPES = new Set<FindingType>(["missing_work", "decision", "risk", "contradiction"]);
const VALID_SEVERITIES = new Set<Severity>(["high", "medium", "low"]);

const MAX_FINDINGS = 15;
const MAX_SIGNALS = 10;
const MAX_CLARIFICATIONS = 10;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function bool(value: unknown): boolean {
  return value === true;
}

function origin(value: unknown): ReasoningOrigin {
  const s = str(value);
  return s && VALID_ORIGINS.has(s as ReasoningOrigin) ? (s as ReasoningOrigin) : "explicit";
}

function parseQualifiers(raw: unknown): FindingQualifiers {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    explicitlyTicketed: bool(r.explicitlyTicketed),
    explicitlyOutOfProjectScope: bool(r.explicitlyOutOfProjectScope),
    explicitlyDeferred: bool(r.explicitlyDeferred),
    explicitlyNotReleaseBlocker: bool(r.explicitlyNotReleaseBlocker),
  };
}

function parseReconciliation(raw: unknown): FindingReconciliation {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    // Defaults to NOT-new when the model omits this entirely -- a missing
    // reconciliation judgment must never default into "safe to persist."
    newObligation: r.newObligation === true,
    checkedAgainst: strArray(r.checkedAgainst),
    matchedExistingId: str(r.matchedExistingId),
    reason: str(r.reason),
  };
}

function parseGate(raw: unknown): FindingGate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const releaseBoundary = str(r.releaseBoundary);
  const dependency = str(r.dependency);
  const evidenceForGate = str(r.evidenceForGate);
  if (!releaseBoundary || !dependency || !evidenceForGate) return null;
  return { releaseBoundary, dependency, evidenceForGate };
}

function parseFinding(r: Record<string, unknown>): NormalizedFinding | null {
  const type = str(r.type);
  const title = str(r.title);
  const quote = str(r.quote);
  const rationale = str(r.rationale);
  if (!type || !VALID_TYPES.has(type as FindingType) || !title || !quote || !rationale) return null;

  const severityRaw = str(r.severity);
  const severity: Severity =
    severityRaw && VALID_SEVERITIES.has(severityRaw as Severity) ? (severityRaw as Severity) : "medium";

  return {
    kind: "finding",
    type: type as FindingType,
    title,
    quote,
    rationale,
    severity,
    estimateHint: str(r.estimateHint),
    owner: str(r.owner),
    blocks: str(r.blocks),
    blockingRequested: bool(r.blocking),
    gate: parseGate(r.gate),
    matchedIssues: strArray(r.matchedIssues),
    evidenceRefs: strArray(r.evidenceRefs),
    reasoningOrigin: origin(r.reasoningOrigin),
    qualifiers: parseQualifiers(r.qualifiers),
    reconciliation: parseReconciliation(r.reconciliation),
  };
}

function parseSignal(r: Record<string, unknown>): NormalizedSignal | null {
  const title = str(r.title);
  const rationale = str(r.rationale);
  const category = str(r.category);
  if (!title || !rationale || !category) return null;
  return {
    kind: "signal",
    category,
    title,
    rationale,
    evidenceRefs: strArray(r.evidenceRefs),
    reasoningOrigin: origin(r.reasoningOrigin),
    suggestedAttention: str(r.suggestedAttention),
  };
}

function parseClarification(r: Record<string, unknown>): NormalizedClarification | null {
  const title = str(r.title);
  const question = str(r.question);
  if (!title || !question) return null;
  return {
    kind: "clarification",
    title,
    known: str(r.known),
    unknown: str(r.unknown),
    question,
    outcomeIfAnswered: str(r.outcomeIfAnswered),
    evidenceRefs: strArray(r.evidenceRefs),
    reasoningOrigin: origin(r.reasoningOrigin),
  };
}

// Defensive parsing of the model's raw JSON: coerce what's plausible, drop
// any candidate missing required fields or of an unrecognized kind rather
// than failing the whole run. Deliberately does NOT decide persistence --
// that's lib/audit/run.ts's job, applying the deterministic guardrails
// (qualifier contradiction, reconciliation, blocking/gate) on top of what
// this function returns.
export function normalizeAuditOutput(raw: unknown): NormalizedAuditOutput {
  if (!Array.isArray(raw)) {
    throw new Error("Expected the model to return a JSON array of candidates");
  }

  const findings: NormalizedFinding[] = [];
  const signals: NormalizedSignal[] = [];
  const clarifications: NormalizedClarification[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const kind = str(r.kind) ?? "finding"; // legacy/unlabeled items default to finding shape

    if (kind === "signal") {
      const parsed = parseSignal(r);
      if (parsed) signals.push(parsed);
    } else if (kind === "clarification") {
      const parsed = parseClarification(r);
      if (parsed) clarifications.push(parsed);
    } else {
      const parsed = parseFinding(r);
      if (parsed) findings.push(parsed);
    }
  }

  return {
    findings: findings.slice(0, MAX_FINDINGS),
    signals: signals.slice(0, MAX_SIGNALS),
    clarifications: clarifications.slice(0, MAX_CLARIFICATIONS),
  };
}
