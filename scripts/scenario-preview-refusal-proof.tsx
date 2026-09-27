import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ScenarioPreviewRefusal from "../components/instrument/ScenarioPreviewRefusal";
import { scenarioPreviewRefusal } from "../lib/instrument/scenarioPreviewRefusal";

const scopes = [
  { scopeId: "delivery", name: "Delivery", itemIds: ["SHARED-1", "DELIVERY-1"] },
  { scopeId: "upstream", name: "Upstream", itemIds: ["SHARED-1", "UPSTREAM-1"] },
];

for (const selection of [
  { excludedItemIds: ["SHARED-1"], includedItemIds: [], estimateOverrideIds: [] },
  { excludedItemIds: [], includedItemIds: ["SHARED-1"], estimateOverrideIds: [] },
  { excludedItemIds: [], includedItemIds: [], estimateOverrideIds: ["SHARED-1"] },
]) {
  const refusal = scenarioPreviewRefusal({ scopes, ...selection });
  assert(refusal, "every ambiguous bare item lever produces the shared refusal state");
  assert.equal(refusal.code, "ambiguous_item_ownership");
  assert.deepEqual(refusal.itemIds, ["SHARED-1"]);
  assert.match(refusal.message, /Delivery, Upstream/);
}

assert.equal(scenarioPreviewRefusal({
  scopes,
  excludedItemIds: ["DELIVERY-1"],
  includedItemIds: [],
  estimateOverrideIds: [],
}), null, "a uniquely owned item preserves the normal Scenario preview");

const refusal = scenarioPreviewRefusal({
  scopes,
  excludedItemIds: ["SHARED-1"],
  includedItemIds: [],
  estimateOverrideIds: [],
})!;
const html = renderToStaticMarkup(
  <ScenarioPreviewRefusal refusal={refusal} surface="Scope" onBackToReality={() => {}} />,
);
assert.match(html, /SCENARIO PREVIEW REFUSED/);
assert.match(html, /Preview blocked · Reality baseline retained/i);
assert.match(html, /Your staged Scenario remains intact/);
assert.match(html, /No staged Scope, estimate, Capacity, delivery date, or confidence overlay is shown as applied/);
assert.match(html, /Back to Reality/);
assert.match(html, /role="alert"/);

const seams = [
  ["components/instrument/ScopeInstrument.tsx", "const productShape"],
  ["components/instrument/ForecastInstrument.tsx", "if (scope.forecastReadiness.state"],
  ["components/OrbitPageClient.tsx", "if (!graph || !m.startDate)"],
  ["components/PortfolioPageClient.tsx", "const selectedScope ="],
] as const;
for (const [path, firstOverlay] of seams) {
  const source = readFileSync(path, "utf8");
  const refusalBranch = source.indexOf("scenarioPreviewRefusal)");
  assert(refusalBranch >= 0, `${path} consumes the shared refusal state`);
  assert(refusalBranch < source.indexOf(firstOverlay), `${path} blocks before its Scenario overlay body`);
  assert(source.includes("<ScenarioPreviewRefusal"), `${path} renders the actionable shared refusal`);
}

const orbitSource = readFileSync("components/OrbitPageClient.tsx", "utf8");
assert.match(orbitSource, /if \(!m\.data \|\| !m\.preview \|\| !m\.baseline \|\| !focus \|\| m\.scenarioPreviewRefusal\) return null/,
  "Orbit does not even compose mixed Scenario nodes behind the refusal screen");
const portfolioSource = readFileSync("components/PortfolioPageClient.tsx", "utf8");
assert.match(portfolioSource, /activeCapacityPlan = !project\.scenarioPreviewRefusal/,
  "Portfolio does not run an otherwise valid Capacity overlay while the shared Scenario is refused");
const projectSource = readFileSync("lib/instrument/useProject.ts", "utf8");
assert.match(projectSource, /if \(ambiguousItemLevers\.length\)[\s\S]*setPreview\(baseline\)[\s\S]*setFloorByScope\(null\)[\s\S]*return;/,
  "the simulation still fails closed to Reality before applying any Scenario delta");

console.log("PASS: ambiguous Scenario previews remain staged but are atomically refused across Scope, Forecast, Orbit, and Portfolio.");
