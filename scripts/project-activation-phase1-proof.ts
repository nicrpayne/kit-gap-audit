import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileBootstrapPackage } from "../lib/bootstrap/scan";
import { aliasCollisionCorpus, contradictoryCorpus, richHistoricalCorpus, sparseCorpus } from "../lib/bootstrap/fixtures";
import { resolveRefreshDisposition } from "../lib/bootstrap/rescan";
import { validateBootstrapPackage } from "../lib/bootstrap/contracts";

const when = new Date("2026-09-06T18:00:00.000Z");
const rich = compileBootstrapPackage("bootstrap-rich", { canonicalName: "Harbor Relay", aliases: ["HR"], sourceHints: [] }, richHistoricalCorpus, when);
validateBootstrapPackage(rich, "bootstrap-rich");
assert.ok(rich.proposals.some((p) => p.kind === "source"));
assert.ok(rich.proposals.some((p) => p.kind === "person"));
assert.ok(rich.proposals.some((p) => p.kind === "capability"));
assert.ok(rich.proposals.some((p) => p.kind === "decision"));
assert.ok(rich.proposals.some((p) => p.kind === "dependency"));
assert.ok(rich.proposals.some((p) => p.kind === "milestone"));
const capability = rich.proposals.find((p) => p.kind === "capability")!;
assert.equal(capability.grounding.independentLineageRootCount, 1, "wiki repetition must not create a second root");
assert.equal(rich.evidence.find((e) => e.evidenceId === "evidence-harbor-wiki")?.independence, "derivative");

const sparse = compileBootstrapPackage("bootstrap-sparse", { canonicalName: "Cedar Note", aliases: [], sourceHints: [] }, sparseCorpus, when);
assert.ok(sparse.gaps.some((g) => g.summary === "Insufficient evidence to establish scope"));
assert.ok(!sparse.proposals.some((p) => p.kind === "capability"));

const collision = compileBootstrapPackage("bootstrap-collision", { canonicalName: "Nova Supply", aliases: ["NS"], sourceHints: [] }, aliasCollisionCorpus, when);
assert.ok(collision.ambiguities.some((a) => a.kind === "identity_collision" && a.severity === "blocking"));

const contradiction = compileBootstrapPackage("bootstrap-contradiction", { canonicalName: "Lantern Review", aliases: [], sourceHints: [] }, contradictoryCorpus, when);
assert.ok(contradiction.ambiguities.some((a) => a.kind === "contradiction"));
assert.ok(!contradiction.proposals.some((p) => p.kind === "milestone"), "postponed/no-date intelligence must not invent a date");

for (const status of ["accepted", "deferred", "rejected", "information-only"] as const) {
  const unchanged = resolveRefreshDisposition({ sourceFingerprint: "same", status, dispositionReason: "reviewed", reviewedProposal: { title: "edited" } }, "same");
  assert.equal(unchanged.status, status);
  assert.equal(unchanged.changedSincePrior, false);
}
const changed = resolveRefreshDisposition({ sourceFingerprint: "old", status: "rejected", dispositionReason: "wrong project", reviewedProposal: null }, "new");
assert.equal(changed.status, "pending");
assert.equal(changed.changedSincePrior, true);

const schema = readFileSync("prisma/schema.prisma", "utf8");
const bootstrapBlock = schema.slice(schema.indexOf("model ProjectBootstrap"));
assert.ok(!/\bscopeId\b/.test(bootstrapBlock.split("model BootstrapScanRun")[0]), "ProjectBootstrap must not reference Scope");
for (const protectedModel of ["Scope", "ContextSnapshot", "Decision", "DecisionGate", "TimelineEvent", "Person", "Allocation", "Report"]) {
  assert.ok(!rich.proposals.some((p) => p.payload.canonicalModel === protectedModel));
}

console.log(JSON.stringify({
  rich: { artifacts: rich.artifacts.length, evidence: rich.evidence.length, intelligenceHeads: rich.intelligenceHeads.length, proposals: rich.proposals.length },
  sparseGaps: sparse.gaps.length, collisionBlockers: collision.ambiguities.length,
  rescan: "accepted/deferred/rejected/information-only preserved; changed reopened",
  realityWrites: 0, forecastEffect: 0,
}, null, 2));

