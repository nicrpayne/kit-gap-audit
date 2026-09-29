import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FORECAST_PERCENTILE_COPY,
  forecastAssumptionSnapshot,
  presentForecastDeliveryClaim,
  presentPortfolioDeliveryClaim,
  presentStructuralConstraints,
} from "../lib/forecast/claims";
import type { ForecastCoverageContract } from "../lib/forecast/coverage";
import { explainScope } from "../lib/portfolio/explain";

const census: ForecastCoverageContract["census"] = {
  executionIssueCount: 1,
  modeledExecutionIssueCount: 1,
  outsideExecutionIssueCount: 0,
  unmappedExecutionIssueCount: 0,
  acceptedCapabilityCount: 1,
  mappedAcceptedCapabilityCount: 1,
  openShapeDecisionCount: 0,
  incompleteDependencyCount: 0,
};
const forecastable: ForecastCoverageContract = {
  state: "forecastable",
  canonicalForecast: true,
  label: "CANONICAL DELIVERY FORECAST",
  reason: null,
  caveat: null,
  reasons: [],
  census,
};
const subset: ForecastCoverageContract = {
  state: "modeled_subset",
  canonicalForecast: false,
  label: "FORECAST INCOMPLETE — EXECUTION COVERAGE UNRESOLVED",
  reason: "4 open product-shape Decisions",
  caveat: "Unresolved execution work is excluded.",
  reasons: [{ code: "shape_decisions_open", label: "4 open product-shape Decisions", count: 4 }],
  census: { ...census, openShapeDecisionCount: 4 },
};
const unavailable: ForecastCoverageContract = {
  state: "unavailable",
  canonicalForecast: false,
  label: "FORECAST UNAVAILABLE",
  reason: "Execution source is unavailable",
  caveat: "Signal has no reliable execution input to model.",
  reasons: [{ code: "execution_source_unavailable", label: "Execution source is unavailable", count: 1 }],
  census,
};

const full = presentForecastDeliveryClaim({
  scopeName: "Platform",
  coverage: forecastable,
  likelyDate: "Nov 4, 2026",
  targetDate: "Oct 31, 2026",
  confidenceAtTarget: 62,
});
assert.equal(full.outcome, "Likely Nov 4, 2026");
assert.equal(full.targetConfidence, "62% by Oct 31, 2026 under these assumptions; simulated frequency, not a measured real-world probability");
assert.match(full.accessibleLabel, /canonical delivery forecast/i);

const partial = presentForecastDeliveryClaim({
  scopeName: "iTrack",
  coverage: subset,
  likelyDate: "Nov 23, 2026",
  targetDate: "Oct 31, 2026",
  confidenceAtTarget: 0,
});
assert.equal(partial.outcome, "Modeled subset ~Nov 23, 2026");
assert.equal(partial.targetConfidence, "Project target confidence unavailable — incomplete coverage");
assert(!partial.accessibleLabel.includes("0%"), "a subset must not announce raw project confidence");
assert.match(partial.accessibleLabel, /4 open product-shape Decisions/);

const missing = presentForecastDeliveryClaim({
  scopeName: "Docufy",
  coverage: unavailable,
  likelyDate: "Nov 1, 2026",
  targetDate: "Oct 31, 2026",
  confidenceAtTarget: 80,
});
assert.equal(missing.outcome, "Delivery outcome unavailable");
assert.equal(missing.targetConfidence, "Project target confidence unavailable");
assert(!missing.accessibleLabel.includes("Nov 1"), "unavailable coverage withholds an outcome date");

const incompletePortfolio = presentPortfolioDeliveryClaim({
  likelyDate: "Nov 23, 2026",
  scopes: [
    { name: "Platform", coverage: forecastable },
    { name: "iTrack", coverage: subset },
  ],
});
assert.equal(incompletePortfolio.headline, "Portfolio forecast incomplete");
assert.match(incompletePortfolio.detail, /iTrack/);
assert(!incompletePortfolio.accessibleLabel.includes("Portfolio lands"));

const completePortfolio = presentPortfolioDeliveryClaim({
  likelyDate: "Nov 23, 2026",
  scopes: [{ name: "Platform", coverage: forecastable }],
});
assert.equal(completePortfolio.headline, "Portfolio lands Nov 23, 2026");

assert.equal(FORECAST_PERCENTILE_COPY.interval, "P10–P90 interval · middle 80% of simulated outcomes");
assert.match(FORECAST_PERCENTILE_COPY.p10, /10% of simulated finishes/);
assert.match(FORECAST_PERCENTILE_COPY.p50, /half on or before, half after/);
assert.match(FORECAST_PERCENTILE_COPY.p90, /10% later/);

const noConstraints = presentStructuralConstraints([], []);
assert.equal(noConstraints.summary, "No declared serial gates or dependency finish floors");
const dependencyFloor = presentStructuralConstraints([], ["Platform"]);
assert.equal(dependencyFloor.summary, "Dependency finish floor · Platform");
assert.match(dependencyFloor.detail, /own work may proceed concurrently/i);
assert.match(dependencyFloor.detail, /later of the two outcomes/i);
const dependencyExplanation = explainScope({
  scopeName: "JSA",
  deltaDays: 2,
  anonymousFteAdded: 0,
  namedFteChanged: false,
  dependsOn: [{ scopeId: "platform", name: "Platform", deltaDays: 2 }],
  dependents: [],
}).join(" ");
assert.match(dependencyExplanation, /finish floor/i);
assert(!/starts after|cannot start|moved with it/i.test(dependencyExplanation), "dependency copy must not invent start sequencing or attribution");

const assumptions = forecastAssumptionSnapshot();
assert.equal(assumptions.version, "forecast-assumptions.v1");
assert.deepEqual(assumptions.items.map((item) => item.id), [
  "risk_streams",
  "estimate_mapping",
  "remaining_work",
  "calendar",
  "pooled_capacity",
  "serial_gates",
  "dependency_finish_floors",
]);
assert.match(assumptions.items.find((item) => item.id === "calendar")!.detail, /calendar days/i);
assert.match(assumptions.items.find((item) => item.id === "pooled_capacity")!.detail, /not a task-level resource scheduler/i);

for (const path of [
  "components/instrument/ForecastDetail.tsx",
  "components/instrument/ForecastTools.tsx",
  "components/portfolio/InstrumentBay.tsx",
]) {
  const source = readFileSync(path, "utf8");
  assert(!/best to worst|earliest realistic|worst realistic/i.test(source), `${path}: no endpoint language for P10/P90`);
}
const detailSource = readFileSync("components/instrument/ForecastDetail.tsx", "utf8");
assert(!/starts after|Primary constraint|nothing structural in the way/i.test(detailSource));
assert(!/waits in every trial|waits out open/i.test(detailSource), "forecast detail must describe sampled serial delay without invented scheduling");
const toolsSource = readFileSync("components/instrument/ForecastTools.tsx", "utf8");
assert(!/Chance of finishing|Most likely finish|wall stands at this day/i.test(toolsSource), "forecast tools must use P50 and simulated-frequency language");
assert.match(toolsSource, /not a measured probability/i);
const legacyForecastViewSource = readFileSync("components/ForecastView.tsx", "utf8");
assert.match(legacyForecastViewSource, /presentForecastDeliveryClaim/, "legacy Forecast view must qualify coverage if reactivated");
assert.match(legacyForecastViewSource, /forecastAssumptionSnapshot/, "legacy Forecast view must disclose model assumptions if reactivated");
assert.match(legacyForecastViewSource, /P10/);
assert.match(legacyForecastViewSource, /P90/);
assert(!/Earliest \{|Latest \{|bettingOddsPhrase/.test(legacyForecastViewSource), "legacy Forecast view must not use endpoint or betting-odds language");
const fieldSource = readFileSync("components/portfolio/ForecastField.tsx", "utf8");
assert.match(
  fieldSource,
  /targetPct=\{s\.forecastCoverage\.canonicalForecast && targetDay !== null/,
  "an incomplete scope must not shade a full-project target-miss probability",
);
const mixerSource = readFileSync("components/portfolio/MixerChannel.tsx", "utf8");
assert.match(mixerSource, /view\.forecastCoverage\.state !== "unavailable" && \(\s*<Trace/, "an unavailable scope must not render an outcome distribution trace");
assert.match(mixerSource, /changed && view\.forecastCoverage\.state !== "unavailable" && view\.deltaDays !== 0/, "an unavailable scope must not expose delivery-date movement");
const scenarioInspectorSource = readFileSync("components/portfolio/ScenarioInspector.tsx", "utf8");
assert(!/odds behind|odds of hitting|worse odds/i.test(scenarioInspectorSource), "scenario momentum must name stored simulated target frequency, not odds");
const baySource = readFileSync("components/portfolio/InstrumentBay.tsx", "utf8");
assert.match(baySource, /Meter label="Simulated frequency"/, "portfolio meter must not present simulated frequency as unqualified confidence");
const overviewSource = readFileSync("components/instrument/OverviewWorkspace.tsx", "utf8");
assert.match(overviewSource, /presentPortfolioDeliveryClaim/, "overview headline must use the aggregate coverage presenter");
assert.match(overviewSource, /if \(!s\.forecastCoverage\.canonicalForecast\) \{/, "overview rankings must branch before calculating incomplete project confidence");
assert.match(overviewSource, /s\.forecastCoverage\.canonicalForecast && r && m\.startDate/, "upcoming rows must withhold incomplete project confidence");
assert.match(overviewSource, /Lowest project target frequency/, "overview must identify its minimum as a per-project simulated frequency");
assert(!overviewSource.includes('label="Portfolio target confidence"'), "overview must not present a minimum per-project frequency as portfolio confidence");

const finishFloorSources = [
  "components/control-room/ProjectField.tsx",
  "components/control-room/Inspector.tsx",
  "components/timeline/TimeField.tsx",
  "components/instrument/TimelineInstrument.tsx",
  "components/instrument/ScopeInstrument.tsx",
  "lib/control-room/read.ts",
  "lib/scope/constraint.ts",
  "lib/timeline/story.ts",
  "lib/reports/presentation.ts",
  "lib/audit/truth.ts",
  "components/OrbitPageClient.tsx",
  "components/ControlRoomPageClient.tsx",
  "components/control-room/CommandWorkspace.tsx",
  "lib/shell/mode.ts",
].map((path) => ({ path, source: readFileSync(path, "utf8") }));
const finishFloorSource = (path: string) => finishFloorSources.find((item) => item.path === path)!.source;
assert(!/waits on|wait on/i.test(finishFloorSource("components/control-room/ProjectField.tsx")), "project field dependencies must not imply waiting");
assert(!/label="Waits on"|it can start whenever|nothing waits on it|before the work starts|one slip here moves/i.test(finishFloorSource("components/control-room/Inspector.tsx")), "control-room dependency details must describe finish floors, not scheduling");
assert(!/waits on/i.test(finishFloorSource("components/timeline/TimeField.tsx")), "timeline lane header must describe a finish floor");
assert(!/waits on/i.test(finishFloorSource("components/instrument/TimelineInstrument.tsx")), "legacy timeline lane header must describe a finish floor");
assert(!/scope also waits on/i.test(finishFloorSource("components/instrument/ScopeInstrument.tsx")), "empty Scope truth must describe a finish floor");
assert(!/\$\{lane\.name\} waits on|What it waits on decides it|both wait on it/i.test(finishFloorSource("lib/control-room/read.ts")), "control-room rows must not imply start/wait scheduling");
assert(!/it waits on \$\{dependencyNames/i.test(finishFloorSource("lib/scope/constraint.ts")), "dominance phrase must identify a completion floor");
assert(!/Which project waits on which/i.test(finishFloorSource("lib/timeline/story.ts")), "timeline dependency hint must describe finish floors");
assert(!/Dependency accepted|detail: `waits on/i.test(finishFloorSource("lib/audit/truth.ts")), "Audit must distinguish a declared dependency from accepted truth and start scheduling");
assert(!/dependency: "Waiting on"/i.test(finishFloorSource("components/OrbitPageClient.tsx")), "Orbit dependency nodes must describe completion floors");
assert(!/Nothing waits on anything else/i.test(finishFloorSource("components/ControlRoomPageClient.tsx")), "control-room empty state must not imply start scheduling");
assert(!/Nothing waits on anything else/i.test(finishFloorSource("components/control-room/CommandWorkspace.tsx")), "command workspace empty state must not imply start scheduling");
assert(!/What is waiting on what|What waits on what/i.test(finishFloorSource("lib/shell/mode.ts")), "navigation copy must describe dependency completion floors");
const controlRoomReadSource = finishFloorSources.find(({ path }) => path === "lib/control-room/read.ts")!.source;
assert(!/If it slips, they both slip|one slip here moves/i.test(controlRoomReadSource), "shared finish floors must not claim automatic downstream movement");
const reportPresentationSource = finishFloorSources.find(({ path }) => path === "lib/reports/presentation.ts")!.source;
assert.match(reportPresentationSource, /completion floor/i);
assert.match(reportPresentationSource, /later of/i);

console.log("PASS truthful forecast claims: coverage qualification, accessibility, percentile semantics, finish floors, and assumptions");
