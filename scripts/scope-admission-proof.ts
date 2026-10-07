import assert from "node:assert/strict";
import { bootstrapCapabilityAdmissionReason, contextCapabilityAdmissionReason, explicitCapabilityName } from "../lib/bootstrap/capabilityAdmission";
import { compileBootstrapPackage } from "../lib/bootstrap/scan";
import { richHistoricalCorpus } from "../lib/bootstrap/fixtures";

const corpus = structuredClone(richHistoricalCorpus);
const original = corpus.intelligence[0];
for (const [id, fields, status] of [
  ["ordinary-title", { title: "Harbor Relay FAQ follow-up" }, "open"],
  ["ordinary-name", { name: "Harbor Relay launch discussion" }, "open"],
  ["rejected-feature", { feature: "Harbor Relay rejected feature" }, "rejected"],
  ["real-feature", { feature: "Harbor Relay search" }, "open"],
] as const) corpus.intelligence.push({ ...original, id, statement: `Harbor Relay ${id}`, fields, status });
const pkg = compileBootstrapPackage("admission", { canonicalName: "Harbor Relay", aliases: [], sourceHints: [] }, corpus, new Date("2026-10-07"));
const caps = pkg.proposals.filter(p => p.kind === "capability");
assert(caps.some(p => p.title === "Offline transfer"));
assert(caps.some(p => p.title === "Harbor Relay search"));
assert.equal(caps.length, 2);
assert(pkg.intelligenceHeads.some(h => h.intelligenceId === "ordinary-title"), "Non-feature information remains in Audit intelligence");
assert(pkg.intelligenceHeads.some(h => h.intelligenceId === "rejected-feature"));
assert.equal(explicitCapabilityName({ name: "Do not promote", title: "Nor this" }), null);
assert.equal(explicitCapabilityName({ feature_name: "Search" }), "Search");

const head = pkg.intelligenceHeads.find(h => h.intelligenceId === "ordinary-title")!;
const legacy = { ...caps[0], candidateKey: `hermes:capability:${head.intelligenceId}`, intelligenceRefs: [head.intelligenceId] };
assert.match(bootstrapCapabilityAdmissionReason(legacy, pkg)!, /does not explicitly name/);
assert.match(bootstrapCapabilityAdmissionReason({ ...legacy, intelligenceRefs: ["rejected-feature"] }, pkg)!, /no longer active|does not explicitly name/);
const snapshot = { intelligenceObjects: [{ id: head.intelligenceId, intelligenceType: "opportunity", fields: head.fields }], derivedClaims: [] };
assert.match(contextCapabilityAdmissionReason(`refresh:${legacy.candidateKey}`, snapshot)!, /does not explicitly name/);
assert.equal(contextCapabilityAdmissionReason("manual:capability:unrelated", snapshot), null, "No title similarity heuristic or manual scope override");
assert.equal(contextCapabilityAdmissionReason(`refresh:${legacy.candidateKey}`, { intelligenceObjects: [{ ...snapshot.intelligenceObjects[0], fields: { capability: "Actual feature" } }] }), null);
assert.equal(bootstrapCapabilityAdmissionReason({ ...legacy, kind: "decision" }, pkg), null, "Decision semantics remain untouched");
console.log("PASS Scope admission: typed features retained; ordinary titles, names and rejected opportunities not promoted; exact legacy identity; source evidence retained; other owners untouched");
