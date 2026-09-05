import type { DecisionBriefOwnerInputs } from "../../lib/reports/decisionBrief";

const NOW = "2026-09-04T15:00:00.000Z";

export function healthyOwnerFixture(): DecisionBriefOwnerInputs {
  return {
    generatedAt: NOW,
    mode: "reality",
    scenarioId: null,
    project: { id: "jsa", name: "JSA", targetDate: "2026-11-15T00:00:00.000Z", asOf: NOW },
    context: {
      snapshotId: "ctx-current",
      packageId: "pkg-current",
      asOf: "2026-09-04T14:45:00.000Z",
      currentness: "current",
      missingSources: [],
      warnings: [],
    },
    forecast: {
      sourceId: "forecast-jsa-20260904",
      asOf: NOW,
      earliestDate: "2026-10-20T00:00:00.000Z",
      likelyDate: "2026-11-01T00:00:00.000Z",
      latestDate: "2026-11-18T00:00:00.000Z",
      confidenceAtTarget: 78,
      remainingIssueCount: 12,
      unticketedFindingCount: 1,
      remainingEffortDays: { low: 25, likely: 38, high: 57 },
      decisionDelayDays: { low: 1, likely: 3, high: 6 },
      scenarios: [{ id: "resolve-decisions", label: "Resolve the open blocking decision", likelyDate: "2026-10-29T00:00:00.000Z", deltaDays: -3, confidenceAtTarget: 84 }],
    },
    previousReport: { id: "report-prior", generatedAt: "2026-08-28T15:00:00.000Z", likelyDate: "2026-11-03T00:00:00.000Z", confidenceAtTarget: 73 },
    audit: {
      comparisonCurrentness: "current",
      warnings: [],
      prior: {
        runId: "audit-prior",
        asOf: "2026-08-28T14:00:00.000Z",
        sourceId: null,
        contextSnapshotId: "ctx-prior",
        findings: [
          { id: "finding-old", type: "risk", title: "Provider timing is unclear", status: "open", severity: "medium", createdAt: "2026-08-28T14:00:00.000Z", resolvedAt: null, sourceId: null, contextSnapshotId: "ctx-prior", evidenceRefs: ["passage-old"], matchedIssues: [] },
        ],
      },
      current: {
        runId: "audit-current",
        asOf: "2026-09-04T14:50:00.000Z",
        sourceId: null,
        contextSnapshotId: "ctx-current",
        findings: [
          { id: "finding-old-current", type: "risk", title: "Provider timing is unclear", status: "resolved", severity: "medium", createdAt: "2026-09-04T14:50:00.000Z", resolvedAt: "2026-09-04T14:55:00.000Z", sourceId: null, contextSnapshotId: "ctx-current", evidenceRefs: ["passage-old-current"], matchedIssues: [] },
          { id: "finding-new", type: "missing_work", title: "Migration rehearsal has no ticket", status: "open", severity: "high", createdAt: "2026-09-04T14:50:00.000Z", resolvedAt: null, sourceId: null, contextSnapshotId: "ctx-current", evidenceRefs: ["passage-42"], matchedIssues: [] },
        ],
      },
    },
    delivery: { shipped: [{ identifier: "SOF-401", title: "Ship intake validation" }] },
    decisions: [
      { id: "decision-ungated", scopeId: "jsa", title: "Which address format should be canonical?", status: "open", owner: "Nic", neededBy: "2026-09-10T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z", evidenceCount: 2, gate: null },
      {
        id: "decision-gated",
        scopeId: "jsa",
        title: "When does the platform cutover begin?",
        status: "open",
        owner: "Nic",
        neededBy: "2026-09-08T00:00:00.000Z",
        createdAt: "2026-09-01T00:00:00.000Z",
        evidenceCount: 1,
        gate: { id: "gate-cutover", targetScopeId: "platform", targetScopeName: "Platform", dependency: "Platform cutover cannot begin until the operating choice is made", evidenceForGate: "Architecture review passage 7", low: 1, likely: 3, high: 6, serial: true, provenance: "manual" },
      },
      { id: "decision-decided", scopeId: "jsa", title: "Which queue?", status: "decided", owner: "Nic", neededBy: null, createdAt: "2026-08-01T00:00:00.000Z", evidenceCount: 1, gate: null },
    ],
    dependencies: [{ scopeId: "platform", name: "Platform", likelyDate: null, currentness: "unavailable" }],
    capacity: {
      source: "allocations",
      status: "named_exact",
      reconciles: true,
      workforceFte: 2,
      namedRawFte: 1.5,
      namedEffectiveFte: 1.4,
      forecastEffectiveFte: 1.4,
      contextSwitchCostPct: 10,
      contributors: [
        { personId: "nic", name: "Nic", rawFte: 1, effectiveFte: 1, scopeCount: 1 },
        { personId: "sam", name: "Sam", rawFte: 0.5, effectiveFte: 0.4, scopeCount: 2 },
      ],
      asOf: NOW,
    },
    timeline: {
      asOf: NOW,
      events: [
        { id: "milestone-next", title: "Release candidate", date: "2026-09-20T00:00:00.000Z", endDate: null, temporalState: "planned", sourceLabel: "Committed plan" },
      ],
    },
    kitConstructAvailable: true,
  };
}

export function staleEvidenceFixture(): DecisionBriefOwnerInputs {
  const fixture = healthyOwnerFixture();
  fixture.context.currentness = "stale";
  fixture.context.missingSources = ["Figma · release flow", "Provider readiness sheet"];
  fixture.context.warnings = ["Notion read failed; cached context is not treated as current."];
  return fixture;
}

export function ungatedDecisionFixture(): DecisionBriefOwnerInputs {
  const fixture = healthyOwnerFixture();
  fixture.decisions = [fixture.decisions[0]];
  fixture.forecast.decisionDelayDays = { low: 0, likely: 0, high: 0 };
  return fixture;
}

export function gatedDecisionFixture(): DecisionBriefOwnerInputs {
  const fixture = healthyOwnerFixture();
  fixture.decisions = [fixture.decisions[1]];
  return fixture;
}

export function liveDiffersFromHistoryFixture(): DecisionBriefOwnerInputs {
  const fixture = healthyOwnerFixture();
  fixture.previousReport = { id: "report-history", generatedAt: "2026-08-01T00:00:00.000Z", likelyDate: "2026-09-01T00:00:00.000Z", confidenceAtTarget: 91 };
  return fixture;
}

export function missingNamedCapacityFixture(): DecisionBriefOwnerInputs {
  const fixture = healthyOwnerFixture();
  fixture.capacity = {
    source: "inferred",
    status: "legacy_inferred_unstaffed",
    reconciles: false,
    workforceFte: 0,
    namedRawFte: 0,
    namedEffectiveFte: 0,
    forecastEffectiveFte: 4,
    contextSwitchCostPct: 0,
    contributors: [],
    asOf: NOW,
  };
  return fixture;
}

export const namedCapacityFixture = healthyOwnerFixture;
export const auditDeltaFixture = healthyOwnerFixture;

export function weakGroundingFixture(): DecisionBriefOwnerInputs {
  const fixture = healthyOwnerFixture();
  fixture.audit.current!.findings[1].evidenceRefs = [];
  return fixture;
}

export function pivotPrototypeFixture(): DecisionBriefOwnerInputs {
  const fixture = missingNamedCapacityFixture();
  fixture.kitConstructAvailable = false;
  fixture.decisions = [fixture.decisions[0]];
  fixture.dependencies = [];
  return fixture;
}
