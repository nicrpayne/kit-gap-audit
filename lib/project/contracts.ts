/** Shared project payloads and Scenario inputs. No React or browser runtime. */
import type { WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import type { ForecastCoverageContract } from "@/lib/forecast/coverage";
import type { CapabilityEvidenceReference } from "@/lib/scope/capabilityEvidence";
import type {
  AcceptedCapabilityEstimate,
  CapabilityKnowledgeEstimate,
  ReviewedCapabilityEstimateResult,
} from "@/lib/scope/knowledgeEstimates";
import type { CapabilityStaffingPlan } from "@/lib/scope/capabilityForecast";
import type { CapacityScenarioPlanV1 } from "@/lib/scenario/capacityPlan";
import type { RemainingEstimateDrafts } from "@/lib/scenario/remainingEstimates";
import type { DecisionPlans, DecisionScenarioInput } from "@/lib/scenario/decisionPlan";
import type { PhasedCapacityPlanV1 } from "@/lib/scenario/phasedCapacity";

// The provenance the Scope instrument reads. Produced by describeItems in
// lib/forecast/compute.ts by joining each simulated item back to the Linear
// issue or Finding it was built from -- nothing here is inferred client-side.
export interface ScopeWorkItem extends WorkItem {
  description?: string | null;
  estimateSource:
    "ai" | "points" | "issue_placeholder" | "hint" | "finding_placeholder" | "knowledge";
  kind: "ticket" | "inferred";
  state: string | null;
  externalUrl?: string | null;
  updatedAt?: string | null;
  assignee: string | null;
  points: number | null;
  quote: string | null;
  rationale: string | null;
  /** The Linear parent, verbatim; resolved to a feature in lib/scope/features.ts. */
  parentIdentifier: string | null;
  parentTitle: string | null;
  projectName: string | null;
}

export interface ProjectScope {
  scopeId: string;
  currentContextSnapshotId: string | null;
  name: string;
  targetDate: string | null;
  dependsOnScopeIds: string[];
  items: ScopeWorkItem[];
  forecastItems: WorkItem[];
  executionItems: ScopeWorkItem[];
  completedWork: {
    id: string;
    label: string;
    parentIdentifier: string | null;
    parentTitle: string | null;
    completedAt: string | null;
  }[];
  gates: DecisionGate[];
  teamCapacity: number;
  capacitySource: "allocations" | "explicit" | "inferred";
  explicitTeamCapacity: number | null;
  lastReport: { generatedAt: string; likelyDate: string; confidenceAtTarget: number | null } | null;
  reportHistory: {
    generatedAt: string;
    likelyDate: string;
    confidenceAtTarget: number | null;
    shippedCount: number;
    resolvedSinceLastCount: number;
  }[];
  capacityBasis: {
    kind: "allocations" | "explicit" | "inferred";
    contributors?: { personId: string; name: string; effectiveFte: number; scopeCount: number }[];
    value?: number;
    assignees?: string[];
    remainingIssueCount?: number;
    unassignedCount?: number;
  };
  capacityContract: {
    scopeId: string;
    workforceFte: number;
    namedRawFte: number;
    namedEffectiveFte: number;
    forecastEffectiveFte: number;
    source: "allocations" | "explicit" | "inferred";
    status:
      | "named_exact"
      | "named_partial"
      | "aggregate_unreconciled"
      | "legacy_inferred_unstaffed"
      | "legacy_explicit_unstaffed";
    reconciles: boolean;
  };
  forecastSource: {
    asOf: string;
    provider: "Linear";
    temporalRole: "live";
    availability: "available" | "empty";
  };
  executionSource: {
    asOf: string;
    provider: "Linear";
    temporalRole: "live";
    availability: "available" | "empty";
  };
  forecastCoverage: ForecastCoverageContract;
  forecastReadiness: { state: "ready" | "modeled_subset" | "unavailable"; reason: string | null };
  executionState: string;
  executionDetail: string | null;
  realityState: {
    realityRevision: number;
    computedRevision: number;
    status: string;
    readiness: unknown;
  };
  capabilities: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    revision: number;
    sortOrder: number;
    updatedAt: string;
    workLinkCount: number;
    provenance: unknown;
    evidenceTrace?: CapabilityEvidenceReference[];
    events: { id: string; action: string; actor: string; createdAt: string }[];
    workLinks: {
      id: string;
      provider: string;
      externalId: string;
      externalUrl: string | null;
      state: string;
    }[];
    knowledgeEstimates: CapabilityKnowledgeEstimate[];
    acceptedEstimate: AcceptedCapabilityEstimate | null;
    estimateReview: ReviewedCapabilityEstimateResult;
  }[];
  openShapeQuestions: { id: string; title: string; rationale: string | null; status: string }[];
}

export interface ProjectFinding {
  id: string;
  // Nullable since Context Package Foundation Phase 1b: a package-derived
  // Finding is evidenced by a ContextSnapshot and never gets a fabricated
  // Source. The instrument surfaces already treat a missing source
  // optionally (no link, no "· title" suffix); this makes the type say so.
  sourceId: string | null;
  type: string;
  title: string;
  quote: string;
  rationale: string;
  severity: string;
  estimateHint: string | null;
  owner: string | null;
  blocks: string | null;
  blocking: boolean;
  matchedIssues: string[];
  status: string;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ProjectSource {
  id: string;
  kind: string;
  title: string;
  scopeId: string | null;
  createdAt: string;
}

export interface ProjectReport {
  id: string;
  scopeId: string;
  generatedAt: string;
  likelyDate: string;
  confidenceAtTarget: number | null;
  likelyDateDeltaDays: number | null;
  shippedCount: number;
  blockingCount: number;
  resolvedSinceLastCount: number;
  summaryMarkdown: string;
}

export interface ProjectPayload {
  decisions?: DecisionScenarioInput[];
  startDate: string;
  forecastSource: {
    asOf: string;
    provider: "Linear";
    temporalRole: "live";
    availability: "available" | "empty";
  };
  scopes: ProjectScope[];
  people: {
    id: string;
    name: string;
    fte: number;
    externalCommitmentFte?: number;
    active: boolean;
  }[];
  allocations: { id: string; personId: string; scopeId: string; fraction: number }[];
  contextSwitchCostPct: number;
  sources: ProjectSource[];
  findings: ProjectFinding[];
  reports: ProjectReport[];
}

// The scenario levers the ENGINE genuinely honours today. Anything not in
// this shape is not simulable, and the UI must say so rather than pretend.
export interface SuiteScenario {
  phasedCapacityPlan?: PhasedCapacityPlanV1 | null;
  remainingEstimateByCapabilityId?: RemainingEstimateDrafts;
  decisionPlans?: DecisionPlans;
  /** Exact cross-project Portfolio plan. This is the durable capacity owner;
      aggregate overrides below are only a backward-compatible projection. */
  capacityPlan: CapacityScenarioPlanV1 | null;
  /** scopeId -> simulated total FTE (Portfolio's aggregate override). */
  capacityOverrideByScope: Record<string, number>;
  /** Work item ids excluded from the simulation -- real: items simply drop. */
  excludedItemIds: Set<string>;
  /** Execution items added by a Scope release-state preview. */
  includedItemIds: Set<string>;
  /** Gate ids treated as resolved -- real: the serial delay disappears. */
  resolvedGateIds: Set<string>;
  /** Item id -> a hypothetical three-point range to simulate INSTEAD of the
      stored one. Exactly as real as an exclusion: the simulation reads an
      item's low/likely/high off the spec it is handed, so substituting them
      is a pure input change on the existing path -- no new math, and the
      stored WorkEstimate is never touched. Scope owns this lever. */
  estimateOverrideByItemId: Record<string, { low: number; likely: number; high: number }>;
  /** Top-down developer estimate explicitly staged from immutable knowledge
      evidence. It replaces that capability's ticket rollup in Scenario so
      the same work is never counted twice. */
  knowledgeEstimateByCapabilityId: Record<
    string,
    {
      estimateId: string;
      contextSnapshotId: string;
      low: number;
      likely: number;
      high: number;
    }
  >;
  /** Named project capacity assumed to remain focused on one capability.
      This powers an isolated per-card outlook; it is not a project Allocation
      and does not silently change the release's aggregate capacity. */
  capabilityStaffingById: Record<string, CapabilityStaffingPlan>;
  // WHICH CAPABILITIES ARE OUT, as opposed to which work items are.
  //
  // excludedItemIds above stays the engine's truth -- the simulation only
  // understands work items, and nothing here changes that. This set records
  // the PRODUCT-LEVEL decision that produced those exclusions, so the suite
  // can say "Offline Capture is out of this release" instead of "3 items out
  // of scope". Scope writes both together, and is the only writer of this one.
  bypassedFeatureIds: Set<string>;
  /** Canonical outside/future capabilities previewed as accepted. */
  includedCapabilityIds: Set<string>;
  // Capabilities drafted in this Scenario. Canonical capabilities have a
  // server owner; these remain hypothetical until Scope explicitly commits.
  draftFeatures: { id: string; name: string; intent: string; itemIds: string[] }[];
  // Hermes candidates the user has seated into the release by hand. Session-
  // local until the owner explicitly commits the Scenario. Seating one changes
  // no simulation input because the candidate work was already counted.
  acceptedCandidateIds: Set<string>;
  /** Persisted Scope proposals explicitly staged by the operator. Proposal
      state is server-owned; this selection remains local and hypothetical
      until the governed commit endpoint succeeds. */
  scopeProposalSelections: {
    scopeId: string;
    proposalId: string;
    itemId: string;
    title: string;
    description: string | null;
    /** Persisted proposal target before the operator's correction. */
    sourceCapabilityId: string | null;
    /** Work already linked to that source when the proposal was compiled. */
    sourceAlreadyLinkedItemIds: string[];
    targetCapabilityId: string | null;
    expectedRevision: number | null;
    itemIds: string[];
    releaseStatus: "accepted" | "outside";
  }[];
  contextSwitchCostPct: number | null;
}
