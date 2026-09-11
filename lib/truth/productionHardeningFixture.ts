import type { DecisionRow } from "@/lib/decisions/model";
import type { ProjectPayload, ProjectScope } from "@/lib/instrument/useProject";
import type { ForecastSnapshot, TimelineLane } from "@/lib/timeline/entries";

/** The permanent adversarial world for live-owner/currentness/coverage
 * reconciliation. These dates and counts are fixed so every instrument is
 * asked the same question and test output never depends on the wall clock. */
export const PRODUCTION_HARDENING_FIXTURE = {
  id: "production-hardening-2-live-truth-v1",
  now: "2026-09-06T03:03:40.000Z",
  forecastAsOf: "2026-08-05T12:00:00.000Z",
  rawLikelyValue: "2026-09-18T03:03:40.000Z",
  likelyDate: "2026-09-18",
  historicalReportAsOf: "2026-08-01T12:00:00.000Z",
  audit: {
    objects: 438,
    relationships: 543,
    protectedFingerprint: "5a798edc490b9f3c127899ad88e94aca5928ae733894f0fe813b00a1ff562961",
  },
} as const;

const EMPTY_CAPACITY_CONTRACT: ProjectScope["capacityContract"] = {
  scopeId: "jsa",
  workforceFte: 3,
  namedRawFte: 0,
  namedEffectiveFte: 0,
  forecastEffectiveFte: 1,
  source: "inferred",
  status: "legacy_inferred_unstaffed",
  reconciles: false,
};

const scope = (
  scopeId: string,
  name: string,
  dependsOnScopeIds: string[],
  gates: ProjectScope["gates"] = []
): ProjectScope => ({
  scopeId,
  name,
  targetDate: null,
  dependsOnScopeIds,
  items: [],
  completedWork: [],
  gates,
  teamCapacity: scopeId === "jsa" ? 1 : 1,
  capacitySource: "inferred",
  explicitTeamCapacity: null,
  lastReport: scopeId === "jsa"
    ? { generatedAt: PRODUCTION_HARDENING_FIXTURE.historicalReportAsOf, likelyDate: PRODUCTION_HARDENING_FIXTURE.likelyDate, confidenceAtTarget: null }
    : null,
  reportHistory: [],
  capacityBasis: { kind: "inferred", value: 1, assignees: [], remainingIssueCount: 0, unassignedCount: 0 },
  capacityContract: { ...EMPTY_CAPACITY_CONTRACT, scopeId },
  forecastSource: {
    asOf: PRODUCTION_HARDENING_FIXTURE.forecastAsOf,
    provider: "Linear",
    temporalRole: "live",
    availability: "available",
  },
  executionSource: {
    asOf: PRODUCTION_HARDENING_FIXTURE.forecastAsOf,
    provider: "Linear",
    temporalRole: "live",
    availability: "available",
  },
  forecastCoverage: {
    state: "forecastable",
    canonicalForecast: true,
    label: "CANONICAL DELIVERY FORECAST",
    reason: null,
    caveat: null,
    reasons: [],
    census: { executionIssueCount: 1, acceptedCapabilityCount: 0, mappedAcceptedCapabilityCount: 0, openShapeDecisionCount: 0 },
  },
  forecastReadiness: { state: "ready", reason: null },
    capabilities: [],
    openShapeQuestions: [],
    executionState: "configured",
    executionDetail: null,
});

export const hardeningDecisions: DecisionRow[] = [
  {
    id: "decision-open",
    scopeId: "jsa",
    title: "Choose the operating sequence",
    status: "open",
    owner: "Nic",
    rationale: null,
    neededBy: null,
    options: [],
    chosenOption: null,
    resolution: null,
    decidedAt: null,
    dismissReason: null,
    relatedIssues: [],
    sourceFindingId: null,
    sourceClaimKey: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    gate: null,
    evidence: [],
    scope: { id: "jsa", name: "JSA", targetDate: null },
  },
  {
    id: "decision-gated",
    scopeId: "jsa",
    title: "Approve the iTrack handoff",
    status: "open",
    owner: "Nic",
    rationale: null,
    neededBy: null,
    options: [],
    chosenOption: null,
    resolution: null,
    decidedAt: null,
    dismissReason: null,
    relatedIssues: [],
    sourceFindingId: null,
    sourceClaimKey: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    evidence: [],
    scope: { id: "jsa", name: "JSA", targetDate: null },
    gate: {
      id: "gate-itrack",
      decisionId: "decision-gated",
      targetScopeId: "itrack",
      targetScope: { id: "itrack", name: "iTrack", targetDate: null },
      dependency: "iTrack delivery waits for the handoff decision.",
      evidenceForGate: "Accepted operating review note.",
      low: 1,
      likely: 2,
      high: 4,
      serial: true,
      provenance: "manual",
    },
  },
];

export const hardeningHistoricalReport: ForecastSnapshot = {
  reportId: "report-historical",
  scopeId: "jsa",
  generatedAt: PRODUCTION_HARDENING_FIXTURE.historicalReportAsOf,
  earliestDate: "2026-09-12T00:00:00.000Z",
  likelyDate: "2026-09-15T00:00:00.000Z",
  latestDate: "2026-09-22T00:00:00.000Z",
  targetDate: null,
  confidenceAtTarget: null,
  likelyDateDeltaDays: null,
  shippedCount: 0,
  blockingCount: 0,
  resolvedSinceLastCount: 0,
  summaryMarkdown: "Historical snapshot memory.",
};

export const hardeningProjectPayload: ProjectPayload = {
  startDate: PRODUCTION_HARDENING_FIXTURE.now,
  forecastSource: {
    asOf: PRODUCTION_HARDENING_FIXTURE.forecastAsOf,
    provider: "Linear",
    temporalRole: "live",
    availability: "available",
  },
  scopes: [
    scope("jsa", "JSA", ["platform"]),
    scope("platform", "Platform", []),
    scope("itrack", "iTrack", [], [{ id: "gate-itrack", label: "Approve the iTrack handoff", low: 1, likely: 2, high: 4 }]),
  ],
  people: [
    { id: "person-1", name: "Person 1", fte: 1, active: true },
    { id: "person-2", name: "Person 2", fte: 1, active: true },
    { id: "person-3", name: "Person 3", fte: 1, active: true },
  ],
  allocations: [],
  contextSwitchCostPct: 10,
  sources: [{ id: "source-jsa", kind: "transcript", title: "JSA review", scopeId: "jsa", createdAt: "2026-08-05T00:00:00.000Z" }],
  findings: [{
    id: "finding-missing-work",
    sourceId: "source-jsa",
    type: "missing_work",
    title: "Required JSA work is not represented in Linear",
    quote: "The release still needs the operating checklist.",
    rationale: "No canonical executable work item represents it.",
    severity: "high",
    estimateHint: null,
    owner: null,
    blocks: null,
    blocking: false,
    matchedIssues: [],
    status: "open",
    resolution: null,
    resolvedAt: null,
    createdAt: "2026-08-05T00:00:00.000Z",
  }],
  reports: [{
    id: hardeningHistoricalReport.reportId,
    scopeId: hardeningHistoricalReport.scopeId,
    generatedAt: hardeningHistoricalReport.generatedAt,
    likelyDate: hardeningHistoricalReport.likelyDate,
    confidenceAtTarget: hardeningHistoricalReport.confidenceAtTarget,
    likelyDateDeltaDays: hardeningHistoricalReport.likelyDateDeltaDays,
    shippedCount: hardeningHistoricalReport.shippedCount,
    blockingCount: hardeningHistoricalReport.blockingCount,
    resolvedSinceLastCount: hardeningHistoricalReport.resolvedSinceLastCount,
    summaryMarkdown: hardeningHistoricalReport.summaryMarkdown,
  }],
};

export const hardeningTimelineLanes: TimelineLane[] = hardeningProjectPayload.scopes.map((item) => ({
  scopeId: item.scopeId,
  name: item.name,
  targetDate: item.targetDate,
  dependsOnScopeIds: item.dependsOnScopeIds,
}));
