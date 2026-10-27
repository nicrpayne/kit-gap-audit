import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProvisionalPlanningLink from "../components/instrument/ProvisionalPlanningLink";
import { includeProvisionalWork } from "../lib/forecast/provisional";
import { buildPlanningBrief } from "../lib/reports/planningBrief";
import { formatDateOnly } from "../lib/time/dateContract";
import { EMPTY_SCENARIO } from "../lib/instrument/useProject";
import { provisionalFixture, provisionalModel } from "./lib/provisional-fixture";

// Match the existing SSR harness: tsx uses classic JSX; Next uses automatic JSX.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const data = provisionalFixture(), sid = data.scopes[0].scopeId;
const original = structuredClone(data);
const render = (model = provisionalModel(data), scopeId?: string) => renderToStaticMarkup(<ProvisionalPlanningLink model={model} scopeId={scopeId} />);
const date = (model: ReturnType<typeof provisionalModel>) => {
  const projection = buildPlanningBrief(model, sid); assert(projection.ready);
  return formatDateOnly(projection.brief.outcome.likelyDate, { month: "short", day: "numeric", year: "numeric" });
};
const reality = provisionalModel(data), realityHtml = render(reality);
assert(realityHtml.includes(`provisional planning ~${date(reality)}`));
assert.match(realityHtml, /1 ticket modeled · 2 still unclassified/);
assert.match(realityHtml, /not a delivery commitment/);
assert.match(realityHtml, /href="\/forecast\?project=fictional-project"/);
const scenario = includeProvisionalWork(data.scopes, sid, structuredClone(EMPTY_SCENARIO), ["DEMO-2", "DEMO-3"]);
const planning = provisionalModel(data, scenario, true), scenarioHtml = render(planning);
assert.notEqual(date(planning), date(reality));
assert(scenarioHtml.includes(`provisional planning ~${date(planning)}`));
assert.match(scenarioHtml, /3 tickets modeled · 0 still unclassified/);
assert.match(scenarioHtml, /accepted Reality is unchanged/);
assert.match(scenarioHtml, /separate from a reviewed delivery report/);
assert.equal(render(reality, "fictional-other"), "");
assert.equal(render(reality, "missing"), "");
for (const overrides of [{ error: "refresh failed" }, { simulationError: "invalid" }, { scenarioPreviewRefusal: { code: "stale_scenario_baseline" as const, message: "stale", action: "review", itemIds: [] } }]) {
  assert.equal(render({ ...reality, ...overrides }), "");
}
const pending = render({ ...planning, previewPending: true });
assert.match(pending, /review provisional planning/);
assert(!pending.includes(date(planning)), "pending model cannot reuse a previous date");
const unavailable = provisionalModel(data);
unavailable.coverageByScope.set(sid, { ...data.scopes[0].forecastCoverage, state: "unavailable" });
assert.equal(render(unavailable), "");
const empty = provisionalFixture(); empty.scopes[0].forecastItems = []; empty.scopes[0].items = [];
assert.doesNotMatch(render(provisionalModel(empty)), /provisional planning ~/);
assert.deepEqual(data, original, "summaries never alter accepted data");
console.log("PASS planning link: matching dates and counts; explicit project; pending/refused/unavailable guards; Reality unchanged");
