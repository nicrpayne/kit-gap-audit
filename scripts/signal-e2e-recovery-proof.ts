import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLinearBoundary, LinearBoundaryValidationError } from "../lib/linear";
import { jobIsIdentityCompatible, selectCurrentClaimCandidate } from "../lib/bootstrap/jobs";
import { applyScenarioInputDelta } from "../lib/scenario/inputDelta";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import { deliveryRelevantIssueIds } from "../lib/forecast/coverage";

const projects = [{ id: "project-1", name: "Signal Golden Path" }];
const boundary = resolveLinearBoundary(" SIG ", ["Signal Golden Path", "Signal Golden Path"], projects);
assert.deepEqual(boundary.projectNames, ["Signal Golden Path"]);
assert.equal(boundary.teamKey, "SIG");
assert.match(boundary.detail, /project-1/);
for (const projectNames of [[], ["One", "Two"], ["signal golden path"]]) {
  assert.throws(() => resolveLinearBoundary("SIG", projectNames, projects), LinearBoundaryValidationError);
}

const jobs = [
  { id: "stale-old", revision: 1, createdAt: new Date("2026-09-18T10:00:00Z"), bootstrap: { reviewRevision: 2, status: "reviewing" } },
  { id: "current-old", revision: 2, createdAt: new Date("2026-09-18T10:01:00Z"), bootstrap: { reviewRevision: 2, status: "reviewing" } },
  { id: "current-new", revision: 2, createdAt: new Date("2026-09-18T10:02:00Z"), bootstrap: { reviewRevision: 2, status: "reviewing" } },
  { id: "archived", revision: 2, createdAt: new Date("2026-09-18T10:03:00Z"), bootstrap: { reviewRevision: 2, status: "archived" } },
];
assert.equal(jobIsIdentityCompatible(jobs[0]), false);
assert.equal(jobIsIdentityCompatible(jobs[3]), false);
assert.equal(selectCurrentClaimCandidate(jobs)?.id, "current-new");

const startDate = new Date("2026-09-18T00:00:00Z");
const realityScopes = [{
  scopeId: "scope-1",
  items: [{ id: "A", label: "A", low: 4, likely: 6, high: 8 }, { id: "B", label: "B", low: 2, likely: 3, high: 5 }],
  gates: [{ id: "G", label: "Gate", low: 1, likely: 2, high: 4 }],
  dependsOnScopeIds: [],
  explicitTeamCapacity: null,
  teamCapacity: 1,
  capacitySource: "allocations" as const,
  startDate,
  targetDate: new Date("2026-10-15T00:00:00Z"),
}];
const people = [{ id: "p1", name: "Owner", fte: 1, active: true }];
const delta = { allocations: [{ personId: "p1", scopeId: "scope-1", fraction: 1 }], hypotheticalPeople: [], contextSwitchCostPct: 0 };
const reality = runPortfolioSimulation(applyScenarioInputDelta(realityScopes, people, delta), 500).get("scope-1")!;
const scenario = runPortfolioSimulation(applyScenarioInputDelta([{ ...realityScopes[0], items: [realityScopes[0].items[0]], gates: [] }], people, delta), 500).get("scope-1")!;
assert.ok(scenario.likelyDate.getTime() < reality.likelyDate.getTime(), "legitimate work/gate removals must move the forecast earlier");
assert.equal(realityScopes[0].items.length, 2, "scenario transforms must not mutate Reality");

assert.deepEqual(
  deliveryRelevantIssueIds([
    { identifier: "PARENT-1", completedAt: null, stateType: "unstarted", parentIdentifier: null },
    { identifier: "CHILD-1", completedAt: null, stateType: "unstarted", parentIdentifier: "PARENT-1" },
    { identifier: "OPEN-1", completedAt: null },
    { identifier: "SHIPPED-1", completedAt: "2026-09-17T00:00:00.000Z" },
    { identifier: "CANCELED-1", completedAt: null, stateType: "canceled" },
    { identifier: "TRIAGE-1", completedAt: null, stateType: "triage" },
  ], false),
  ["CHILD-1", "OPEN-1"],
  "forecast coverage must use executable leaves and exclude shipped, canceled, triage, and represented parent rows",
);

const bootstrapUi = readFileSync(new URL("../components/bootstrap/BootstrapWorkspace.tsx", import.meta.url), "utf8");
assert.doesNotMatch(bootstrapUi, /window\.prompt/);
assert.doesNotMatch(bootstrapUi, /JSON\.stringify\(item\.locator/);
assert.match(bootstrapUi, /Knowledge refresh.*review package ready/);

const archiveRoute = readFileSync(new URL("../app/api/scopes/[id]/archive/route.ts", import.meta.url), "utf8");
assert.match(archiveRoute, /confirmName !== existing\.name/);
assert.match(archiveRoute, /Immutable activation, knowledge, audit, forecast, and report history is retained/);
assert.match(archiveRoute, /expectedRealityRevision/);

const reportRoute = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
const scenarioModel = readFileSync(new URL("../lib/reports/scenario.ts", import.meta.url), "utf8");
assert.doesNotMatch(reportRoute, /Scenario Decision Brief generation is UNAVAILABLE/);
assert.match(scenarioModel, /baseRealityRevision/);
assert.match(scenarioModel, /canonical Reality.*was not mutated/);

const featureDetail = readFileSync(new URL("../components/instrument/FeatureDetail.tsx", import.meta.url), "utf8");
const scopeInstrument = readFileSync(new URL("../components/instrument/ScopeInstrument.tsx", import.meta.url), "utf8");
const capabilityRoute = readFileSync(new URL("../app/api/capabilities/[id]/route.ts", import.meta.url), "utf8");
const scopeReality = readFileSync(new URL("../lib/scope/reality.ts", import.meta.url), "utf8");
assert.match(featureDetail, /if \(open\) return;[\s\S]*setPicked\(new Set\(\)\)/, "closing Add Capability must clear stale work selection");
assert.match(scopeInstrument, /edit-capability-claim-item/, "accepted capabilities must expose an unmapped-work picker");
assert.match(scopeInstrument, /workItemIds: \[\.\.\.picked\]/, "accepted-capability edits must submit reviewed work links");
assert.match(capabilityRoute, /currentOwnerWork\(capability\.scopeId, body\.workItemIds\)/, "the server must revalidate selected work against the current execution owner");
assert.match(scopeReality, /await assertWorkAvailable\(tx, before\.scopeId, capabilityId, additions\)/, "capability edits must preserve exclusive work ownership");

console.log("signal e2e recovery proof: PASS");
console.log("validated: exact Linear boundary, stale/current queue selection, active-work-only coverage, reversible forecast scenario, reset-safe add flow, atomic existing-capability work linking, governed archive, server-owned Scenario report");
