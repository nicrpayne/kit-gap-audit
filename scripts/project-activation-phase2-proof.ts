import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildActivationManifest } from "../lib/bootstrap/activation";
import { validateBootstrapPackage } from "../lib/bootstrap/contracts";
import { richHistoricalCorpus, sparseCorpus } from "../lib/bootstrap/fixtures";
import { compileBootstrapPackage } from "../lib/bootstrap/scan";

const when = new Date("2026-09-07T12:00:00.000Z");
const rich = compileBootstrapPackage("bootstrap-rich-v2", { canonicalName: "Harbor Relay", aliases: ["HR"], ownerHint: "Morgan", sourceHints: ["harbor"] }, richHistoricalCorpus, when);
validateBootstrapPackage(rich, "bootstrap-rich-v2");
assert.equal(rich.version, "1.1");
assert.equal(rich.identity?.detectedCanonicalName, "Harbor Relay");
assert.ok(rich.relations?.some((relation) => relation.relation === "supports"));
assert.ok(rich.discovery.strategies.some((strategy) => strategy.id === "semantic" && strategy.state === "unavailable"));
assert.equal(rich.proposals.find((proposal) => proposal.kind === "capability")?.basis, "direct");
assert.equal(rich.proposals.find((proposal) => proposal.kind === "capability")?.grounding.independentLineageRootCount, 1, "derivative wiki must not count as independent corroboration");

const candidates: Array<Record<string, unknown>> = rich.proposals.map((proposal, index) => ({
  id: `candidate-${index}`,
  kind: proposal.kind,
  title: proposal.title,
  status: proposal.kind === "capability" || proposal.kind === "decision" ? "accepted" : proposal.kind === "dependency" ? "deferred" : "information-only",
  operatorAssertion: false,
  originalProposal: proposal,
  reviewedProposal: null,
  evidenceLinks: proposal.evidenceRefs.map((evidenceId) => ({ evidenceId, linkState: "attached" })),
}));
candidates.push({
  id: "candidate-manual", kind: "capability", title: "Manual safety rail", status: "accepted", operatorAssertion: true,
  originalProposal: { payload: { name: "Manual safety rail" }, evidenceRefs: [] }, reviewedProposal: null, evidenceLinks: [],
});
const manifest = buildActivationManifest({
  id: "bootstrap-rich-v2", canonicalName: "Harbor Relay", aliases: ["HR"], ownerHint: "Morgan",
  reviewRevision: 7, status: "reviewing",
  activePackage: { id: "package-row", packageId: rich.packageId, scanRunId: "scan-1", package: rich as never },
  candidates: candidates as never,
}, { expectedRevision: 7, acknowledgeProviderGaps: true, execution: { state: "not_configured" } });

assert.equal(manifest.willBecomeCanonical.capabilities.length, 2);
assert.equal(manifest.willBecomeCanonical.decisions.length, 1);
assert.equal(manifest.willBecomeCanonical.dependencies.length, 0);
assert.ok(manifest.willRemainExternal.candidates.some((candidate) => candidate.kind === "dependency"));
assert.ok(manifest.willRemainExternal.peopleNotStaffing.every((candidate) => candidate.reason?.includes("not staffing")));
assert.ok(manifest.willRemainExternal.semanticRelationsNotDependencies.some((relation) => relation.relation === "supports"));
assert.equal(manifest.forecast.state, "unavailable");
assert.equal(manifest.forecast.effectAtActivation, "none");
assert.equal(manifest.willBecomeCanonical.capabilities.find((candidate) => candidate.candidateId === "candidate-manual")?.provenance.basis, "operator_assertion");

const sparse = compileBootstrapPackage("bootstrap-sparse-v2", { canonicalName: "Cedar Note", aliases: [], sourceHints: [] }, sparseCorpus, when);
validateBootstrapPackage(sparse, "bootstrap-sparse-v2");
assert.ok(sparse.gaps.length >= 3);
assert.ok(sparse.proposals.every((proposal) => proposal.kind !== "capability"));

const schema = readFileSync("prisma/schema.prisma", "utf8");
for (const model of ["Capability", "CapabilityWorkLink", "ScopeAlias", "ScopeDependency", "ProjectActivation"]) {
  assert.match(schema, new RegExp(`model ${model}\\b`));
}
assert.match(schema, /executionState\s+String\s+@default\("configured"\)/);
assert.match(schema, /semanticState\s+String\s+@default\("event"\)/);

const activationSource = readFileSync("lib/bootstrap/activation.ts", "utf8");
assert.doesNotMatch(activationSource, /decisionGate\.create|decisionGate\.upsert/, "activation must not invent DecisionGate");
assert.match(activationSource, /TransactionIsolationLevel\.Serializable/);

console.log(JSON.stringify({
  contract: rich.version,
  identity: rich.identity,
  retrieval: rich.discovery.strategies,
  canonicalPreview: {
    capabilities: manifest.willBecomeCanonical.capabilities.length,
    decisions: manifest.willBecomeCanonical.decisions.length,
    dependencies: manifest.willBecomeCanonical.dependencies.length,
  },
  externalPreview: manifest.willRemainExternal.candidates.length,
  forecast: manifest.forecast,
  sparseGaps: sparse.gaps.length,
  geometry: "absent",
}, null, 2));
