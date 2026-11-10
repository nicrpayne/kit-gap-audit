import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MixerChannel from "../components/portfolio/MixerChannel";
import ScenarioBar from "../components/portfolio/ScenarioBar";
import { readChannel, readMaster, setChannelRaw, transferBetweenChannels } from "../lib/capacity/workforce";
import { buildCapacityPlanBaseline, createCapacityScenarioPlan, parseCapacityScenarioPlan, resolveCapacityPlan } from "../lib/scenario/capacityPlan";
import { applyScenarioInputDelta } from "../lib/scenario/inputDelta";
import { scenarioCapacityDisplay } from "../lib/scenario/displayCapacity";
import { EMPTY_SCENARIO } from "../lib/instrument/useProject";
import { buildPlanningBrief, renderPlanningBrief } from "../lib/reports/planningBrief";
import { currentWorkFixture, provisionalModel } from "./lib/provisional-fixture";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const data = currentWorkFixture(), original = structuredClone(data);
const [receiver, donor] = data.scopes, sid = receiver.scopeId;
const state = { people: data.people, allocations: data.allocations };
const baseline = buildCapacityPlanBaseline({ ...state, contextSwitchCostPct: 0,
  scopeRevisionById: Object.fromEntries(data.scopes.map(s => [s.scopeId, s.realityState.realityRevision])) });
const request = setChannelRaw(state, sid, 1.5);
assert.equal(request.required, 0.5);
const shortfall = createCapacityScenarioPlan({ baseline, allocations: request.allocations, hypotheticalPeople: [], requiredByScope: { [sid]: 0.5 }, contextSwitchCostPct: 0 });
const transfer = transferBetweenChannels(state, donor.scopeId, sid, 0.5);
const moved = createCapacityScenarioPlan({ baseline, allocations: transfer.allocations, hypotheticalPeople: [], requiredByScope: {}, contextSwitchCostPct: 12 });
const hire = createCapacityScenarioPlan({ baseline,
  allocations: [...data.allocations, { personId: "explicit-hire", scopeId: sid, fraction: 1 }],
  hypotheticalPeople: [{ id: "explicit-hire", name: "Hypothetical hire", fte: 0.5, active: true, origin: "hypothetical-hire" }],
  requiredByScope: {}, contextSwitchCostPct: 0 });
const specs = data.scopes.map(s => ({ ...s, items: s.forecastItems, startDate: new Date(data.startDate), targetDate: s.targetDate ? new Date(s.targetDate) : null }));
const noop = () => {};

for (const plan of [shortfall, moved, hire, parseCapacityScenarioPlan(JSON.parse(JSON.stringify(shortfall)))]) {
  const scenario = { ...structuredClone(EMPTY_SCENARIO), capacityPlan: plan };
  const compiled = applyScenarioInputDelta(specs, data.people, resolveCapacityPlan(plan));
  const displayed = scenarioCapacityDisplay(data, scenario, sid);
  const effective = compiled.find(s => s.scopeId === sid)!.teamCapacity;
  assert.equal(displayed.capacity, effective);
  assert.equal(displayed.channel.effective, effective, "mixer/Orbit must match the engine, including split costs");
  const channel = displayed.channel;
  const html = renderToStaticMarkup(<MixerChannel index={1} view={{ ...channel, name: receiver.name, accent: "#9b8cfa", likelyDate: "Nov 5", deltaDays: 0, changed: true, gateCount: 0, completionDays: [], forecastCoverage: receiver.forecastCoverage }} faderMax={6} selected hovered={false} dimmed={false} onSelect={noop} onHover={noop} onFader={noop} onOpenSplits={noop} onOpenGates={noop} />);
  const readout = (name: string) => html.match(new RegExp(`data-shoot="channel-${name}"[^>]*>([^<]+)`))?.[1];
  assert.equal(readout("requested"), (channel.raw + channel.required).toFixed(1));
  assert.equal(readout("raw"), channel.raw.toFixed(1));
  assert.equal(readout("effective"), effective.toFixed(2));
  assert.match(html, /Requested/); assert.match(html, /Staffed/); assert.match(html, /Used by forecast/);
  if (channel.required) {
    assert.match(html, /0.5 unstaffed · not modeled/);
    assert.match(html, /aria-valuetext="1.5 FTE requested; 1.0 staffed; 0.5 unstaffed, not modeled"/);
  }
  // This fixture helper drives preview using compatibility overrides. Set those
  // to the actual compiled inputs, just as the shared Portfolio store does.
  scenario.capacityOverrideByScope = Object.fromEntries(compiled.map(s => [s.scopeId, s.teamCapacity]));
  const exportResult = buildPlanningBrief(provisionalModel(data, scenario, true), sid);
  assert(exportResult.ready);
  const input = exportResult.brief.inputs.find(s => s.scopeId === sid)!;
  assert.equal(input.modeledCapacity, effective);
  assert.equal(input.unfilledCapacityRequest, channel.required);
  assert.equal(JSON.parse(JSON.stringify(exportResult.brief)).inputs.find((s: {scopeId:string}) => s.scopeId === sid).modeledCapacity, effective);
  if (channel.required) assert.match(renderPlanningBrief(exportResult.brief), /0.5 FTE requested but unstaffed — not included in the forecast/);
}
const master = readMaster(state, data.scopes.map(s => s.scopeId), 0, { [sid]: 0.5 });
assert.equal(master.allocated, 2); assert.equal(master.effective, 2); assert.equal(master.required, 0.5); assert.equal(master.overUnder, -0.5);
assert.equal(readChannel(state, sid, 0, 0.5).raw, 1);
const bar = renderToStaticMarkup(<ScenarioBar dirty saved={false} hasPendingTargets={false} saving={false} canCommit={false} overAllocated={false} capacityLines={[{scopeId: sid, scopeName: receiver.name, realityFte: 1, scenarioFte: 1, requiredFte: 0.5}]} namedTransferCount={0} switchCostChanged={false} aggregateConversions={[]} blockedCapacityScopes={[]} blockedMoves={[]} onCommit={noop} onDiscard={noop} onOpenAllocations={noop} saveError={null} saveSummary={null} />);
assert.match(bar, /1.0 → 1.0 FTE staffed/); assert.match(bar, /0.5 unstaffed, not modeled/);
assert.deepEqual(data, original, "display, preview, and export must not change Reality");
console.log("PASS capacity display: requested/staffed/modeled separation; finite pool; donor split cost; explicit hire; restored plan; rendered controls; planning HTML/JSON; Reality preserved");
