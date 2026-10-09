"use client";

// The suite's shared client model: one fetch, one simulation, seven surfaces.
//
// Everything here is REAL. The forecast comes from runPortfolioSimulation
// over the same inputs /portfolio uses; scope items are the actual modelled
// WorkItems; gates are the actual blocking decisions. Nothing is generated
// for demonstration. Where a surface wants a concept the engine doesn't have
// yet (release boundaries, decision options), the surface says so with
// <Prototype/> rather than this module inventing data.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { retainProjectReader } from "./projectMountRefresh";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import { scenarioPreviewRefusal, type ScenarioPreviewRefusal } from "@/lib/instrument/scenarioPreviewRefusal";
import { selectPreviewLifecycle } from "@/lib/instrument/previewLifecycle";
import { ambiguousScenarioItemLeverMessage, findAmbiguousScenarioItemLevers } from "@/lib/scenario/itemLeverScope";
import type { SimulationResult, WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import {
  buildCapacityPlanBaseline,
  capacityPlanAffectedScopeIds,
  resolveCapacityPlan,
  validateCapacityScenarioPlan,
  type CapacityScenarioPlanV1,
} from "@/lib/scenario/capacityPlan";
import { computeMomentum } from "@/lib/momentum/compute";
import { computeMomentumTrend, type MomentumTrend } from "@/lib/momentum/trend";
import { realityRevision, subscribeReality } from "@/lib/instrument/reality";
import type { CapabilityEvidenceReference } from "@/lib/scope/capabilityEvidence";
import { formatDateOnly } from "@/lib/time/dateContract";
import type { ForecastCoverageContract } from "@/lib/forecast/coverage";
import { acceptedEstimateIdentity, knowledgeEstimateItemId, substituteCapabilityKnowledgeEstimates, type AcceptedCapabilityEstimate, type CapabilityKnowledgeEstimate, type ReviewedCapabilityEstimateResult } from "@/lib/scope/knowledgeEstimates";
import type { CapabilityStaffingPlan } from "@/lib/scope/capabilityForecast";
import { scenarioForecastCoverage } from "@/lib/scenario/forecastCoverage";
import { remainingEstimateItems, remainingEstimateConflict, type RemainingEstimateDrafts } from "@/lib/scenario/remainingEstimates";
import { decisionScenarioGates, validateDecisionPlans, type DecisionPlans, type DecisionScenarioInput } from "@/lib/scenario/decisionPlan";
import { compilePhasedCapacityPlan, phasedCapacityPlanAffectedScopeIds, validatePhasedCapacityPlan, type PhasedCapacityPlanV1 } from "@/lib/scenario/phasedCapacity";
import { buildSavedScenarioBaseline, compareSavedScenarioBaseline, decodeSavedScenario, encodeSavedScenario, type SavedScenarioBaselineV1, type SavedScenarioDetail } from "@/lib/scenario/saved";
import {
  decodeWorkspaceDraft,
  encodeWorkspaceDraft,
  savedScenarioReplyDisposition,
  SCENARIO_DRAFT_STORAGE_KEY,
} from "@/lib/scenario/workspaceRecovery";

// The provenance the Scope instrument reads. Produced by describeItems in
// lib/forecast/compute.ts by joining each simulated item back to the Linear
// issue or Finding it was built from -- nothing here is inferred client-side.
export interface ScopeWorkItem extends WorkItem {
  description?: string | null;
  estimateSource: "ai" | "points" | "issue_placeholder" | "hint" | "finding_placeholder" | "knowledge";
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
    status: "named_exact" | "named_partial" | "aggregate_unreconciled" | "legacy_inferred_unstaffed" | "legacy_explicit_unstaffed";
    reconciles: boolean;
  };
  forecastSource: { asOf: string; provider: "Linear"; temporalRole: "live"; availability: "available" | "empty" };
  executionSource: { asOf: string; provider: "Linear"; temporalRole: "live"; availability: "available" | "empty" };
  forecastCoverage: ForecastCoverageContract;
  forecastReadiness: { state: "ready" | "modeled_subset" | "unavailable"; reason: string | null };
  executionState: string;
  executionDetail: string | null;
  realityState: { realityRevision: number; computedRevision: number; status: string; readiness: unknown };
  capabilities: {
    id: string; name: string; description: string | null; status: string; revision: number; sortOrder: number;
    updatedAt: string; workLinkCount: number; provenance: unknown;
    evidenceTrace?: CapabilityEvidenceReference[];
    events: { id: string; action: string; actor: string; createdAt: string }[];
    workLinks: { id: string; provider: string; externalId: string; externalUrl: string | null; state: string }[];
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
  forecastSource: { asOf: string; provider: "Linear"; temporalRole: "live"; availability: "available" | "empty" };
  scopes: ProjectScope[];
  people: { id: string; name: string; fte: number; externalCommitmentFte?: number; active: boolean }[];
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
  knowledgeEstimateByCapabilityId: Record<string, {
    estimateId: string;
    contextSnapshotId: string;
    low: number;
    likely: number;
    high: number;
  }>;
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

export const EMPTY_SCENARIO: SuiteScenario = {
  phasedCapacityPlan: null,
  capacityPlan: null,
  capacityOverrideByScope: {},
  excludedItemIds: new Set(),
  includedItemIds: new Set(),
  resolvedGateIds: new Set(),
  estimateOverrideByItemId: {},
  knowledgeEstimateByCapabilityId: {},
  capabilityStaffingById: {},
  bypassedFeatureIds: new Set(),
  includedCapabilityIds: new Set(),
  draftFeatures: [],
  acceptedCandidateIds: new Set(),
  scopeProposalSelections: [],
  contextSwitchCostPct: null,
};

/** Explicit lifetime contract for every local hypothetical. */
export const SCENARIO_SESSION_POLICY = Object.freeze({
  navigation: "survives-same-tab-navigation",
  realityRevalidation: "retain-and-mark-stale",
  documentReload: "recover-tab-draft-and-check-current-inputs",
  newTab: "isolated-reality-session",
  reset: "clear-all-levers",
} as const);

export function scenarioIsActive(s: SuiteScenario): boolean {
  if (Object.keys(s.remainingEstimateByCapabilityId ?? {}).length) return true;
  return (
    !!s.phasedCapacityPlan ||
    s.capacityPlan !== null ||
    Object.keys(s.capacityOverrideByScope).length > 0 ||
    s.excludedItemIds.size > 0 ||
    s.includedItemIds.size > 0 ||
    s.resolvedGateIds.size > 0 ||
    Object.keys(s.decisionPlans ?? {}).length > 0 ||
    Object.keys(s.estimateOverrideByItemId).length > 0 ||
    Object.keys(s.knowledgeEstimateByCapabilityId).length > 0 ||
    Object.keys(s.capabilityStaffingById).length > 0 ||
    s.bypassedFeatureIds.size > 0 ||
    s.includedCapabilityIds.size > 0 ||
    s.draftFeatures.length > 0 ||
    s.acceptedCandidateIds.size > 0 ||
    s.scopeProposalSelections.length > 0 ||
    s.contextSwitchCostPct !== null
  );
}

// ── ONE WORLD, SEVEN SURFACES ──────────────────────────────────────────
// The suite's snapshot and its scenario live in a module store rather than in
// each instrument's local state. Two reasons, both product reasons:
//
//   1. A scenario is a statement about the PROJECT, not about the screen you
//      happened to make it on. Cutting scope and walking to Forecast to see
//      the consequence is the whole point of a suite; per-surface state made
//      that walk silently discard the hypothetical.
//   2. The payload costs a Linear round-trip. Re-fetching it on every
//      navigation made moving between instruments feel like loading pages
//      instead of turning to look at something.
//
// Deliberately not React context: useProject's signature is unchanged, so all
// seven surfaces got this by existing, and none of them had to be rewired.
//
// SHARING A SNAPSHOT IS NOT THE SAME AS FREEZING ONE. The first version of
// this store pursued (2) by never re-fetching at all -- one request per page
// load, reused for the life of the tab -- which meant a Reality change made
// in Portfolio was invisible in Forecast until the browser was refreshed.
// Two instruments were showing different worlds and calling both Reality.
//
// So the store now revalidates (see load) while still rendering what it
// already holds, and Reality and Scenario are invalidated by different
// events: persisted truth is refreshed by mutations, and a hypothetical is
// only ever discarded by the person who made it.
interface ProjectStore {
  data: ProjectPayload | null;
  loading: boolean;
  error: string | null;
  scenario: SuiteScenario;
  currentBaseline: SavedScenarioBaselineV1 | null;
  scenarioBaseline: SavedScenarioBaselineV1 | null;
  savedScenario: { id: string; name: string; revision: number } | null;
  scenarioDirty: boolean;
  recoveryNotice: string | null;
  inputVerificationError: string | null;
  draftGeneration: number;
}

let store: ProjectStore = { data: null, loading: true, error: null, scenario: EMPTY_SCENARIO, currentBaseline: null, scenarioBaseline: null, savedScenario: null, scenarioDirty: false, recoveryNotice: null, inputVerificationError: null, draftGeneration: 0 };
let recoveryAttempted = false;

function persistDraft() {
  if (typeof window === "undefined") return;
  try {
    if (!scenarioIsActive(store.scenario)) window.sessionStorage.removeItem(SCENARIO_DRAFT_STORAGE_KEY);
    else if (store.scenarioBaseline) window.sessionStorage.setItem(SCENARIO_DRAFT_STORAGE_KEY, encodeWorkspaceDraft({
      payload: encodeSavedScenario(store.scenario),
      baseline: store.scenarioBaseline,
      saved: store.savedScenario,
      dirty: store.scenarioDirty,
      inputVerificationError: store.inputVerificationError,
    }));
  } catch {
    store = { ...store, recoveryNotice: "This browser could not keep a recovery copy. Save a named Scenario before closing or refreshing." };
  }
}

function recoverDraft() {
  if (recoveryAttempted || typeof window === "undefined") return;
  recoveryAttempted = true;
  try {
    const raw = window.sessionStorage.getItem(SCENARIO_DRAFT_STORAGE_KEY);
    if (!raw) return;
    const value = decodeWorkspaceDraft(raw);
    const scenario = decodeSavedScenario(value.payload);
    store = { ...store, scenario, scenarioBaseline: value.baseline, savedScenario: value.saved, scenarioDirty: value.dirty, inputVerificationError: value.inputVerificationError, draftGeneration: store.draftGeneration + 1, recoveryNotice: "Recovered this tab’s Scenario. Named saves are available on other devices; this recovery copy stays in this tab." };
  } catch {
    store = { ...store, recoveryNotice: "This tab’s recovery copy could not be read. It was not applied or erased. Open a named Scenario or return to Reality to clear it." };
  }
}
let inFlight: Promise<void> | null = null;
// Distinguishes "the request I am about to settle" from "a newer request has
// since replaced it", so a slow response can never null out a fresh inFlight.
let inFlightToken = 0;
// The reality revision `store.data` was fetched at. Compared against
// realityRevision() to notice that truth moved while a request was in the
// air -- see load().
let dataRevision = -1;
const listeners = new Set<() => void>();

function publish(patch: Partial<ProjectStore>) {
  store = { ...store, ...patch };
  if ("scenario" in patch || "savedScenario" in patch || "scenarioBaseline" in patch || "inputVerificationError" in patch) persistDraft();
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// force only bypasses request deduplication. A refresh never drops Scenario:
// exact capacity plans retain their baseline fingerprint and become visibly
// stale if Reality changed, rather than being silently discarded or rebased.
// Reload recovers this tab's draft and checks its saved input fingerprint.
// A fresh tab starts Reality; named server saves can be opened explicitly.
//
// Every other call is a REVALIDATION: fetch current truth, swap it in, leave
// the scenario exactly where it was. Mounting an instrument is one of these,
// and that is what keeps the suite honest -- a snapshot taken before someone
// changed Platform's capacity in Portfolio is not Reality any more, however
// recently it was fetched.
//
// Revalidation deliberately does NOT raise `loading` once we have data. The
// snapshot we already hold renders immediately and the fresh one replaces it
// when it lands, so walking between instruments still feels like turning to
// look at something rather than opening a page -- the property the module
// store was built for, now without the staleness it was paying for it with.
function load(force: boolean): Promise<void> {
  recoverDraft();
  // Dedupe concurrent revalidations. `inFlight` means a request is genuinely
  // in the air and is cleared when it settles; leaving it set after the first
  // load is what made this store permanently stale until a browser refresh.
  if (inFlight && !force) return inFlight;

  const token = ++inFlightToken;
  const startedAt = realityRevision();
  publish(store.data === null ? { loading: true, error: null } : { error: null });

  const request = (async () => {
    try {
      // Genuinely dynamic: it reads the database and Linear on every call,
      // and is now fetched repeatedly within one document rather than once
      // per page load. (HTTP caching was NOT the staleness bug -- no request
      // was being made at all -- but a repeatedly-fetched URL should say what
      // it is rather than rely on a heuristic.)
      const res = await fetch("/api/instrument/project", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't load the project model.");
      }
      const data: ProjectPayload = await res.json();
      const currentBaseline = await buildSavedScenarioBaseline(data);
      if (inFlightToken !== token) return;
      dataRevision = startedAt;
      publish({ data, currentBaseline, loading: false, inputVerificationError: null });
    } catch (err) {
      if (inFlightToken !== token) return;
      publish({ error: err instanceof Error ? err.message : "Something went wrong.", loading: false, inputVerificationError: "Signal could not verify current project inputs. Your Scenario is retained but its preview is held until a successful refresh." });
    } finally {
      if (inFlightToken === token) inFlight = null;
    }
  })().then(() => {
    // Truth moved while this request was in the air, so the body it brought
    // back was already out of date on arrival. Go again rather than settle
    // for it. Terminates because only a real persisted mutation bumps the
    // revision.
    if (inFlight === null && store.error === null && dataRevision !== realityRevision()) void load(false);
  });

  inFlight = request;
  return request;
}

/** Lightweight access for the global Scenario library; does not run simulations. */
export function useScenarioWorkspace() {
  return useSyncExternalStore(subscribe, () => store, () => store);
}

export function openSavedScenario(detail: SavedScenarioDetail) {
  publish({ scenario: decodeSavedScenario(detail.payload), scenarioBaseline: detail.baseline, savedScenario: { id: detail.id, name: detail.name, revision: detail.revision }, scenarioDirty: false, draftGeneration: store.draftGeneration + 1, inputVerificationError: "Checking this saved Scenario against current project inputs…", recoveryNotice: detail.freshness.state === "unavailable" ? detail.freshness.reason : null });
  void load(true);
}

export function recordScenarioSaved(detail: SavedScenarioDetail, savedPayloadSignature: string, draftGeneration: number) {
  const disposition = savedScenarioReplyDisposition({
    requestGeneration: draftGeneration,
    currentGeneration: store.draftGeneration,
    savedPayloadSignature,
    currentPayloadSignature: JSON.stringify(encodeSavedScenario(store.scenario)),
    responseStatus: detail.status,
  });
  if (disposition === "ignore") return;
  if (disposition === "detach-archived") {
    if (store.savedScenario?.id === detail.id) publish({ savedScenario: null, scenarioDirty: scenarioIsActive(store.scenario) });
    return;
  }
  // A save response may arrive after the operator has edited the same draft.
  publish({ savedScenario: { id: detail.id, name: detail.name, revision: detail.revision }, scenarioDirty: disposition === "attach-dirty" });
}

export function detachArchivedScenario(id: string) {
  if (store.savedScenario?.id === id) publish({ savedScenario: null, scenarioDirty: scenarioIsActive(store.scenario) });
}

export function reviewScenarioAgainstCurrentReality() {
  if (!store.currentBaseline || store.inputVerificationError) throw new Error("Current project inputs could not be verified. Refresh first.");
  // Only the overall comparison baseline changes. Individual capacity/estimate/
  // decision fingerprints remain intact and must pass their own safety checks.
  publish({ scenarioBaseline: store.currentBaseline, scenarioDirty: true, recoveryNotice: "Current sources acknowledged. Any stale staffing, estimate, or Decision assumptions still need their own review." });
}

export function resetScenarioWorkspace() {
  publish({ scenario: EMPTY_SCENARIO, scenarioBaseline: null, savedScenario: null, scenarioDirty: false, recoveryNotice: null, draftGeneration: store.draftGeneration + 1 });
}

// A persisted Reality mutation anywhere in the app revalidates the snapshot
// every instrument is reading, so a surface that is already on screen updates
// in place instead of waiting to be re-entered. Subscribed once at module
// scope: the store outlives every component that reads it.
subscribeReality(() => {
  if (store.data === null) return;
  void load(false);
});

// WHAT THE ENGINE REFUSED TO DO, said to a person rather than to a log.
//
// lib/forecast/portfolio.ts is deliberate about this: rather than looping
// forever or picking an arbitrary order it throws, naming the exact cycle or
// the exact missing edge. That is the right behaviour and it is not changed
// here — this only translates it. The engine's own message names scope IDs,
// which are meaningless in a meeting, so the caller is expected to be the
// place that maps IDs to names; the raw message is kept as the fallback so
// nothing is ever lost.
export function describeSimulationFailure(e: unknown): string {
  if (e && typeof e === "object" && "name" in e) {
    const err = e as { name?: string; message?: string; cycle?: string[]; scopeId?: string; missingDependencyId?: string };
    if (err.name === "DependencyCycleError" && err.cycle?.length) {
      return `Circular dependency: ${err.cycle.join(" → ")}. Forecasting is stopped until one of those links is removed.`;
    }
    if (err.name === "MissingDependencyError") {
      return `A project depends on "${err.missingDependencyId}", which no longer exists. Forecasting is stopped until that reference is cleared.`;
    }
    if (err.message) return err.message;
  }
  return "The forecast could not be computed for this project graph.";
}

export interface ProjectModel {
  data: ProjectPayload | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  startDate: Date | null;
  /** WHY THE FORECAST COULD NOT BE COMPUTED, in a person's words.
      Distinct from `error`, which only ever carries a fetch failure. The
      portfolio engine deliberately REFUSES to forecast a graph it cannot
      order — a circular dependency, or an edge pointing at a project that no
      longer exists — and names the exact problem. Swallowing that left every
      consuming surface on a loading state forever, which is the one failure
      mode a decision surface must never have. */
  simulationError: string | null;
  /** Atomic Scenario preview refusal. The Scenario remains staged, but every
      consumer must withhold its overlays until this is null. */
  scenarioPreviewRefusal: ScenarioPreviewRefusal | null;
  /** A shared capacity plan whose complete owner baseline no longer matches
      current Reality is retained for review but never silently rebased. */
  capacityPlanError: string | null;
  /** Reality: what the app currently accepts as true. */
  baseline: Map<string, SimulationResult> | null;
  /** Scenario: the hypothetical, or Reality when nothing is set. */
  preview: Map<string, SimulationResult> | null;
  /** The active Scenario changed since its last successful simulation. */
  previewPending: boolean;
  /** Read-only coverage of the displayed Reality or temporary Scenario. */
  coverageByScope: Map<string, ForecastCoverageContract>;
  scenario: SuiteScenario;
  setScenario: React.Dispatch<React.SetStateAction<SuiteScenario>>;
  active: boolean;
  momentumByScope: Map<string, MomentumTrend>;
  /** Latest likely date across scopes, and which scope sets it. */
  portfolioLikely: { date: Date | null; gatedBy: string | null; deltaDays: number };
  /** Per scope: where it would still land with EVERY one of its work items
      cut. The honest ceiling on what cutting scope can buy -- gates and a
      dependency's own completion survive an empty backlog. Simulated on the
      same path as everything else, under the CURRENT scenario, so a gate
      assumed resolved in Decisions correctly lowers it. */
  floorByScope: Map<string, SimulationResult> | null;
}

export function useProject(): ProjectModel {
  const snapshot = useSyncExternalStore(subscribe, () => store, () => store);
  const { data, loading, error, scenario } = snapshot;

  const reload = useCallback(() => {
    void load(true);
  }, []);

  const setScenario = useCallback<React.Dispatch<React.SetStateAction<SuiteScenario>>>((update) => {
    const next = typeof update === "function" ? update(store.scenario) : update;
    if (!scenarioIsActive(next)) { resetScenarioWorkspace(); return; }
    publish({ scenario: next, scenarioBaseline: store.scenarioBaseline ?? store.currentBaseline, scenarioDirty: true });
  }, []);

  // Entering an instrument revalidates. Whatever the suite already holds
  // renders on this same frame; if truth has moved since it was fetched, the
  // current answer replaces it a moment later, scenario untouched.
  useEffect(() => {
    return retainProjectReader(() => { void load(false); });
  }, []);

  // Cross-device coherence cannot use the in-document revision bus: Browser B
  // has a different JavaScript realm. Revalidate when it becomes visible or
  // focused, and gently while it remains open. Scenario stays local because
  // load(false) swaps only server Reality underneath it.
  useEffect(() => {
    const revalidate = () => void load(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(revalidate, 15_000);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  const startDate = useMemo(() => (data ? new Date(data.startDate) : null), [data]);

  const scenarioScopes: ScenarioInputScope[] | null = useMemo(() => {
    if (!data || !startDate) return null;
    return data.scopes.map((s) => ({
      scopeId: s.scopeId,
      items: s.forecastItems,
      gates: s.gates,
      dependsOnScopeIds: s.dependsOnScopeIds,
      explicitTeamCapacity: s.explicitTeamCapacity,
      teamCapacity: s.teamCapacity,
      capacitySource: s.capacitySource,
      startDate,
      targetDate: s.targetDate ? new Date(s.targetDate) : null,
    }));
  }, [data, startDate]);

  const capacityBaseline = useMemo(() => data ? buildCapacityPlanBaseline({
    people: data.people,
    allocations: data.allocations,
    contextSwitchCostPct: data.contextSwitchCostPct,
    scopeRevisionById: Object.fromEntries(data.scopes.map((scope) => [scope.scopeId, scope.realityState.realityRevision])),
  }) : null, [data]);
  const capacityPlanValidation = useMemo(() => {
    if (scenario.phasedCapacityPlan && capacityBaseline) {
      if (scenario.capacityPlan || Object.keys(scenario.capacityOverrideByScope).length || scenario.contextSwitchCostPct !== null) {
        return { ok: false as const, reason: "Dated staffing moves cannot be combined with an immediate staffing or switch-cost experiment. Clear one staffing experiment; nothing was discarded." };
      }
      const validation = validatePhasedCapacityPlan(scenario.phasedCapacityPlan, capacityBaseline);
      if (!validation.ok) return validation;
      const affected = new Set(phasedCapacityPlanAffectedScopeIds(scenario.phasedCapacityPlan));
      const incoherent = data?.scopes.filter(scope => affected.has(scope.scopeId) && (scope.realityState.status !== "current" || scope.realityState.computedRevision !== scope.realityState.realityRevision)) ?? [];
      return incoherent.length ? { ok: false as const, reason: `Staffing inputs are still recomputing for ${incoherent.map(scope => scope.name).join(", ")}. Wait for current Reality before trying dated moves.` } : validation;
    }
    if (!scenario.capacityPlan || !capacityBaseline) return { ok: true } as const;
    const validation = validateCapacityScenarioPlan(scenario.capacityPlan, capacityBaseline);
    if (!validation.ok) return validation;
    const affected = new Set(capacityPlanAffectedScopeIds(scenario.capacityPlan));
    const incoherent = data?.scopes.filter((scope) => affected.has(scope.scopeId) && (
      scope.realityState.status !== "current" ||
      scope.realityState.computedRevision !== scope.realityState.realityRevision
    )) ?? [];
    return incoherent.length
      ? { ok: false as const, reason: `Capacity inputs are still recomputing for ${incoherent.map((scope) => scope.name).join(", ")}. Wait for coherent Reality, then review the scenario.` }
      : validation;
  }, [scenario.capacityPlan, scenario.phasedCapacityPlan, scenario.capacityOverrideByScope, scenario.contextSwitchCostPct, capacityBaseline, data]);
  const capacityPlanError = capacityPlanValidation.ok ? null : capacityPlanValidation.reason;
  const decisionPlanError = data ? validateDecisionPlans(scenario.decisionPlans, data.decisions ?? [], data.scopes.map(scope => scope.scopeId), scenario.resolvedGateIds) : null;
  const remainingEstimateError = Object.keys(scenario.remainingEstimateByCapabilityId ?? {}).some(id => scenario.bypassedFeatureIds.has(`capability:${id}`) || scenario.scopeProposalSelections.some(row => row.targetCapabilityId === id))
    ? "A remaining-work experiment overlaps a removed card or a ticket-mapping proposal. Clear one experiment before continuing; nothing was discarded."
    : data ? remainingEstimateConflict(data.scopes, scenario.remainingEstimateByCapabilityId, [...scenario.excludedItemIds, ...scenario.includedItemIds, ...Object.keys(scenario.estimateOverrideByItemId)], Object.keys(scenario.knowledgeEstimateByCapabilityId)) : null;
  const scenarioBaselineError = scenarioIsActive(scenario) && snapshot.inputVerificationError ? snapshot.inputVerificationError : scenarioIsActive(scenario) && snapshot.scenarioBaseline && snapshot.currentBaseline && compareSavedScenarioBaseline(snapshot.scenarioBaseline, snapshot.currentBaseline).state === "stale"
    ? "Reality has changed since this Scenario was started or saved. Your edits are preserved; review the changed inputs before showing a new forecast." : null;
  const previewRefusal = useMemo<ScenarioPreviewRefusal | null>(() => scenarioBaselineError ? {
    code: "stale_scenario_baseline", message: scenarioBaselineError, action: "Open Saved Scenarios to review this draft against current Reality, or return to Reality. Named saved versions remain available.", itemIds: [],
  } : capacityPlanError ? {
    code: "invalid_capacity_plan",
    message: capacityPlanError,
    action: "Return to Reality and recreate the staffing experiment with capacity retained on each staffed project.",
    itemIds: [],
  } : remainingEstimateError ? { code: "stale_decision_plan", message: remainingEstimateError, action: "Review the remaining-work estimate in Scope.", itemIds: [] } : decisionPlanError ? { code: "stale_decision_plan", message: decisionPlanError, action: "Return to Reality and review the changed decision.", itemIds: [] } : data ? scenarioPreviewRefusal({
    scopes: data.scopes.map((scope) => ({
      scopeId: scope.scopeId,
      name: scope.name,
      itemIds: [...new Set([...scope.items, ...scope.forecastItems, ...scope.executionItems].map((item) => item.id))],
    })),
    excludedItemIds: [...scenario.excludedItemIds],
    includedItemIds: [...scenario.includedItemIds],
    estimateOverrideIds: Object.keys(scenario.estimateOverrideByItemId),
  }) : null, [data, scenario, capacityPlanError, decisionPlanError, remainingEstimateError, scenarioBaselineError]);

  const baselineAttempt = useMemo(() => {
    if (!data || !scenarioScopes) return { result: null, reason: null };
    const delta: ScenarioInputDelta = {
      allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
      hypotheticalPeople: [],
      contextSwitchCostPct: data.contextSwitchCostPct,
    };
    try {
      return { result: runPortfolioSimulation(applyScenarioInputDelta(scenarioScopes, data.people, delta)), reason: null };
    } catch (e) {
      return { result: null, reason: describeSimulationFailure(e) };
    }
  }, [data, scenarioScopes]);
  const baseline = baselineAttempt.result;

  // Scenario simulation. Scope exclusions and gate resolutions are applied by
  // FILTERING the spec's items/gates -- which is exactly what the engine
  // already means by "this work isn't in the release" and "that decision is
  // settled". An estimate override MAPS one item's three-point range to the
  // hypothetical one. All three are input substitutions on the existing spec;
  // no new math, and runPortfolioSimulation is called exactly as before.
  const [simFailure, setSimFailure] = useState<string | null>(null);
  const [failureBasis, setFailureBasis] = useState<{ data: ProjectPayload; scenario: SuiteScenario } | null>(null);
  const [preview, setPreview] = useState<Map<string, SimulationResult> | null>(null);
  const [floorByScope, setFloorByScope] = useState<Map<string, SimulationResult> | null>(null);
  const [previewBasis, setPreviewBasis] = useState<{ data: ProjectPayload; scenario: SuiteScenario } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data || !scenarioScopes) return;
    if (debounce.current) clearTimeout(debounce.current);
    const fail = (message: string) => { setSimFailure(message); setFailureBasis({ data, scenario }); };
    debounce.current = setTimeout(() => {
      if (scenarioBaselineError) { fail(scenarioBaselineError); setPreview(baseline); setFloorByScope(null); return; }
      if (remainingEstimateError) { fail(remainingEstimateError); setPreview(baseline); setFloorByScope(null); return; }
      const decisionError = validateDecisionPlans(scenario.decisionPlans, data.decisions ?? [], data.scopes.map(scope => scope.scopeId), scenario.resolvedGateIds);
      if (decisionError) {
        fail(decisionError); setPreview(baseline); setFloorByScope(null); return;
      }
      if (capacityPlanError) {
        fail(capacityPlanError);
        setPreview(baseline);
        setFloorByScope(null);
        return;
      }
      const ambiguousItemLevers = findAmbiguousScenarioItemLevers({
        scopes: data.scopes.map((scope) => ({
          scopeId: scope.scopeId,
          name: scope.name,
          itemIds: [...new Set([...scope.items, ...scope.forecastItems, ...scope.executionItems].map((item) => item.id))],
        })),
        excludedItemIds: [...scenario.excludedItemIds],
        includedItemIds: [...scenario.includedItemIds],
        estimateOverrideIds: Object.keys(scenario.estimateOverrideByItemId),
      });
      if (ambiguousItemLevers.length) {
        fail(`Scenario work-item controls are ambiguous: ${ambiguousScenarioItemLeverMessage(ambiguousItemLevers)}. The same ticket cannot be changed across multiple projects by an unscoped control. Return to Reality and remove overlapping execution ownership; no Scenario input was applied.`);
        setPreview(baseline);
        setFloorByScope(null);
        return;
      }
      // A current exact plan and report replay share resolveCapacityPlan.
      // Requested shortfalls never enter this delta. When its baseline is
      // stale, retain the plan for review but simulate Reality capacity until
      // the operator explicitly recreates it or returns to Reality.
      const delta: ScenarioInputDelta = scenario.capacityPlan && capacityPlanValidation.ok
        ? resolveCapacityPlan(scenario.capacityPlan)
        : {
            allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
            hypotheticalPeople: [],
            contextSwitchCostPct: scenario.capacityPlan
              ? data.contextSwitchCostPct
              : scenario.contextSwitchCostPct ?? data.contextSwitchCostPct,
            capacityOverrideByScope: scenario.capacityPlan ? undefined : scenario.capacityOverrideByScope,
          };
      // emptyScopeId: additionally drop every item of that one scope, which
      // is how the irreducible floor is measured -- what survives an empty
      // backlog is, by definition, what cutting scope cannot reach.
      const specsFor = (emptyScopeId?: string) =>
        applyScenarioInputDelta(
          scenarioScopes.map((s) => {
            const fullScope = data.scopes.find((scope) => scope.scopeId === s.scopeId);
            const sourceItemIds = new Set(fullScope?.items.map((item) => item.id) ?? []);
            const proposed = scenario.scopeProposalSelections.filter((selection) => selection.scopeId === s.scopeId);
            const proposalIncludedIds = new Set(proposed.flatMap((selection) => selection.itemIds));
            const proposalExcludedIds = new Set(proposed.flatMap((selection) => {
              const selected = new Set(selection.itemIds);
              const deselectedFromSameCapability = selection.sourceCapabilityId && selection.sourceCapabilityId === selection.targetCapabilityId
                ? selection.sourceAlreadyLinkedItemIds.filter((id) => !selected.has(id))
                : [];
              if (selection.releaseStatus !== "outside") return deselectedFromSameCapability;
              return [
                ...deselectedFromSameCapability,
                ...selection.itemIds,
                ...(selection.targetCapabilityId
                  ? fullScope?.capabilities.find((capability) => capability.id === selection.targetCapabilityId)?.workLinks.map((link) => link.externalId) ?? []
                : []),
              ];
            }));
            const bypassedCapabilityItemIds = new Set((fullScope?.capabilities ?? [])
              .filter((capability) => scenario.bypassedFeatureIds.has(`capability:${capability.id}`))
              .flatMap((capability) => [
                ...capability.workLinks
                  .filter((link) => (link.state === "active" || link.state === "configured") && sourceItemIds.has(link.externalId))
                  .map((link) => link.externalId),
                ...(capability.estimateReview?.estimate && (capability.estimateReview.status === "reviewed" || capability.estimateReview.exploration)
                  ? (() => { const identity = acceptedEstimateIdentity(capability.estimateReview.estimate); return [knowledgeEstimateItemId(capability.id, identity.estimateId, identity.contextSnapshotId)]; })()
                  : []),
              ]));
            // Pre-v2 raw-evidence assumptions carry no reviewed covered vs
            // additional boundary. Preserve their Scenario state for visible
            // recovery, but fail closed: they cannot alter new simulations.
            const knowledgeSubstitutions: Parameters<typeof substituteCapabilityKnowledgeEstimates>[1] = [];
            const baseItems = [
              ...(fullScope ? remainingEstimateItems(fullScope, scenario.remainingEstimateByCapabilityId) : s.items),
              ...(fullScope?.executionItems ?? [])
                .filter((item) => (scenario.includedItemIds.has(item.id) || proposalIncludedIds.has(item.id)) && !s.items.some((base) => base.id === item.id)),
            ]
              .filter((i) => !scenario.excludedItemIds.has(i.id) && !proposalExcludedIds.has(i.id) && !bypassedCapabilityItemIds.has(i.id))
              .map((i) => {
                const o = scenario.estimateOverrideByItemId[i.id];
                return o ? { ...i, low: o.low, likely: o.likely, high: o.high } : i;
              });
            return {
              ...s,
              items:
                s.scopeId === emptyScopeId
                  ? []
                  : substituteCapabilityKnowledgeEstimates(baseItems, knowledgeSubstitutions),
              gates: decisionScenarioGates(s.scopeId, s.gates, data.decisions ?? [], scenario.decisionPlans, scenario.resolvedGateIds),
            };
          }),
          data.people,
          delta
        );
      try {
        const compiledSpecs = (emptyScopeId?: string) => scenario.phasedCapacityPlan && capacityBaseline
          ? compilePhasedCapacityPlan(scenario.phasedCapacityPlan, capacityBaseline, specsFor(emptyScopeId), data.startDate.slice(0, 10))
          : specsFor(emptyScopeId);
        setPreview(runPortfolioSimulation(compiledSpecs()));
        const floors = new Map<string, SimulationResult>();
        for (const s of scenarioScopes) {
          floors.set(s.scopeId, runPortfolioSimulation(compiledSpecs(s.scopeId)).get(s.scopeId)!);
        }
        setFloorByScope(floors);
        setSimFailure(null);
        setFailureBasis(null);
        setPreviewBasis({ data, scenario });
      } catch (e) {
        // A CYCLE *CAN* REACH THIS. Two ordinary PATCHes to /api/scopes/:id
        // — A depends on B, then B depends on A — are each individually
        // valid and together close a loop the engine refuses to order. The
        // reason is surfaced rather than swallowed; a previous successful
        // forecast must not be displayed as the result of the failed draft.
        fail(describeSimulationFailure(e));
        setPreview(null);
        setFloorByScope(null);
        setPreviewBasis(null);
      }
    }, 110);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [data, scenarioScopes, scenario, capacityPlanValidation.ok, capacityPlanError, capacityBaseline, baseline, previewRefusal, remainingEstimateError, scenarioBaselineError]);

  const momentumByScope = useMemo(() => {
    const out = new Map<string, MomentumTrend>();
    if (!data) return out;
    for (const s of data.scopes) {
      if (!s.lastReport) continue;
      const b = baseline?.get(s.scopeId);
      if (!b) continue;
      const m = computeMomentum(
        { generatedAt: new Date(), likelyDate: b.likelyDate, confidenceAtTarget: b.confidenceAtTarget },
        {
          generatedAt: new Date(s.lastReport.generatedAt),
          likelyDate: new Date(s.lastReport.likelyDate),
          confidenceAtTarget: s.lastReport.confidenceAtTarget,
        }
      );
      const latest = s.reportHistory[s.reportHistory.length - 1];
      out.set(
        s.scopeId,
        computeMomentumTrend(
          m,
          latest
            ? {
                generatedAt: new Date(latest.generatedAt),
                shippedCount: latest.shippedCount,
                resolvedSinceLastCount: latest.resolvedSinceLastCount,
              }
            : null
        )
      );
    }
    return out;
  }, [data, baseline]);

  const active = scenarioIsActive(scenario);
  const basisMatches = previewBasis?.data === data && previewBasis?.scenario === scenario;
  const currentSimFailure = active && failureBasis?.data === data && failureBasis?.scenario === scenario ? simFailure : null;
  const display = selectPreviewLifecycle({ active, basisMatches, hasPreview: preview !== null, hasFailure: !!previewRefusal || !!currentSimFailure });
  const displayedPreview = display.source === "reality" ? baseline : display.source === "scenario" ? preview : null;
  const portfolioLikely = useMemo(() => {
    if (!data) return { date: null as Date | null, gatedBy: null as string | null, deltaDays: 0 };
    let active: number | null = null;
    let base: number | null = null;
    let gatedBy: string | null = null;
    for (const s of data.scopes) {
      const p = displayedPreview?.get(s.scopeId);
      const b = baseline?.get(s.scopeId);
      if (p && (active === null || p.likelyDate.getTime() > active)) {
        active = p.likelyDate.getTime();
        gatedBy = s.name;
      }
      if (b) base = Math.max(base ?? -Infinity, b.likelyDate.getTime());
    }
    return {
      date: active === null ? null : new Date(active),
      gatedBy,
      deltaDays: active !== null && base !== null ? Math.round((active - base) / 86400000) : 0,
    };
  }, [data, baseline, displayedPreview]);

  const coverageByScope = useMemo(() => data ? scenarioForecastCoverage(data.scopes, scenario, active, data.decisions) : new Map<string, ForecastCoverageContract>(), [data, scenario, active]);

  return {
    data,
    loading,
    error,
    simulationError: capacityPlanError ?? currentSimFailure ?? baselineAttempt.reason,
    scenarioPreviewRefusal: previewRefusal ?? (currentSimFailure ? { code: "invalid_capacity_plan", message: currentSimFailure, action: "Review the staged assumptions. For dated staffing, open Portfolio and adjust or clear the dated moves. No previous Scenario forecast is being displayed.", itemIds: [] } : null),
    capacityPlanError,
    reload,
    startDate,
    baseline,
    preview: displayedPreview,
    previewPending: display.pending,
    coverageByScope,
    scenario,
    setScenario,
    active,
    momentumByScope,
    portfolioLikely,
    floorByScope: basisMatches && !currentSimFailure && !previewRefusal ? floorByScope : null,
  };
}

// Shared formatting so seven surfaces can't disagree about what a date or a
// delta looks like.
export const fmtDay = (d: Date) =>
  formatDateOnly(d, { month: "short", day: "numeric" });
export const fmtFull = (d: Date) =>
  formatDateOnly(d, { month: "short", day: "numeric", year: "numeric" });
export const deltaLabel = (days: number) =>
  days === 0 ? "no change" : days < 0 ? `${Math.abs(days)}d earlier` : `${days}d later`;
export const deltaTone = (days: number) =>
  days === 0 ? "var(--i-text-soft)" : days < 0 ? "var(--i-mint)" : "var(--i-red)";
export const confidenceTone = (pct: number | null) =>
  pct === null ? "var(--i-text-faint)" : pct >= 70 ? "var(--i-mint)" : pct >= 40 ? "var(--i-amber)" : "var(--i-red)";
