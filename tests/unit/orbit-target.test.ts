import assert from "node:assert/strict";
import { test } from "node:test";
import { currentWorkFixture, provisionalModel } from "../../scripts/lib/provisional-fixture";
import { adaptOrbitInput } from "../../lib/orbit/adapt";
import { buildOrbitGraph } from "../../lib/orbit/graph";
import { toDateOnly } from "../../lib/time/dateContract";
import { forecastDateAtDay } from "../../lib/forecast/simulate";

test("Orbit and Forecast share the exact target and target confidence across non-midnight starts", () => {
  for (const start of [
    "2026-11-03T00:00:00Z",
    "2026-11-03T18:00:00Z",
    "2026-11-03T23:30:00-06:00",
    "2026-11-03T03:30:00+11:00",
  ]) {
    const data = currentWorkFixture();
    data.startDate = start;
    const model = provisionalModel(data);
    const focusScopeId = data.scopes[0].scopeId;
    const input = adaptOrbitInput({
      data,
      scenario: model.scenario,
      scenarioActive: false,
      decisions: [],
      preview: model.preview!,
      baseline: model.baseline!,
      focusScopeId,
    });
    assert(input);
    const graph = buildOrbitGraph(input);
    const centre = graph.nodes.find((node) => node.kind === "forecast");
    assert(centre?.kind === "forecast");
    const forecast = model.preview!.get(focusScopeId)!;
    assert.equal(centre.targetDate, "2026-11-15", start);
    assert.equal(
      centre.targetDay,
      (Date.parse("2026-11-15") - Date.parse(start)) / 86400000,
      start,
    );
    assert.equal(centre.confidenceAtTarget, forecast.confidenceAtTarget, start);
    assert.equal(
      toDateOnly(forecastDateAtDay(new Date(start), centre.p50)),
      toDateOnly(forecast.likelyDate),
      start,
    );
  }
});
