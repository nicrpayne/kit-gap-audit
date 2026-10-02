import {
  readRelationField,
  type EvidenceItem,
  type IntelligenceObjectItem,
  type JsonValue,
  type ProjectContextPackage,
} from "@/lib/context/package";
import type { ThreePoint } from "@/lib/scope/features";
import type { WorkItem } from "@/lib/forecast/simulate";

export type RawEstimateUnit = "developer_days" | "elapsed_days" | "sprints" | "story_points" | "unknown";
export type RawEstimateShape = "single" | "bounds" | "three_point" | "unstructured";
export type EstimatePointOrigin = "verbatim" | "operator";
export type EstimateSourceWorkMeaning = "remaining" | "total" | "unknown";
export type EstimateSourceCurrentness = "current" | "historical" | "unknown";

export interface KnowledgeEstimateObjectRef {
  contextSnapshotId: string;
  intelligenceObjectId: string;
}

export interface KnowledgeEstimatePassage {
  id: string;
  sourceRef: string;
  exactQuote: string;
  externalRef: string | null;
  sourceUrl: string | null;
  surroundingContext: string | null;
}

/** An immutable source assertion. It is evidence until a person reviews the
 * interpretation and the exact open-work boundary. */
export interface CapabilityKnowledgeEstimate {
  id: string;
  contextSnapshotId: string;
  capabilityId: string;
  rawEstimate: string;
  rawUnit: RawEstimateUnit;
  rawValues: number[];
  rawShape: RawEstimateShape;
  sourceWorkMeaning: EstimateSourceWorkMeaning;
  currentness: EstimateSourceCurrentness;
  supersedes: KnowledgeEstimateObjectRef[];
  supersededBy: KnowledgeEstimateObjectRef[];
  passages: KnowledgeEstimatePassage[];
  /** Present only for an explicit three-point developer-day source shape.
   * Bounds deliberately remain bounds; no midpoint is invented. */
  range: ThreePoint | null;
  /** Compatibility display field. It is not permission to use the number. */
  unit: "developer_days" | "unsupported";
  basis: "remaining_capability" | "review_required";
  speaker: string | null;
  owner: string | null;
  observedAt: string | null;
  sourceRef: string | null;
  excerpt: string | null;
  evidenceRefs: string[];
  statement: string;
  confidence: string | null;
  sourceLocator?: { externalRef: string | null; sourceUrl: string | null; surroundingContext: string | null };
}

/** Legacy unversioned accepted JSON remains readable, but cannot be a
 * publishable basis because it has no reviewed interpretation or boundary. */
export interface AcceptedCapabilityEstimateV1 {
  version?: never;
  id: string;
  contextSnapshotId: string;
  capabilityId: string;
  rawEstimate: string;
  range: ThreePoint;
  unit: "developer_days";
  basis: "remaining_capability";
  speaker: string | null;
  owner: string | null;
  observedAt: string | null;
  sourceRef: string | null;
  excerpt: string | null;
  evidenceRefs: string[];
  statement: string;
  confidence: string | null;
  sourceLocator?: { externalRef: string | null; sourceUrl: string | null; surroundingContext: string | null };
  acceptedAt: string;
  acceptedBy: "operator";
}

export interface AcceptedCapabilityEstimateV2 {
  version: "accepted-capability-estimate.v2";
  source: {
    contextSnapshotId: string;
    intelligenceObjectId: string;
    passageId: string;
    sourceRef: string;
    exactQuote: string;
    surroundingContext: string | null;
    externalRef: string | null;
    sourceUrl: string | null;
    statement: string;
    rawEstimateText: string;
    rawUnit: RawEstimateUnit;
    rawValues: number[];
    rawShape: RawEstimateShape;
    /** Structured source meaning at review time. Optional only for early v2
     * fixtures written before this drift field was added. */
    declaredWorkMeaningAtReview?: EstimateSourceWorkMeaning;
    speaker: string | null;
    observedAt: string | null;
    currentnessAtReview: EstimateSourceCurrentness;
    supersedes: KnowledgeEstimateObjectRef[];
    supersededBy: KnowledgeEstimateObjectRef[];
  };
  interpretation: {
    sourceWorkMeaning: Exclude<EstimateSourceWorkMeaning, "unknown">;
    modeledBasis: "remaining_capability";
    modeledUnit: "developer_days";
    range: ThreePoint;
    rangeOrigin: { low: EstimatePointOrigin; likely: EstimatePointOrigin; high: EstimatePointOrigin };
    rationale: string;
    quoteSupportsInterpretation: true;
    policy: {
      progress: "manual_remaining_no_status_discount.v1";
      capacity: "pooled_effective_fte.v1";
      calendar: "calendar_days.v1";
    };
  };
  boundary: {
    capabilityId: string;
    capabilityRevisionAtReview: number;
    coveredOpenItemIds: string[];
    additionalOpenItemIds: string[];
    reviewedLinkFingerprint: string;
    reviewedAt: string;
    /** Required when the reviewed open boundary is empty. */
    boundaryStatement: string | null;
  };
  acceptance: {
    acceptedAt: string;
    /** displayName is an operator-supplied audit label, not authenticated identity. */
    reviewer: { id: string | null; displayName: string };
  };
}

export type AcceptedCapabilityEstimate = AcceptedCapabilityEstimateV1 | AcceptedCapabilityEstimateV2;

export function isAcceptedCapabilityEstimateV2(value: unknown): value is AcceptedCapabilityEstimateV2 {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (value as { version?: unknown }).version === "accepted-capability-estimate.v2");
}

export interface EstimateReviewInput {
  passageId: string;
  sourceWorkMeaning: "remaining" | "total";
  range: ThreePoint;
  rangeOrigin: { low: EstimatePointOrigin; likely: EstimatePointOrigin; high: EstimatePointOrigin };
  rationale: string;
  quoteSupportsInterpretation: boolean;
  coveredOpenItemIds: string[];
  additionalOpenItemIds: string[];
  boundaryStatement?: string | null;
  reviewerDisplayName: string;
}

export interface EstimateReviewContext {
  capabilityRevisionAtReview: number;
  currentOpenItemIds: string[];
  reviewedAt?: string;
  acceptedAt?: string;
}

export type ReviewedCapabilityEstimateResult =
  | {
      status: "reviewed";
      estimate: AcceptedCapabilityEstimateV2;
      range: ThreePoint;
      coveredItemIds: string[];
      additionalItemIds: string[];
      publishable: true;
    }
  | {
      status: "review_required";
      /** Null only when a persisted non-null assertion cannot be parsed.
       * That state must still block publication without inventing a range. */
      estimate: AcceptedCapabilityEstimate | null;
      publishable: false;
      reviewRequiredReason: string;
      invalidStoredAssertion?: true;
      /** Only v2 has a reviewed boundary that can be carried as explicitly
       * qualified exploration. Legacy falls back to ticket rollup. */
      exploration?: {
        range: ThreePoint;
        coveredItemIds: string[];
        additionalItemIds: string[];
      };
    }
  | null;

export interface KnowledgeEstimateSubstitution {
  capabilityId: string;
  capabilityName: string;
  estimateId: string;
  contextSnapshotId?: string;
  range: ThreePoint;
  replacedItemIds: string[];
  authority?: "accepted" | "provisional" | "reviewed" | "review_required";
}

export function knowledgeEstimateItemId(capabilityId: string, estimateId: string, contextSnapshotId?: string): string {
  return contextSnapshotId
    ? `knowledge-estimate:${encodeURIComponent(capabilityId)}:${encodeURIComponent(contextSnapshotId)}:${encodeURIComponent(estimateId)}`
    : `knowledge-estimate:${capabilityId}:${estimateId}`;
}

export function acceptedEstimateIdentity(estimate: AcceptedCapabilityEstimate): {
  estimateId: string;
  contextSnapshotId: string;
  capabilityId: string;
  passageId: string;
} {
  return isAcceptedCapabilityEstimateV2(estimate)
    ? {
        estimateId: estimate.source.intelligenceObjectId,
        contextSnapshotId: estimate.source.contextSnapshotId,
        capabilityId: estimate.boundary.capabilityId,
        passageId: estimate.source.passageId,
      }
    : {
        estimateId: estimate.id,
        contextSnapshotId: estimate.contextSnapshotId,
        capabilityId: estimate.capabilityId,
        passageId: estimate.evidenceRefs[0],
      };
}

export function traceableKnowledgeEstimate(
  estimate: Pick<CapabilityKnowledgeEstimate, "contextSnapshotId" | "sourceRef" | "excerpt" | "evidenceRefs" | "passages">,
): boolean {
  return Boolean(
    estimate.contextSnapshotId && estimate.sourceRef && estimate.excerpt &&
    estimate.evidenceRefs.length > 0 && estimate.passages.some((passage) => passage.exactQuote.trim()),
  );
}

export function auditPassageHref(
  scopeId: string,
  estimate: CapabilityKnowledgeEstimate | AcceptedCapabilityEstimate,
): string | null {
  const identity = isAcceptedCapabilityEstimateV2(estimate)
    ? { contextSnapshotId: estimate.source.contextSnapshotId, passageId: estimate.source.passageId }
    : "acceptedAt" in estimate
      ? { contextSnapshotId: estimate.contextSnapshotId, passageId: estimate.evidenceRefs[0] }
      : { contextSnapshotId: estimate.contextSnapshotId, passageId: estimate.passages[0]?.id ?? estimate.evidenceRefs[0] };
  if (!scopeId || !identity.contextSnapshotId || !identity.passageId) return null;
  const nodeId = `passage:${identity.contextSnapshotId}:${identity.passageId}`;
  const params = new URLSearchParams({ project: scopeId, select: nodeId });
  return `/audit?${params.toString()}`;
}

/** Replace, never add on top of, the explicitly covered execution items. */
export function substituteCapabilityKnowledgeEstimates<T extends WorkItem>(
  items: T[],
  substitutions: KnowledgeEstimateSubstitution[],
): Array<T | (WorkItem & { estimateSource: "knowledge" })> {
  if (substitutions.length === 0) return items;
  const replaced = new Set(substitutions.flatMap((entry) => entry.replacedItemIds));
  const labelFor = (entry: KnowledgeEstimateSubstitution) => {
    if (entry.authority === "reviewed") return `${entry.capabilityName} · reviewed remaining-work estimate`;
    if (entry.authority === "review_required") return `${entry.capabilityName} · qualified estimate exploration`;
    return `${entry.capabilityName} · ${entry.authority === "accepted" ? "accepted" : "provisional"} meeting estimate`;
  };
  return [
    ...items.filter((item) => !replaced.has(item.id)),
    ...substitutions.map((entry) => ({
      id: knowledgeEstimateItemId(entry.capabilityId, entry.estimateId, entry.contextSnapshotId),
      label: labelFor(entry),
      estimateSource: "knowledge" as const,
      ...entry.range,
    })),
  ];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function canonicalIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))].sort()
    : [];
}

function inputIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be a list of work item IDs.`);
  }
  const canonical = canonicalIds(value);
  if (canonical.length !== value.length) throw new Error(`${label} must not contain duplicate work item IDs.`);
  return canonical;
}

function threePoint(value: unknown): ThreePoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const { low, likely, high } = candidate;
  if (
    typeof low !== "number" || !Number.isFinite(low) || low <= 0 ||
    typeof likely !== "number" || !Number.isFinite(likely) || likely < low ||
    typeof high !== "number" || !Number.isFinite(high) || high < likely
  ) return null;
  return { low, likely, high };
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function objectRefs(value: unknown): KnowledgeEstimateObjectRef[] | null {
  if (!Array.isArray(value)) return null;
  const refs: KnowledgeEstimateObjectRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (!nullableString(row.contextSnapshotId) || !nullableString(row.intelligenceObjectId)) return null;
    refs.push({ contextSnapshotId: row.contextSnapshotId as string, intelligenceObjectId: row.intelligenceObjectId as string });
  }
  return refs;
}

export function estimateBoundaryFingerprint(
  capabilityId: string,
  coveredOpenItemIds: string[],
  additionalOpenItemIds: string[],
): string {
  const material = JSON.stringify({
    capabilityId,
    covered: canonicalIds(coveredOpenItemIds),
    additional: canonicalIds(additionalOpenItemIds),
  });
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `estimate-boundary.v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sameIds(a: string[], b: string[]): boolean {
  const left = canonicalIds(a);
  const right = canonicalIds(b);
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function reviewCapabilityKnowledgeEstimate(
  estimate: CapabilityKnowledgeEstimate,
  input: EstimateReviewInput,
  context: EstimateReviewContext,
): AcceptedCapabilityEstimateV2 {
  if (!Number.isInteger(context.capabilityRevisionAtReview) || context.capabilityRevisionAtReview < 0) {
    throw new Error("A valid capability revision is required.");
  }
  const passage = estimate.passages.find((candidate) => candidate.id === input.passageId);
  if (!passage?.exactQuote.trim() || !passage.sourceRef.trim()) {
    throw new Error("Choose one exact source passage before accepting the estimate.");
  }
  const range = threePoint(input.range);
  if (!range) throw new Error("Enter an ordered low, likely, and high developer-day range.");
  if (input.sourceWorkMeaning !== "remaining" && input.sourceWorkMeaning !== "total") {
    throw new Error("Choose whether the source described remaining or total work.");
  }
  const origins = input.rangeOrigin;
  if (!origins || ![origins.low, origins.likely, origins.high].every((origin) => origin === "verbatim" || origin === "operator")) {
    throw new Error("Record whether each modeled range point is verbatim or operator supplied.");
  }
  for (const point of ["low", "likely", "high"] as const) {
    if (origins[point] === "verbatim" && !estimate.rawValues.includes(range[point])) {
      throw new Error(`${point} cannot be marked verbatim because that value is not present in the raw source assertion.`);
    }
  }
  const rationale = nullableString(input.rationale);
  if (!rationale) throw new Error("Explain how the source becomes the modeled remaining-work range.");
  if (input.quoteSupportsInterpretation !== true) {
    throw new Error("Acceptance requires explicit attestation that the selected quote supports the reviewed interpretation.");
  }
  const reviewerDisplayName = nullableString(input.reviewerDisplayName);
  if (!reviewerDisplayName) throw new Error("Enter the reviewer label that should appear in history.");
  const covered = inputIds(input.coveredOpenItemIds, "Covered work");
  const additional = inputIds(input.additionalOpenItemIds, "Additional work");
  if (covered.some((id) => additional.includes(id))) {
    throw new Error("A work item cannot be both covered by and additional to the capability estimate.");
  }
  const currentOpen = canonicalIds(context.currentOpenItemIds);
  if (!sameIds([...covered, ...additional], currentOpen)) {
    throw new Error("Every currently open linked item must be classified as covered or additional.");
  }
  const boundaryStatement = nullableString(input.boundaryStatement);
  if (currentOpen.length === 0 && !boundaryStatement) {
    throw new Error("A ticketless capability requires an explicit boundary statement.");
  }
  const reviewedAt = context.reviewedAt ?? new Date().toISOString();
  const acceptedAt = context.acceptedAt ?? reviewedAt;
  if (!isoDate(reviewedAt) || !isoDate(acceptedAt)) throw new Error("Review and acceptance timestamps must be valid ISO dates.");

  return {
    version: "accepted-capability-estimate.v2",
    source: {
      contextSnapshotId: estimate.contextSnapshotId,
      intelligenceObjectId: estimate.id,
      passageId: passage.id,
      sourceRef: passage.sourceRef,
      exactQuote: passage.exactQuote,
      surroundingContext: passage.surroundingContext,
      externalRef: passage.externalRef,
      sourceUrl: safeSourceUrl(passage.sourceUrl),
      statement: estimate.statement,
      rawEstimateText: estimate.rawEstimate,
      rawUnit: estimate.rawUnit,
      rawValues: [...estimate.rawValues],
      rawShape: estimate.rawShape,
      declaredWorkMeaningAtReview: estimate.sourceWorkMeaning,
      speaker: estimate.speaker,
      observedAt: estimate.observedAt,
      currentnessAtReview: estimate.currentness,
      supersedes: estimate.supersedes.map((ref) => ({ ...ref })),
      supersededBy: estimate.supersededBy.map((ref) => ({ ...ref })),
    },
    interpretation: {
      sourceWorkMeaning: input.sourceWorkMeaning,
      modeledBasis: "remaining_capability",
      modeledUnit: "developer_days",
      range,
      rangeOrigin: { ...origins },
      rationale,
      quoteSupportsInterpretation: true,
      policy: {
        progress: "manual_remaining_no_status_discount.v1",
        capacity: "pooled_effective_fte.v1",
        calendar: "calendar_days.v1",
      },
    },
    boundary: {
      capabilityId: estimate.capabilityId,
      capabilityRevisionAtReview: context.capabilityRevisionAtReview,
      coveredOpenItemIds: covered,
      additionalOpenItemIds: additional,
      reviewedLinkFingerprint: estimateBoundaryFingerprint(estimate.capabilityId, covered, additional),
      reviewedAt,
      boundaryStatement,
    },
    acceptance: { acceptedAt, reviewer: { id: null, displayName: reviewerDisplayName } },
  };
}

/** Kept only to read/create deterministic legacy fixtures. Product
 * acceptance uses reviewCapabilityKnowledgeEstimate and writes v2. */
export function acceptCapabilityKnowledgeEstimate(
  estimate: CapabilityKnowledgeEstimate,
  acceptedAt = new Date().toISOString(),
): AcceptedCapabilityEstimateV1 {
  if (!estimate.range || estimate.unit !== "developer_days") {
    throw new Error("Only an explicit three-point developer-day range can become a legacy accepted estimate.");
  }
  if (!traceableKnowledgeEstimate(estimate)) {
    throw new Error("A Reality estimate must retain an exact source passage, quote, and immutable snapshot reference.");
  }
  return {
    id: estimate.id,
    contextSnapshotId: estimate.contextSnapshotId,
    capabilityId: estimate.capabilityId,
    rawEstimate: estimate.rawEstimate,
    range: estimate.range,
    unit: "developer_days",
    basis: "remaining_capability",
    speaker: estimate.speaker,
    owner: estimate.owner,
    observedAt: estimate.observedAt,
    sourceRef: estimate.sourceRef,
    excerpt: estimate.excerpt,
    evidenceRefs: [...estimate.evidenceRefs],
    statement: estimate.statement,
    confidence: estimate.confidence,
    ...(estimate.sourceLocator ? { sourceLocator: { ...estimate.sourceLocator } } : {}),
    acceptedAt,
    acceptedBy: "operator",
  };
}

function parseLegacyAccepted(candidate: Record<string, unknown>): AcceptedCapabilityEstimateV1 | null {
  const range = threePoint(candidate.range);
  const locator = candidate.sourceLocator && typeof candidate.sourceLocator === "object" && !Array.isArray(candidate.sourceLocator)
    ? candidate.sourceLocator as Record<string, unknown> : null;
  const evidenceRefs = canonicalIds(candidate.evidenceRefs);
  if (
    !range || candidate.unit !== "developer_days" || candidate.basis !== "remaining_capability" ||
    !nullableString(candidate.id) || !nullableString(candidate.contextSnapshotId) || !nullableString(candidate.capabilityId) ||
    !nullableString(candidate.rawEstimate) || !nullableString(candidate.statement) ||
    !nullableString(candidate.sourceRef) || !nullableString(candidate.excerpt) || evidenceRefs.length === 0 ||
    !isoDate(candidate.acceptedAt) || candidate.acceptedBy !== "operator"
  ) return null;
  return {
    id: candidate.id as string,
    contextSnapshotId: candidate.contextSnapshotId as string,
    capabilityId: candidate.capabilityId as string,
    rawEstimate: candidate.rawEstimate as string,
    range,
    unit: "developer_days",
    basis: "remaining_capability",
    speaker: nullableString(candidate.speaker),
    owner: nullableString(candidate.owner),
    observedAt: nullableString(candidate.observedAt),
    sourceRef: nullableString(candidate.sourceRef),
    excerpt: nullableString(candidate.excerpt),
    evidenceRefs,
    statement: candidate.statement as string,
    confidence: nullableString(candidate.confidence),
    ...(locator ? { sourceLocator: {
      externalRef: nullableString(locator.externalRef),
      sourceUrl: safeSourceUrl(locator.sourceUrl),
      surroundingContext: nullableString(locator.surroundingContext),
    } } : {}),
    acceptedAt: candidate.acceptedAt as string,
    acceptedBy: "operator",
  };
}

function parseV2Accepted(candidate: Record<string, unknown>): AcceptedCapabilityEstimateV2 | null {
  if (candidate.version !== "accepted-capability-estimate.v2") return null;
  const source = candidate.source && typeof candidate.source === "object" && !Array.isArray(candidate.source)
    ? candidate.source as Record<string, unknown> : null;
  const interpretation = candidate.interpretation && typeof candidate.interpretation === "object" && !Array.isArray(candidate.interpretation)
    ? candidate.interpretation as Record<string, unknown> : null;
  const boundary = candidate.boundary && typeof candidate.boundary === "object" && !Array.isArray(candidate.boundary)
    ? candidate.boundary as Record<string, unknown> : null;
  const acceptance = candidate.acceptance && typeof candidate.acceptance === "object" && !Array.isArray(candidate.acceptance)
    ? candidate.acceptance as Record<string, unknown> : null;
  if (!source || !interpretation || !boundary || !acceptance) return null;
  const range = threePoint(interpretation.range);
  const origin = interpretation.rangeOrigin && typeof interpretation.rangeOrigin === "object" && !Array.isArray(interpretation.rangeOrigin)
    ? interpretation.rangeOrigin as Record<string, unknown> : null;
  const policy = interpretation.policy && typeof interpretation.policy === "object" && !Array.isArray(interpretation.policy)
    ? interpretation.policy as Record<string, unknown> : null;
  const reviewer = acceptance.reviewer && typeof acceptance.reviewer === "object" && !Array.isArray(acceptance.reviewer)
    ? acceptance.reviewer as Record<string, unknown> : null;
  const rawValues = Array.isArray(source.rawValues) && source.rawValues.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    ? source.rawValues as number[] : null;
  const supersedes = objectRefs(source.supersedes);
  const supersededBy = objectRefs(source.supersededBy);
  const covered = canonicalIds(boundary.coveredOpenItemIds);
  const additional = canonicalIds(boundary.additionalOpenItemIds);
  const originalCovered = Array.isArray(boundary.coveredOpenItemIds) ? boundary.coveredOpenItemIds : [];
  const originalAdditional = Array.isArray(boundary.additionalOpenItemIds) ? boundary.additionalOpenItemIds : [];
  const expectedRawShape = rawValues
    ? rawValues.length === 1 ? "single" : rawValues.length === 2 ? "bounds" : rawValues.length === 3 ? "three_point" : "unstructured"
    : null;
  const declaredWorkMeaningAtReview = source.declaredWorkMeaningAtReview === undefined
    ? undefined
    : ["remaining", "total", "unknown"].includes(source.declaredWorkMeaningAtReview as string)
      ? source.declaredWorkMeaningAtReview as EstimateSourceWorkMeaning
      : null;
  if (
    !nullableString(source.contextSnapshotId) || !nullableString(source.intelligenceObjectId) ||
    !nullableString(source.passageId) || !nullableString(source.sourceRef) || !nullableString(source.exactQuote) ||
    !nullableString(source.statement) || !nullableString(source.rawEstimateText) || !rawValues ||
    !["developer_days", "elapsed_days", "sprints", "story_points", "unknown"].includes(source.rawUnit as string) ||
    !["single", "bounds", "three_point", "unstructured"].includes(source.rawShape as string) || source.rawShape !== expectedRawShape ||
    declaredWorkMeaningAtReview === null ||
    !["current", "historical", "unknown"].includes(source.currentnessAtReview as string) ||
    supersedes === null || supersededBy === null ||
    !range || !origin || ![origin.low, origin.likely, origin.high].every((value) => value === "verbatim" || value === "operator") ||
    !["remaining", "total"].includes(interpretation.sourceWorkMeaning as string) ||
    interpretation.modeledBasis !== "remaining_capability" || interpretation.modeledUnit !== "developer_days" ||
    !nullableString(interpretation.rationale) || interpretation.quoteSupportsInterpretation !== true ||
    !policy || policy.progress !== "manual_remaining_no_status_discount.v1" ||
    policy.capacity !== "pooled_effective_fte.v1" || policy.calendar !== "calendar_days.v1" ||
    !nullableString(boundary.capabilityId) || !Number.isInteger(boundary.capabilityRevisionAtReview) || (boundary.capabilityRevisionAtReview as number) < 0 ||
    originalCovered.length !== covered.length || originalAdditional.length !== additional.length ||
    covered.some((id) => additional.includes(id)) || !isoDate(boundary.reviewedAt) ||
    boundary.reviewedLinkFingerprint !== estimateBoundaryFingerprint(boundary.capabilityId as string, covered, additional) ||
    !isoDate(acceptance.acceptedAt) || !reviewer ||
    !(reviewer.id === null || nullableString(reviewer.id)) || !nullableString(reviewer.displayName)
  ) return null;
  const boundaryStatement = boundary.boundaryStatement === null ? null : nullableString(boundary.boundaryStatement);
  if (covered.length + additional.length === 0 && !boundaryStatement) return null;
  return {
    version: "accepted-capability-estimate.v2",
    source: {
      contextSnapshotId: source.contextSnapshotId as string,
      intelligenceObjectId: source.intelligenceObjectId as string,
      passageId: source.passageId as string,
      sourceRef: source.sourceRef as string,
      exactQuote: source.exactQuote as string,
      surroundingContext: nullableString(source.surroundingContext),
      externalRef: nullableString(source.externalRef),
      sourceUrl: safeSourceUrl(source.sourceUrl),
      statement: source.statement as string,
      rawEstimateText: source.rawEstimateText as string,
      rawUnit: source.rawUnit as RawEstimateUnit,
      rawValues: [...rawValues],
      rawShape: source.rawShape as RawEstimateShape,
      ...(declaredWorkMeaningAtReview !== undefined ? { declaredWorkMeaningAtReview } : {}),
      speaker: nullableString(source.speaker),
      observedAt: nullableString(source.observedAt),
      currentnessAtReview: source.currentnessAtReview as EstimateSourceCurrentness,
      supersedes,
      supersededBy,
    },
    interpretation: {
      sourceWorkMeaning: interpretation.sourceWorkMeaning as "remaining" | "total",
      modeledBasis: "remaining_capability",
      modeledUnit: "developer_days",
      range,
      rangeOrigin: origin as AcceptedCapabilityEstimateV2["interpretation"]["rangeOrigin"],
      rationale: interpretation.rationale as string,
      quoteSupportsInterpretation: true,
      policy: {
        progress: "manual_remaining_no_status_discount.v1",
        capacity: "pooled_effective_fte.v1",
        calendar: "calendar_days.v1",
      },
    },
    boundary: {
      capabilityId: boundary.capabilityId as string,
      capabilityRevisionAtReview: boundary.capabilityRevisionAtReview as number,
      coveredOpenItemIds: covered,
      additionalOpenItemIds: additional,
      reviewedLinkFingerprint: boundary.reviewedLinkFingerprint as string,
      reviewedAt: boundary.reviewedAt as string,
      boundaryStatement,
    },
    acceptance: {
      acceptedAt: acceptance.acceptedAt as string,
      reviewer: { id: reviewer.id as string | null, displayName: reviewer.displayName as string },
    },
  };
}

/** Fail closed when reading the JSON Reality field. */
export function acceptedCapabilityEstimate(value: unknown): AcceptedCapabilityEstimate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return candidate.version === "accepted-capability-estimate.v2"
    ? parseV2Accepted(candidate)
    : parseLegacyAccepted(candidate);
}

export function reviewedCapabilityEstimate(
  value: unknown,
  currentOpenItemIds: string[],
  currentSources?: CapabilityKnowledgeEstimate | readonly CapabilityKnowledgeEstimate[] | null,
): ReviewedCapabilityEstimateResult {
  const assertionPresent = value !== null && value !== undefined;
  const estimate = acceptedCapabilityEstimate(value);
  if (!estimate) return assertionPresent ? {
    status: "review_required",
    estimate: null,
    publishable: false,
    invalidStoredAssertion: true,
    reviewRequiredReason: "The stored accepted estimate is malformed or unsupported. It is not applied; explicit review is required.",
  } : null;
  if (!isAcceptedCapabilityEstimateV2(estimate)) {
    return {
      status: "review_required",
      estimate,
      publishable: false,
      reviewRequiredReason: "Legacy accepted basis; interpretation and open-work boundary were not reviewed.",
    };
  }
  const coveredItemIds = [...estimate.boundary.coveredOpenItemIds];
  const additionalItemIds = [...estimate.boundary.additionalOpenItemIds];
  const exploration = { range: estimate.interpretation.range, coveredItemIds, additionalItemIds };
  const reviewedOpen = [...coveredItemIds, ...additionalItemIds];
  if (!sameIds(reviewedOpen, currentOpenItemIds)) {
    const current = new Set(canonicalIds(currentOpenItemIds));
    const reviewed = new Set(reviewedOpen);
    const added = [...current].filter((id) => !reviewed.has(id));
    const removed = [...reviewed].filter((id) => !current.has(id));
    const detail = [
      added.length ? `${added.length} new open item${added.length === 1 ? "" : "s"} unclassified` : "",
      removed.length ? `${removed.length} reviewed item${removed.length === 1 ? " is" : "s are"} no longer open` : "",
    ].filter(Boolean).join("; ");
    return { status: "review_required", estimate, publishable: false, exploration, reviewRequiredReason: `Estimate boundary changed: ${detail}.` };
  }
  const sources: readonly CapabilityKnowledgeEstimate[] = currentSources
    ? (Array.isArray(currentSources) ? currentSources : [currentSources])
    : [];
  const acceptedSource = sources.find((source) => source.id === estimate.source.intelligenceObjectId);
  const reviewedSuccessorIds = new Set(estimate.source.supersededBy.map((ref: KnowledgeEstimateObjectRef) => ref.intelligenceObjectId));
  const successor = sources.find((source) =>
    source.supersedes.some((ref: KnowledgeEstimateObjectRef) => ref.intelligenceObjectId === estimate.source.intelligenceObjectId)
    && !reviewedSuccessorIds.has(source.id));
  const sourceStateChanged = Boolean(acceptedSource
    && (acceptedSource.currentness !== estimate.source.currentnessAtReview
      || !sameIds(acceptedSource.supersedes.map((ref) => ref.intelligenceObjectId), estimate.source.supersedes.map((ref) => ref.intelligenceObjectId))
      || !sameIds(acceptedSource.supersededBy.map((ref) => ref.intelligenceObjectId), [...reviewedSuccessorIds])));
  const selectedPassage = acceptedSource?.passages.find((passage) => passage.id === estimate.source.passageId);
  const sourceContentChanged = Boolean(acceptedSource && (
    acceptedSource.rawEstimate !== estimate.source.rawEstimateText
    || acceptedSource.rawUnit !== estimate.source.rawUnit
    || acceptedSource.rawShape !== estimate.source.rawShape
    || acceptedSource.rawValues.length !== estimate.source.rawValues.length
    || acceptedSource.rawValues.some((value, index) => value !== estimate.source.rawValues[index])
    || acceptedSource.statement !== estimate.source.statement
    || acceptedSource.speaker !== estimate.source.speaker
    || acceptedSource.observedAt !== estimate.source.observedAt
    || (estimate.source.declaredWorkMeaningAtReview !== undefined
      ? acceptedSource.sourceWorkMeaning !== estimate.source.declaredWorkMeaningAtReview
      : acceptedSource.sourceWorkMeaning !== "unknown"
        && acceptedSource.sourceWorkMeaning !== estimate.interpretation.sourceWorkMeaning)
    || !selectedPassage
    || selectedPassage.sourceRef !== estimate.source.sourceRef
    || selectedPassage.exactQuote !== estimate.source.exactQuote
    || selectedPassage.surroundingContext !== estimate.source.surroundingContext
    || selectedPassage.externalRef !== estimate.source.externalRef
    || safeSourceUrl(selectedPassage.sourceUrl) !== estimate.source.sourceUrl
  ));
  const acceptedSourceMissing = currentSources !== undefined && currentSources !== null && !acceptedSource;
  if (estimate.source.currentnessAtReview !== "current" || estimate.source.supersededBy.length > 0 || sourceStateChanged || sourceContentChanged || successor || acceptedSourceMissing) {
    return {
      status: "review_required",
      estimate,
      publishable: false,
      exploration,
      reviewRequiredReason: sourceContentChanged
        ? "The latest knowledge snapshot changed the accepted source assertion; explicit re-review is required."
        : acceptedSourceMissing && !successor
        ? "The latest knowledge snapshot no longer contains the accepted source; explicit re-review is required."
        : "The accepted source is historical or superseded and requires explicit re-review.",
    };
  }
  return { status: "reviewed", estimate, range: estimate.interpretation.range, coveredItemIds, additionalItemIds, publishable: true };
}

type CapabilityRef = { id: string; name: string };

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: JsonValue | undefined): number | null {
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
    const value = positiveNumber(fields[key]);
    if (value !== null) return value;
  }
  return null;
}

function exactCapability(object: IntelligenceObjectItem, capabilities: CapabilityRef[]): CapabilityRef | null {
  const fields = record(object.fields);
  const explicitId = firstText(fields, ["capabilityId", "capability_id", "featureId", "feature_id"]);
  if (explicitId) return capabilities.find((candidate) => candidate.id === explicitId) ?? null;
  const explicitName = firstText(fields, ["capabilityName", "capability_name", "capability", "featureName", "feature_name", "feature"]);
  if (explicitName) {
    const key = normalized(explicitName);
    return capabilities.find((candidate) => normalized(candidate.name) === key) ?? null;
  }
  const haystack = normalized([object.statement, firstText(fields, ["action", "note", "significance"]) ?? ""].join(" "));
  const matches = capabilities.filter((candidate) => {
    const needle = normalized(candidate.name);
    return needle.length >= 4 && (` ${haystack} `).includes(` ${needle} `);
  });
  return matches.length === 1 ? matches[0] : null;
}

function explicitNumbers(fields: Record<string, JsonValue>): number[] {
  const low = firstNumber(fields, ["estimateLowDays", "estimate_low_days", "lowDays", "low_days"]);
  const likely = firstNumber(fields, ["estimateLikelyDays", "estimate_likely_days", "likelyDays", "likely_days"]);
  const high = firstNumber(fields, ["estimateHighDays", "estimate_high_days", "highDays", "high_days"]);
  if (low !== null && likely !== null && high !== null) return [low, likely, high];
  if (low !== null && high !== null) return [low, high];
  const single = firstNumber(fields, ["developerDays", "developer_days", "devDays", "dev_days", "estimateDays", "estimate_days"]);
  return single === null ? [] : [single];
}

function estimateText(fields: Record<string, JsonValue>): string | null {
  const explicit = firstText(fields, ["duration_stated", "estimate", "estimateRange", "estimate_range", "developerDays", "developer_days", "devDays", "dev_days"]);
  if (explicit) return explicit;
  const values = explicitNumbers(fields);
  if (values.length === 3) return `${values.join("–")} developer days`;
  if (values.length === 2) return `${values.join("–")} developer days`;
  if (values.length === 1) return `${values[0]} developer days`;
  return null;
}

function rawUnit(fields: Record<string, JsonValue>, raw: string): RawEstimateUnit {
  const supplied = firstText(fields, ["estimateUnit", "estimate_unit", "unit", "durationUnit", "duration_unit"]);
  const value = normalized(supplied ?? raw);
  if (/\b(?:developer|dev|engineering) days?\b/.test(value)) return "developer_days";
  if (/\b(?:calendar|elapsed|working|business) days?\b/.test(value) || /\bdays?\b/.test(value)) return "elapsed_days";
  if (/\bsprints?\b/.test(value)) return "sprints";
  if (/\b(?:story )?points?\b/.test(value)) return "story_points";
  return "unknown";
}

function rawValues(fields: Record<string, JsonValue>, raw: string, unit: RawEstimateUnit): number[] {
  // *_days may be a producer's conversion alongside a source stated in
  // sprints. Do not relabel 40 days as 40 sprints (or invent a conversion).
  const supplied = unit === "developer_days" ? explicitNumbers(fields) : [];
  if (supplied.length > 0) return supplied;
  return [...raw.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter((value) => value > 0);
}

function rawShape(values: number[]): RawEstimateShape {
  if (values.length === 1) return "single";
  if (values.length === 2) return "bounds";
  if (values.length === 3) return "three_point";
  return "unstructured";
}

function explicitWorkMeaning(fields: Record<string, JsonValue>): EstimateSourceWorkMeaning {
  const supplied = firstText(fields, ["sourceWorkMeaning", "source_work_meaning", "workMeaning", "work_meaning", "estimateBasis", "estimate_basis", "estimate_covers"]);
  if (!supplied) return "unknown";
  const value = normalized(supplied.replaceAll("_", " "));
  if (value === "remaining" || value === "remaining work" || value === "remaining capability") return "remaining";
  if (value === "total" || value === "total work" || value === "total capability") return "total";
  return "unknown";
}

function passageFor(pkg: ProjectContextPackage, evidence: EvidenceItem): KnowledgeEstimatePassage {
  const source = pkg.sources.find((candidate) => candidate.sourceRef === evidence.sourceRef);
  const evidenceData = record(evidence.data);
  const evidenceExtra = record(evidence.extra);
  const sourceExtra = record(source?.extra);
  return {
    id: evidence.id,
    sourceRef: evidence.sourceRef,
    exactQuote: evidence.excerpt,
    externalRef: evidence.externalRef ?? null,
    sourceUrl: [evidence.externalRef, ...[evidenceData, evidenceExtra, sourceExtra].flatMap((row) => [row.url, row.sourceUrl, row.externalUrl])]
      .map(safeSourceUrl).find((value) => value !== null) ?? null,
    surroundingContext: firstText(evidenceData, ["surroundingContext", "context", "fullText"])
      ?? firstText(evidenceExtra, ["surroundingContext", "context"]),
  };
}

function passagesFor(pkg: ProjectContextPackage, refs: string[]): KnowledgeEstimatePassage[] {
  const byId = new Map(pkg.evidence.map((item) => [item.id, item]));
  return refs.flatMap((ref) => {
    const evidence = byId.get(ref);
    return evidence?.excerpt?.trim() ? [passageFor(pkg, evidence)] : [];
  });
}

function speakerFor(object: IntelligenceObjectItem, evidence: EvidenceItem | null): string | null {
  const fields = record(object.fields);
  return firstText(fields, ["speaker", "speaker_or_actor", "identified_by"])
    ?? firstText(record(evidence?.data), ["speaker"]);
}

function observedAtFor(object: IntelligenceObjectItem, evidence: EvidenceItem | null): string | null {
  return object.observedDate ?? firstText(record(evidence?.data), ["meetingDate", "occurredAt"]);
}

function relationRefs(
  pkg: ProjectContextPackage,
  objectId: string,
  contextSnapshotId: string,
): { supersedes: KnowledgeEstimateObjectRef[]; supersededBy: KnowledgeEstimateObjectRef[] } {
  const supersedes: KnowledgeEstimateObjectRef[] = [];
  const supersededBy: KnowledgeEstimateObjectRef[] = [];
  for (const relation of pkg.intelligenceRelations ?? []) {
    const rel = normalized(readRelationField(relation, "rel") ?? "");
    if (rel !== "supersedes" && rel !== "superseded by") continue;
    const from = readRelationField(relation, "from");
    const to = readRelationField(relation, "to");
    // The transport says passive spellings already have normalized endpoints.
    if (from === objectId && to) supersedes.push({ contextSnapshotId, intelligenceObjectId: to });
    if (to === objectId && from) supersededBy.push({ contextSnapshotId, intelligenceObjectId: from });
  }
  const dedupe = (refs: KnowledgeEstimateObjectRef[]) => [...new Map(refs.map((ref) => [ref.intelligenceObjectId, ref])).values()]
    .sort((a, b) => a.intelligenceObjectId.localeCompare(b.intelligenceObjectId));
  return { supersedes: dedupe(supersedes), supersededBy: dedupe(supersededBy) };
}

/** Extracts current and historical source assertions without interpreting
 * their values as remaining effort. */
export function capabilityKnowledgeEstimates(
  pkg: ProjectContextPackage | null | undefined,
  contextSnapshotId: string | null | undefined,
  capabilities: CapabilityRef[],
): CapabilityKnowledgeEstimate[] {
  if (!pkg || !contextSnapshotId || capabilities.length === 0) return [];
  const evidenceById = new Map(pkg.evidence.map((item) => [item.id, item]));
  const estimates: CapabilityKnowledgeEstimate[] = [];
  for (const object of pkg.intelligenceObjects ?? []) {
    const fields = record(object.fields);
    const rawEstimate = estimateText(fields);
    if (!rawEstimate) continue;
    const capability = exactCapability(object, capabilities);
    if (!capability) continue;
    const refs = object.evidenceRefs ?? [];
    const passages = passagesFor(pkg, refs);
    const firstPassage = passages[0] ?? null;
    const firstEvidence = firstPassage ? evidenceById.get(firstPassage.id) ?? null : null;
    const unit = rawUnit(fields, rawEstimate);
    const values = rawValues(fields, rawEstimate, unit);
    const shape = rawShape(values);
    const range = unit === "developer_days" && shape === "three_point"
      && values[0] <= values[1] && values[1] <= values[2]
      ? { low: values[0], likely: values[1], high: values[2] }
      : null;
    const sourceWorkMeaning = explicitWorkMeaning(fields);
    const relations = relationRefs(pkg, object.id, contextSnapshotId);
    estimates.push({
      id: object.id,
      contextSnapshotId,
      capabilityId: capability.id,
      rawEstimate,
      rawUnit: unit,
      rawValues: values,
      rawShape: shape,
      sourceWorkMeaning,
      currentness: object.isCurrent ? "current" : "historical",
      ...relations,
      passages,
      range,
      unit: range ? "developer_days" : "unsupported",
      basis: range && sourceWorkMeaning === "remaining" ? "remaining_capability" : "review_required",
      speaker: speakerFor(object, firstEvidence),
      owner: firstText(fields, ["owner", "person", "person_or_team"]),
      observedAt: observedAtFor(object, firstEvidence),
      sourceRef: firstPassage?.sourceRef ?? null,
      excerpt: firstPassage?.exactQuote ?? null,
      evidenceRefs: firstPassage ? [firstPassage.id, ...refs.filter((ref) => ref !== firstPassage.id)] : refs,
      statement: object.statement,
      confidence: firstText(record(object.provenance), ["confidence"]),
      ...(firstPassage ? { sourceLocator: {
        externalRef: firstPassage.externalRef,
        sourceUrl: firstPassage.sourceUrl,
        surroundingContext: firstPassage.surroundingContext,
      } } : {}),
    });
  }

  return estimates.sort((a, b) => {
    if (a.currentness !== b.currentness) return a.currentness === "current" ? -1 : 1;
    const at = a.observedAt ? Date.parse(a.observedAt) : 0;
    const bt = b.observedAt ? Date.parse(b.observedAt) : 0;
    return bt - at || a.id.localeCompare(b.id);
  });
}
