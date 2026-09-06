import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportView from "../components/ReportView";
import { readControlRoom } from "../lib/control-room/read";
import { capacityForecastContract } from "../lib/capacity/contract";
import { decisionCounts, forecastActive } from "../lib/decisions/model";
import { buildForecastInputs } from "../lib/forecast/build";
import { sourceStampForIssues, weakestSourceStamp } from "../lib/forecast/compute";
import type { SimulationResult } from "../lib/forecast/simulate";
import { EMPTY_SCENARIO } from "../lib/instrument/useProject";
import { buildOrbitGraph, type OrbitScopeInput } from "../lib/orbit/graph";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { renderDecisionBriefMarkdown } from "../lib/reports/decisionBriefRender";
import { assertGeneratedReportProse, presentLegacyReport } from "../lib/reports/legacySanitization";
import { liveForecastReading, forecastReadingForTime } from "../lib/timeline/forecastTruth";
import { currentnessLabel, sourceCurrentness } from "../lib/truth/currentness";
import {
  PRODUCTION_HARDENING_FIXTURE as facts,
  hardeningDecisions,
  hardeningHistoricalReport,
  hardeningProjectPayload,
  hardeningTimelineLanes,
} from "../lib/truth/productionHardeningFixture";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

const day = 86_400_000;
const start = new Date(hardeningProjectPayload.startDate);
const simulation = (likelyDay = 12): SimulationResult => ({
  earliestDate: new Date(start.getTime() + 10 * day),
  likelyDate: new Date(facts.likelyDate),
  latestDate: new Date(start.getTime() + 18 * day),
  confidenceAtTarget: null,
  remainingEffortDays: { low: 0, likely: 0, high: 0 },
  decisionDelayDays: { low: 0, likely: 0, high: 0 },
  completionDaysSorted: [10, likelyDay, 18],
  percentiles: { p10: 10, p50: likelyDay, p70: 18, p85: 18, p90: 18 },
});
const simulations = new Map(hardeningProjectPayload.scopes.map((scope) => [scope.scopeId, simulation()]));

// Forecast: LIVE ownership and source currentness remain independent.
const currentness = sourceCurrentness(facts.forecastAsOf, facts.now);
assert.equal(currentness.currentness, "stale");
assert.equal(currentness.ageDays, 31);
assert.equal(currentnessLabel(currentness), "Stale · 31d");
const linearStamp = sourceStampForIssues([{
  identifier: "PLAT-1", title: "Dependency work", description: null, state: "Todo", stateType: "unstarted",
  estimate: 1, assignee: null, labels: [], completedAt: null, updatedAt: facts.forecastAsOf,
  parentIdentifier: null, parentTitle: null, projectName: "Platform",
}], new Date(facts.now));
assert.equal(linearStamp.asOf.toISOString(), facts.forecastAsOf);
assert.equal(weakestSourceStamp([
  sourceStampForIssues([], new Date(facts.now)),
  linearStamp,
], new Date(facts.now)).asOf.toISOString(), facts.forecastAsOf);

// Control Room consumes that same stamped owner read and keeps the last
// immutable Report timestamp as a separate concept.
const controlRoom = readControlRoom({
  now: new Date(facts.now),
  data: hardeningProjectPayload,
  dataReceivedAt: new Date(facts.now),
  scenario: EMPTY_SCENARIO,
  scenarioActive: false,
  preview: simulations,
  baseline: simulations,
  floorByScope: simulations,
  decisions: hardeningDecisions,
  entries: [],
  lanes: hardeningTimelineLanes,
  timelineCandidates: [],
  timelineRangeEnd: null,
});
assert.equal(controlRoom.time.forecastCurrentness, "stale");
assert.equal(controlRoom.time.forecastAgeDays, 31);
assert.equal(controlRoom.time.forecastAsOf.toISOString(), facts.forecastAsOf);
assert.equal(controlRoom.time.lastForecastAt?.toISOString(), facts.historicalReportAsOf);
assert.equal(controlRoom.choices.open, 2);
assert.equal(controlRoom.choices.gating, 1);

// Decisions: a gate is delivery-effect structure on an open Decision, not a
// mutually exclusive lifecycle status. targetScopeId owns the blocked path.
const counts = decisionCounts(hardeningDecisions);
assert.deepEqual(counts, { all: 2, open: 2, gating: 1, openNotGating: 1, decided: 0, dismissed: 0 });
assert(forecastActive(hardeningDecisions[1]));
assert.equal(hardeningDecisions[1].scopeId, "jsa");
assert.equal(hardeningDecisions[1].gate?.targetScopeId, "itrack");

// Scope/Audit coverage: an unmatched Finding remains visible evidence of a
// gap and contributes exactly zero canonical executable work.
const forecastInputs = buildForecastInputs([], hardeningProjectPayload.findings, 1);
assert.equal(forecastInputs.items.length, 0);
assert.equal(forecastInputs.unticketedFindingCount, 1);
assert.equal(forecastInputs.items.reduce((sum, item) => sum + item.likely, 0), 0);

// Capacity: the engine's legacy inferred basis is operational but must not
// masquerade as named staffing or as the scenario mixer value.
const capacity = capacityForecastContract("jsa", hardeningProjectPayload.people, [], 10, 1, "inferred");
assert.equal(capacity.forecastEffectiveFte, 1);
assert.equal(capacity.namedRawFte, 0);
assert.equal(capacity.namedEffectiveFte, 0);
assert.equal(capacity.status, "legacy_inferred_unstaffed");
assert.equal(capacity.reconciles, false);

// Dependencies: the JSA view shows its declared Platform dependency. The
// iTrack gate appears only on its canonical target path, never as JSA's gate.
const emptyComposition = { features: [], engaged: [], bypassed: [], loadDays: 0, peakLoadDays: 0, totalItems: 0, unmappedItems: 0 };
const orbitScope = (scopeId: string, name: string, dependsOnScopeIds: string[]): OrbitScopeInput => ({
  scopeId,
  name,
  targetDate: null,
  dependsOnScopeIds,
  composition: emptyComposition,
  channel: { scopeId, raw: 0, effective: 0, splitRaw: 0, splitPeople: 0, people: 0, required: 0 },
  sim: simulation(),
  realitySim: null,
});
const orbitScopes = [orbitScope("jsa", "JSA", ["platform"]), orbitScope("platform", "Platform", []), orbitScope("itrack", "iTrack", [])];
const orbitGates = [{
  gateId: "gate-itrack",
  decisionId: "decision-gated",
  decisionTitle: "Approve the iTrack handoff",
  decisionStatus: "open",
  targetScopeId: "itrack",
  low: 1,
  likely: 2,
  high: 4,
  serial: true,
  dependency: "iTrack delivery waits for the handoff decision.",
  evidenceForGate: "Accepted operating review note.",
  evidenceCount: 1,
}];
const jsaOrbit = buildOrbitGraph({ focusScopeId: "jsa", startDate: start, scopes: orbitScopes, gates: orbitGates, scenarioActive: false, resolvedGateIds: new Set() });
assert(jsaOrbit.edges.some((edge) => edge.kind === "waits_on" && edge.to === "dependency:platform"));
assert(!jsaOrbit.nodes.some((node) => node.kind === "gate"));
const iTrackOrbit = buildOrbitGraph({ focusScopeId: "itrack", startDate: start, scopes: orbitScopes, gates: orbitGates, scenarioActive: false, resolvedGateIds: new Set() });
assert(iTrackOrbit.nodes.some((node) => node.kind === "gate" && node.targetScopeId === "itrack"));
assert(iTrackOrbit.edges.some((edge) => edge.kind === "gates" && edge.to === "forecast:itrack"));

// Timeline: now reads only the stale LIVE owner; history reads only the
// immutable Report snapshot. There is no fallback between them.
const liveTimeline = liveForecastReading("jsa", facts.forecastAsOf, simulation(), null, facts.now);
assert.equal(liveTimeline.temporalRole, "live");
assert.equal(liveTimeline.currentness, "stale");
assert.equal(liveTimeline.ageDays, 31);
assert.equal(forecastReadingForTime(true, liveTimeline, hardeningHistoricalReport)?.likelyDate, facts.likelyDate);
assert.equal(forecastReadingForTime(false, liveTimeline, hardeningHistoricalReport)?.temporalRole, "historical");
assert.equal(forecastReadingForTime(true, null, hardeningHistoricalReport), null);

// Reports: renderer/view-model sanitization protects normal reading,
// Markdown and print surfaces while immutable raw bytes remain untouched.
const rawPayloads = [
  "<!DOCTYPE html><html><head><title>Linear is down</title><style>body{font:12px}</style></head><body>upstream error</body></html>",
  "<html><head><title>502 gateway error</title></head><body>Linear unavailable</body></html>",
  "<!doctype html><html><style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style><p>source fetch failed</p></html>",
];
for (const raw of rawPayloads) {
  const presentation = presentLegacyReport(raw);
  assert.equal(presentation.kind, "html_error");
  assert.equal(presentation.rawLength, raw.length);
  assert(!presentation.safeMarkdown.includes("<!DOCTYPE"));
  assert.throws(() => assertGeneratedReportProse(raw));
  const html = renderToStaticMarkup(<ReportView markdown={raw} />);
  assert(html.includes("Source fetch failed when this historical snapshot was generated"));
  assert(!html.includes("@font-face"));
  assert(!html.includes("base64"));
  assert(!html.includes("upstream error"));
}
const normalMarkdown = "# JSA\n\nA normal historical report.";
assert.equal(presentLegacyReport(normalMarkdown).safeMarkdown, normalMarkdown);
assert.doesNotThrow(() => assertGeneratedReportProse(normalMarkdown));

// Finished Brief and exported Markdown carry the same stale owner stamp.
const briefInputs = healthyOwnerFixture();
briefInputs.generatedAt = facts.now;
briefInputs.project.asOf = facts.now;
briefInputs.forecast.asOf = facts.forecastAsOf;
briefInputs.forecast.earliestDate = "2026-09-12T00:00:00.000Z";
briefInputs.forecast.likelyDate = facts.likelyDate;
briefInputs.forecast.latestDate = "2026-09-23T00:00:00.000Z";
briefInputs.forecast.remainingIssueCount = 0;
briefInputs.forecast.unticketedFindingCount = 1;
briefInputs.forecast.remainingEffortDays = { low: 0, likely: 0, high: 0 };
briefInputs.forecast.scenarios = [{ id: "same-source", label: "Same owner scenario", likelyDate: "2026-09-16T00:00:00.000Z", deltaDays: -1, confidenceAtTarget: null }];
briefInputs.previousReport = { id: hardeningHistoricalReport.reportId, generatedAt: hardeningHistoricalReport.generatedAt, likelyDate: hardeningHistoricalReport.likelyDate, confidenceAtTarget: null };
briefInputs.capacity = { source: "inferred", status: "legacy_inferred_unstaffed", reconciles: false, workforceFte: 3, namedRawFte: 0, namedEffectiveFte: 0, forecastEffectiveFte: 1, contextSwitchCostPct: 10, contributors: [], asOf: facts.now };
briefInputs.decisions = hardeningDecisions.map((decision) => ({
  id: decision.id,
  scopeId: decision.scopeId,
  title: decision.title,
  status: decision.status,
  owner: decision.owner,
  neededBy: decision.neededBy,
  createdAt: decision.createdAt,
  evidenceCount: decision.evidence.length,
  gate: decision.gate ? {
    id: decision.gate.id,
    targetScopeId: decision.gate.targetScopeId,
    targetScopeName: decision.gate.targetScope.name,
    dependency: decision.gate.dependency,
    evidenceForGate: decision.gate.evidenceForGate,
    low: decision.gate.low,
    likely: decision.gate.likely,
    high: decision.gate.high,
    serial: decision.gate.serial,
    provenance: decision.gate.provenance,
  } : null,
}));
briefInputs.dependencies = [{ scopeId: "platform", name: "Platform", likelyDate: facts.likelyDate, currentness: "stale" }];
const brief = assembleDecisionBrief(briefInputs);
assert.equal(brief.headline.likelyWindow.source.temporalRole, "live");
assert.equal(brief.headline.likelyWindow.source.currentness, "stale");
assert.equal(brief.timeline.currentForecast.source.currentness, "stale");
assert.equal(brief.movable.scenarioOptions.source.currentness, "stale");
assert(brief.caveats.value.some((caveat) => caveat.code === "FORECAST_STALE"));
const briefMarkdown = renderDecisionBriefMarkdown(brief);
assert(briefMarkdown.includes("Live Forecast · STALE · as of Aug 5, 2026"));

// Audit is in the fixture so every cross-instrument proof includes the
// protected world contract even though this tranche changes no spatial file.
assert.equal(facts.audit.objects, 438);
assert.equal(facts.audit.relationships, 543);
assert.equal(facts.audit.protectedFingerprint, "5a798edc490b9f3c127899ad88e94aca5928ae733894f0fe813b00a1ff562961");

console.log(JSON.stringify({
  fixture: facts.id,
  consumers: {
    controlRoom: { temporalRole: "live", currentness: controlRoom.time.forecastCurrentness, ageDays: controlRoom.time.forecastAgeDays, openDecisions: controlRoom.choices.open, gatingSubset: controlRoom.choices.gating },
    audit: facts.audit,
    decisions: counts,
    forecast: { temporalRole: liveTimeline.temporalRole, currentness: liveTimeline.currentness, ageDays: liveTimeline.ageDays, likelyDate: liveTimeline.likelyDate },
    capacity: { forecastBasisFte: capacity.forecastEffectiveFte, namedRawFte: capacity.namedRawFte, namedEffectiveFte: capacity.namedEffectiveFte, scenarioInputFte: 0, status: capacity.status, reconciles: capacity.reconciles },
    scope: { executableItems: forecastInputs.items.length, modeledExecutableDays: 0, openUnacceptedMissingWorkFindings: forecastInputs.unticketedFindingCount },
    dependencies: { jsaDeclaredDependency: "platform", jsaVisibleGateCount: jsaOrbit.nodes.filter((node) => node.kind === "gate").length, gateTargetScopeId: "itrack", iTrackVisibleGateCount: iTrackOrbit.nodes.filter((node) => node.kind === "gate").length },
    timeline: { nowRole: liveTimeline.temporalRole, nowCurrentness: liveTimeline.currentness, historicalRole: forecastReadingForTime(false, liveTimeline, hardeningHistoricalReport)?.temporalRole },
    reports: { currentness: brief.headline.likelyWindow.source.currentness, legacyPayloadFixtures: rawPayloads.length, generationRejectsHtml: true },
  },
}, null, 2));
