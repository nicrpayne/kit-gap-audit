import type {
  EvidenceItem,
  IntelligenceObjectItem,
  JsonValue,
  ProjectContextPackage,
} from "@/lib/context/package";
import type { ThreePoint } from "@/lib/scope/features";
import type { WorkItem } from "@/lib/forecast/simulate";

/**
 * A source-attributed, top-down estimate from the accepted knowledge
 * snapshot. This is evidence, not Reality: callers may show it and may let an
 * operator stage it into Scenario, but merely refreshing knowledge must never
 * change the canonical forecast.
 */
export interface CapabilityKnowledgeEstimate {
  id: string;
  contextSnapshotId: string;
  capabilityId: string;
  rawEstimate: string;
  range: ThreePoint | null;
  unit: "developer_days" | "unsupported";
  basis: "remaining_capability";
  speaker: string | null;
  owner: string | null;
  observedAt: string | null;
  sourceRef: string | null;
  excerpt: string | null;
  evidenceRefs: string[];
  statement: string;
  confidence: string | null;
}

/**
 * The durable Scope assertion created when an operator accepts one immutable
 * knowledge estimate as the current remaining-work basis. The source fields
 * are copied deliberately: an accepted Reality assertion must survive the
 * next knowledge snapshot and remain auditable even when Hermes supersedes
 * the source object.
 */
export interface AcceptedCapabilityEstimate extends CapabilityKnowledgeEstimate {
  range: ThreePoint;
  unit: "developer_days";
  acceptedAt: string;
  acceptedBy: "operator";
}

export interface KnowledgeEstimateSubstitution {
  capabilityId: string;
  capabilityName: string;
  estimateId: string;
  range: ThreePoint;
  replacedItemIds: string[];
  authority?: "accepted" | "provisional";
}

export function traceableKnowledgeEstimate(
  estimate: Pick<CapabilityKnowledgeEstimate, "contextSnapshotId" | "sourceRef" | "excerpt" | "evidenceRefs">,
): boolean {
  return Boolean(
    estimate.contextSnapshotId &&
    estimate.sourceRef &&
    estimate.excerpt &&
    estimate.evidenceRefs.length > 0
  );
}

/** Audit passage ids are snapshot-scoped because evidence ids are only
 * guaranteed to be stable inside the immutable context package that carried
 * them. Keeping this grammar here makes Scope's quote link land on the exact
 * node Audit used, rather than a text search that might find a newer quote. */
export function auditPassageHref(
  scopeId: string,
  estimate: Pick<CapabilityKnowledgeEstimate, "contextSnapshotId" | "evidenceRefs">,
): string | null {
  const evidenceId = estimate.evidenceRefs[0];
  if (!scopeId || !estimate.contextSnapshotId || !evidenceId) return null;
  const nodeId = `passage:${estimate.contextSnapshotId}:${evidenceId}`;
  const params = new URLSearchParams({ project: scopeId, select: nodeId });
  return `/audit?${params.toString()}`;
}

/** Replace, never add on top of, the execution rollup for a capability. */
export function substituteCapabilityKnowledgeEstimates<T extends WorkItem>(
  items: T[],
  substitutions: KnowledgeEstimateSubstitution[],
): Array<T | (WorkItem & { estimateSource: "knowledge" })> {
  if (substitutions.length === 0) return items;
  const replaced = new Set(substitutions.flatMap((entry) => entry.replacedItemIds));
  return [
    ...items.filter((item) => !replaced.has(item.id)),
    ...substitutions.map((entry) => ({
      id: `knowledge-estimate:${entry.capabilityId}:${entry.estimateId}`,
      label: `${entry.capabilityName} · ${entry.authority === "accepted" ? "accepted" : "provisional"} meeting estimate`,
      estimateSource: "knowledge" as const,
      ...entry.range,
    })),
  ];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function threePoint(value: unknown): ThreePoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const low = candidate.low;
  const likely = candidate.likely;
  const high = candidate.high;
  if (
    typeof low !== "number" || !Number.isFinite(low) || low <= 0 ||
    typeof likely !== "number" || !Number.isFinite(likely) || likely < low ||
    typeof high !== "number" || !Number.isFinite(high) || high < likely
  ) return null;
  return { low, likely, high };
}

export function acceptCapabilityKnowledgeEstimate(
  estimate: CapabilityKnowledgeEstimate,
  acceptedAt = new Date().toISOString(),
): AcceptedCapabilityEstimate {
  if (!estimate.range || estimate.unit !== "developer_days") {
    throw new Error("Only an explicit developer-day range can become the accepted capability estimate.");
  }
  if (!traceableKnowledgeEstimate(estimate)) {
    throw new Error("A Reality estimate must retain an exact source passage, quote, and immutable snapshot reference.");
  }
  return { ...estimate, range: estimate.range, unit: "developer_days", acceptedAt, acceptedBy: "operator" };
}

/** Fail closed when reading the JSON Reality field. Invalid legacy or manual
 * database content is ignored rather than allowed to alter a forecast. */
export function acceptedCapabilityEstimate(value: unknown): AcceptedCapabilityEstimate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const range = threePoint(candidate.range);
  if (
    !range || candidate.unit !== "developer_days" || candidate.basis !== "remaining_capability" ||
    typeof candidate.id !== "string" || !candidate.id ||
    typeof candidate.contextSnapshotId !== "string" || !candidate.contextSnapshotId ||
    typeof candidate.capabilityId !== "string" || !candidate.capabilityId ||
    typeof candidate.rawEstimate !== "string" || !candidate.rawEstimate ||
    typeof candidate.statement !== "string" || !candidate.statement ||
    !nullableString(candidate.sourceRef) || !nullableString(candidate.excerpt) ||
    stringArray(candidate.evidenceRefs).length === 0 ||
    typeof candidate.acceptedAt !== "string" || !Number.isFinite(Date.parse(candidate.acceptedAt)) ||
    candidate.acceptedBy !== "operator"
  ) return null;
  return {
    id: candidate.id,
    contextSnapshotId: candidate.contextSnapshotId,
    capabilityId: candidate.capabilityId,
    rawEstimate: candidate.rawEstimate,
    range,
    unit: "developer_days",
    basis: "remaining_capability",
    speaker: nullableString(candidate.speaker),
    owner: nullableString(candidate.owner),
    observedAt: nullableString(candidate.observedAt),
    sourceRef: nullableString(candidate.sourceRef),
    excerpt: nullableString(candidate.excerpt),
    evidenceRefs: stringArray(candidate.evidenceRefs),
    statement: candidate.statement,
    confidence: nullableString(candidate.confidence),
    acceptedAt: candidate.acceptedAt,
    acceptedBy: "operator",
  };
}

type CapabilityRef = { id: string; name: string };

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : {};
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstText(fields: Record<string, JsonValue>, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(fields[key]);
    if (value) return value;
  }
  return null;
}

function firstNumber(fields: Record<string, JsonValue>, keys: string[]): number | null {
  for (const key of keys) {
    const value = number(fields[key]);
    if (value !== null) return value;
  }
  return null;
}

function exactCapability(
  object: IntelligenceObjectItem,
  capabilities: CapabilityRef[],
): CapabilityRef | null {
  const fields = record(object.fields);
  const explicitId = firstText(fields, ["capabilityId", "capability_id", "featureId", "feature_id"]);
  if (explicitId) return capabilities.find((candidate) => candidate.id === explicitId) ?? null;

  const explicitName = firstText(fields, [
    "capabilityName", "capability_name", "capability", "featureName", "feature_name", "feature",
  ]);
  if (explicitName) {
    const key = normalized(explicitName);
    return capabilities.find((candidate) => normalized(candidate.name) === key) ?? null;
  }

  // Existing Hermes objects may predate the explicit capability fields. A
  // literal capability-name mention is safe to associate; fuzzy similarity
  // is not. Requiring exactly one match prevents "Notifications" evidence
  // from being guessed onto two similarly named cards.
  const haystack = normalized([
    object.statement,
    firstText(fields, ["action", "note", "significance"]) ?? "",
  ].join(" "));
  const matches = capabilities.filter((candidate) => {
    const needle = normalized(candidate.name);
    return needle.length >= 4 && (` ${haystack} `).includes(` ${needle} `);
  });
  return matches.length === 1 ? matches[0] : null;
}

function estimateText(fields: Record<string, JsonValue>): string | null {
  const explicit = firstText(fields, [
    "duration_stated", "estimate", "estimateRange", "estimate_range", "developerDays", "developer_days", "devDays", "dev_days",
  ]);
  if (explicit) return explicit;
  const low = firstNumber(fields, ["estimateLowDays", "estimate_low_days", "lowDays", "low_days"]);
  const likely = firstNumber(fields, ["estimateLikelyDays", "estimate_likely_days", "likelyDays", "likely_days"]);
  const high = firstNumber(fields, ["estimateHighDays", "estimate_high_days", "highDays", "high_days"]);
  if (low !== null && likely !== null && high !== null) return `${low}–${likely}–${high} developer days`;
  const numeric = firstNumber(fields, ["developerDays", "developer_days", "devDays", "dev_days"]);
  return numeric === null ? null : `${numeric} developer days`;
}

function parseDeveloperDayRange(fields: Record<string, JsonValue>, raw: string): ThreePoint | null {
  const low = firstNumber(fields, ["estimateLowDays", "estimate_low_days", "lowDays", "low_days"]);
  const likely = firstNumber(fields, ["estimateLikelyDays", "estimate_likely_days", "likelyDays", "likely_days"]);
  const high = firstNumber(fields, ["estimateHighDays", "estimate_high_days", "highDays", "high_days"]);
  if (low !== null && likely !== null && high !== null && low <= likely && likely <= high) {
    return { low, likely, high };
  }

  // A verbal range is usable only when its unit is explicit. Sprints and
  // story points are retained as evidence but are not converted: doing so
  // would invent sprint length, staffing, and velocity.
  const unit = /\b(?:developer|dev|engineering)\s*-?\s*days?\b/i;
  if (!unit.test(raw)) return null;
  const three = raw.match(/(\d+(?:\.\d+)?)\s*(?:\/|,|–|—|-)\s*(\d+(?:\.\d+)?)\s*(?:\/|,|–|—|-)\s*(\d+(?:\.\d+)?)/);
  if (three) {
    const values = three.slice(1).map(Number);
    if (values[0] > 0 && values[0] <= values[1] && values[1] <= values[2]) {
      return { low: values[0], likely: values[1], high: values[2] };
    }
  }
  const range = raw.match(/(\d+(?:\.\d+)?)\s*(?:to|–|—|-)\s*(\d+(?:\.\d+)?)/i);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a > 0 && b >= a) return { low: a, likely: (a + b) / 2, high: b };
  }
  return null;
}

function evidenceFor(pkg: ProjectContextPackage, refs: string[]): EvidenceItem | null {
  const byId = new Map(pkg.evidence.map((item) => [item.id, item]));
  for (const ref of refs) {
    const evidence = byId.get(ref);
    if (evidence) return evidence;
  }
  return null;
}

function speakerFor(object: IntelligenceObjectItem, evidence: EvidenceItem | null): string | null {
  const fields = record(object.fields);
  const fromObject = firstText(fields, ["speaker", "speaker_or_actor", "identified_by"]);
  if (fromObject) return fromObject;
  return firstText(record(evidence?.data), ["speaker"]);
}

function observedAtFor(object: IntelligenceObjectItem, evidence: EvidenceItem | null): string | null {
  if (object.observedDate) return object.observedDate;
  return firstText(record(evidence?.data), ["meetingDate", "occurredAt"]);
}

/**
 * Extracts only explicit, current estimate assertions from one immutable
 * knowledge snapshot. It never parses the evidence quote itself and never
 * fuzzily maps a statement to a capability.
 */
export function capabilityKnowledgeEstimates(
  pkg: ProjectContextPackage | null | undefined,
  contextSnapshotId: string | null | undefined,
  capabilities: CapabilityRef[],
): CapabilityKnowledgeEstimate[] {
  if (!pkg || !contextSnapshotId || capabilities.length === 0) return [];
  const estimates: CapabilityKnowledgeEstimate[] = [];
  for (const object of pkg.intelligenceObjects ?? []) {
    if (!object.isCurrent) continue;
    const fields = record(object.fields);
    const rawEstimate = estimateText(fields);
    if (!rawEstimate) continue;
    const capability = exactCapability(object, capabilities);
    if (!capability) continue;
    const refs = object.evidenceRefs ?? [];
    const evidence = evidenceFor(pkg, refs);
    const range = parseDeveloperDayRange(fields, rawEstimate);
    estimates.push({
      id: object.id,
      contextSnapshotId,
      capabilityId: capability.id,
      rawEstimate,
      range,
      unit: range ? "developer_days" : "unsupported",
      basis: "remaining_capability",
      speaker: speakerFor(object, evidence),
      owner: firstText(fields, ["owner", "person", "person_or_team"]),
      observedAt: observedAtFor(object, evidence),
      sourceRef: evidence?.sourceRef ?? null,
      excerpt: evidence?.excerpt ?? null,
      evidenceRefs: refs,
      statement: object.statement,
      confidence: firstText(record(object.provenance), ["confidence"]),
    });
  }

  return estimates.sort((a, b) => {
    const at = a.observedAt ? Date.parse(a.observedAt) : 0;
    const bt = b.observedAt ? Date.parse(b.observedAt) : 0;
    return bt - at || a.id.localeCompare(b.id);
  });
}
