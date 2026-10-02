/** Read-only: exercises the production adapter with the actual wiki export. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBootstrapPackage } from "../lib/bootstrap/contracts";
import { toContextPackage } from "../lib/bootstrap/refresh";
import { capabilityKnowledgeEstimates } from "../lib/scope/knowledgeEstimates";

const file = process.argv[2];
assert.ok(file, "Pass a locally compiled real bootstrap package");
const bootstrap = validateBootstrapPackage(JSON.parse(readFileSync(file, "utf8")));
const context = toContextPackage("isolated-read-only-proof", bootstrap);
assert.ok(context.intelligenceObjects!.length > 200);
assert.deepEqual(context.intelligenceMeta?.completedKnowledge, bootstrap.intelligenceMeta?.completedKnowledge);
const byId = new Map(context.intelligenceObjects!.map(o => [o.id, o]));
for (const [prefix, count] of [["risk", 9], ["unk", 6]] as const) {
  for (let index = 1; index <= count; index++) {
    assert.ok(byId.has(`hermes:${prefix}-2026-10-01-devb-${String(index).padStart(3, "0")}`), "previously omitted JSA risk/unknown is present");
  }
}
const maps = byId.get("hermes:obs-2026-10-01-devb-003")!;
for (const index of [657, 658, 659]) assert.ok(maps.evidenceRefs!.includes(`hermes-ev:2026-09-28_KE-Sprint-Planning-seg${index}`));
const quotation = context.evidence.find(e => e.id === maps.evidenceRefs![0])!;
assert.match(quotation.excerpt, /bang it out this sprint/);
assert.match(quotation.excerpt, /finish it the sprint, yes/);
assert.equal(quotation.data?.speaker_confidence, "inferred");
assert.equal(maps.fields?.estimate_covers, "remaining_work");
assert.match(String(maps.fields?.note), /calendar end.*not established/);
// Explicit test-only identity; does not create or accept any Signal capability.
const mapEvidence = capabilityKnowledgeEstimates(context, "proof-snapshot", [{ id: "jsa-maps-location", name: "Maps" }]);
assert.equal(mapEvidence.find(e => e.id === maps.id)?.sourceWorkMeaning, "remaining");
assert.equal(mapEvidence.find(e => e.id === maps.id)?.range, null, "ambiguous sprint is not an invented day range");
const notifications = byId.get("hermes:obs-2026-10-01-devb-002")!;
assert.match(String(notifications.fields?.capability_name), /all channels/i);
assert.match(String(notifications.fields?.note), /not.*(?:10\/31|31 October|in-app)/i);
console.log(JSON.stringify({ ok: true, packageId: bootstrap.packageId, heads: context.intelligenceObjects!.length, evidence: context.evidence.length, claims: context.derivedClaims?.length, recoveredJsaRisksAndUnknowns: 15, mapsQuoteEndPreserved: true, remainingWorkPreserved: true, noInventedEstimate: true, originalSourceQualifiersPreserved: true, knowledgeVersion: context.intelligenceMeta?.completedKnowledge }, null, 2));
