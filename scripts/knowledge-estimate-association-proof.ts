/** Read-only replay of saved production inputs. No network, DB, or acceptance writes. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { toContextPackage } from "../lib/bootstrap/refresh";
import { validateBootstrapPackage } from "../lib/bootstrap/contracts";
import { freezeCapabilityEstimate } from "../lib/reports/forecastBasis";
import {
  acceptedCapabilityEstimate, auditPassageHref, capabilityKnowledgeEstimates,
  knowledgeEstimateCapabilityRefs, reviewCapabilityKnowledgeEstimate, reviewedCapabilityEstimate,
  type EstimateReviewInput,
} from "../lib/scope/knowledgeEstimates";

const [snapshotPath, instrumentPath, outputPath] = process.argv.slice(2);
assert.ok(snapshotPath && instrumentPath, "Pass the saved refresh snapshot and instrument response");
const saved = JSON.parse(readFileSync(snapshotPath, "utf8"));
const instrument = JSON.parse(readFileSync(instrumentPath, "utf8")).body;
const pkg = validateBootstrapPackage(saved.responses.bootstrap.body.activePackage.package);
const scope = instrument.scopes.find((item: { name: string }) => item.name === "JSA");
assert.ok(scope && scope.capabilities.length > 5);
const context = toContextPackage(scope.scopeId, pkg);
type Card = { id: string; name: string; workLinks: { externalId: string; state: string }[]; knowledgeEstimates: unknown[] };
type Item = { id: string; parentIdentifier: string | null };
const cards: Card[] = scope.capabilities;
const issues = [...scope.executionItems, ...scope.completedWork].map((item: Item) => ({ identifier: item.id, parentIdentifier: item.parentIdentifier }));
const refs = knowledgeEstimateCapabilityRefs(cards, issues);
const estimates = capabilityKnowledgeEstimates(context, "association-proof-snapshot", refs);
const maps = estimates.find((estimate) => estimate.id === "hermes:obs-2026-10-01-devb-003")!;
const pdf = estimates.find((estimate) => estimate.id === "hermes:obs-2026-10-01-devb-004")!;
const offline = estimates.find((estimate) => estimate.id === "hermes:obs-2026-10-01-devb-006")!;
assert.equal(maps.capabilityId, cards.find((card) => card.name === "Maps and job location")!.id);
assert.equal(pdf.capabilityId, cards.find((card) => card.name === "PDF / Docufy output")!.id);
assert.equal(offline.capabilityId, cards.find((card) => card.name === "Offline support")!.id);
assert.deepEqual([maps, pdf, offline].map((estimate) => estimate.association?.matchedWorkIds), [["SOF-735"], ["SOF-747"], ["SOF-857"]]);
assert.ok([maps, pdf, offline].every((estimate) => estimate.association?.method === "linked_work" && estimate.association.candidateCapabilityIds.length === 1));
assert.equal(maps.range, null);
assert.deepEqual(maps.rawValues, [], "a meeting date is not an effort range");
assert.equal(maps.rawShape, "unstructured");
assert.match(maps.sourceConditions!, /calendar end.*not established/);
assert.match(pdf.sourceConditions!, /Docker/);
assert.match(offline.sourceConditions!, /only the six stories/);
assert.equal(offline.rawUnit, "story_points");
assert.deepEqual(offline.rawValues, [22], "ticket identifiers and parenthesized story sizes are not range points");
assert.match(maps.passages[0].exactQuote, /finish it the sprint, yes/);
assert.ok(auditPassageHref(scope.scopeId, maps)?.includes("association-proof-snapshot"));
const notifications = estimates.filter((estimate) => estimate.id === "hermes:obs-2026-10-01-devb-002");
assert.equal(notifications.length, 2, "both in-release and out/later are included when discovering ambiguity");
assert.ok(notifications.every((estimate) => estimate.association?.candidateCapabilityIds.length === 2));

const review: EstimateReviewInput = {
  passageId: maps.passages[0].id, sourceWorkMeaning: "remaining",
  range: { low: 2, likely: 3, high: 5 }, rangeOrigin: { low: "operator", likely: "operator", high: "operator" },
  rationale: "Synthetic test interpretation, not a business estimate or inferred sprint conversion.",
  quoteSupportsInterpretation: true, coveredOpenItemIds: ["TEST-1"], additionalOpenItemIds: ["TEST-2"],
  boundaryStatement: "Synthetic boundary only. Retain conditions; exclude additional work.", reviewerDisplayName: "Local proof only",
};
const reviewContext = { capabilityRevisionAtReview: 1, currentOpenItemIds: ["TEST-1", "TEST-2"] };
for (const candidate of notifications) assert.throws(() => reviewCapabilityKnowledgeEstimate(candidate, review, reviewContext), /multiple Scope cards/);
assert.throws(() => reviewCapabilityKnowledgeEstimate(maps, { ...review, boundaryStatement: "" }, reviewContext), /source feature maps/);
assert.throws(() => reviewCapabilityKnowledgeEstimate(maps, { ...review, rangeOrigin: { low: "verbatim", likely: "operator", high: "operator" } }, reviewContext), /cannot be marked verbatim/);
const accepted = reviewCapabilityKnowledgeEstimate(maps, review, reviewContext);
assert.deepEqual(acceptedCapabilityEstimate(accepted), accepted, "frozen source binding and caveats survive JSON parsing");
const invalidUnit = structuredClone(accepted);
invalidUnit.source.rawUnit = "story_points";
invalidUnit.source.rawValues = [2, 3, 5];
invalidUnit.source.rawShape = "three_point";
invalidUnit.interpretation.rangeOrigin.low = "verbatim";
assert.equal(acceptedCapabilityEstimate(invalidUnit), null, "stored points cannot masquerade as verbatim developer days");
const frozen = freezeCapabilityEstimate(scope.scopeId, { id: maps.capabilityId, name: "Maps", revision: 1 }, accepted, ["TEST-1"]);
assert.deepEqual(frozen.estimate, accepted, "report snapshot retains exact source association, boundary and conditions");
assert.equal(frozen.auditHref, auditPassageHref(scope.scopeId, accepted));
assert.equal(reviewedCapabilityEstimate(accepted, reviewContext.currentOpenItemIds, maps)?.status, "reviewed");
assert.equal(reviewedCapabilityEstimate(accepted, reviewContext.currentOpenItemIds, { ...maps, sourceConditions: "Changed conditions" })?.status, "review_required");
assert.equal(reviewedCapabilityEstimate(accepted, reviewContext.currentOpenItemIds, { ...maps, sourceBoundary: "Changed release boundary" })?.status, "review_required");
assert.equal(reviewedCapabilityEstimate(accepted, reviewContext.currentOpenItemIds, { ...maps, association: { ...maps.association!, candidateCapabilityIds: [maps.capabilityId, "another-card"] } })?.status, "review_required");
assert.equal(reviewedCapabilityEstimate(accepted, ["TEST-1", "TEST-2", "TEST-3"], maps)?.status, "review_required");

// No fuzzy or cross-scope association, and a removed link cannot establish identity.
assert.equal(capabilityKnowledgeEstimates(context, "s", [{ id: "unrelated", name: "Map designs", workItemIds: ["OTHER-735"] }]).length, 0);
const unrelated = knowledgeEstimateCapabilityRefs([{ id: "removed", name: "Other", workLinks: [{ externalId: "SOF-1007", state: "removed" }] }], issues);
assert.deepEqual(unrelated[0].workItemIds, []);
const cycle = knowledgeEstimateCapabilityRefs([{ id: "cycle", name: "Cycle", workLinks: [{ externalId: "A-1", state: "active" }] }], [{ identifier: "A-1", parentIdentifier: "A-2" }, { identifier: "A-2", parentIdentifier: "A-1" }]);
assert.deepEqual(cycle[0].workItemIds, ["A-1", "A-2"]);
const originalEstimates = cards.map((card) => card.knowledgeEstimates);
assert.ok(originalEstimates.every((items) => items.length === 0), "reproduces original consumer failure with actual database IDs");
const before = structuredClone(instrument);
for (const card of cards) card.knowledgeEstimates = estimates.filter((estimate) => estimate.capabilityId === card.id);
const resetCandidates = structuredClone(instrument);
resetCandidates.scopes.find((item: { name: string }) => item.name === "JSA").capabilities.forEach((card: Card) => { card.knowledgeEstimates = []; });
assert.deepEqual(resetCandidates, before, "discovery changes no forecast, accepted data, capacity, tickets, or coverage");
if (outputPath) writeFileSync(outputPath, JSON.stringify(instrument, null, 2));
console.log(JSON.stringify({ pass: true, realDatabaseIds: true, candidates: estimates.map((estimate) => ({ id: estimate.id, card: estimate.capabilityId, method: estimate.association?.method, ambiguous: estimate.association!.candidateCapabilityIds.length > 1 })), unchangedForecast: true, frozenConditionsAndBinding: true, changedConditionsRequireReview: true }, null, 2));
