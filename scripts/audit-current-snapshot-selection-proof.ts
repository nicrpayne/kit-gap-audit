import assert from "node:assert/strict";
import type { ContextSnapshot, Scope } from "@prisma/client";
import { selectCurrentSnapshotFromHistory } from "../lib/audit/currentSnapshotSelection";
import { projectIntelligence } from "../lib/audit/intelligence";
import { projectRequirements } from "../lib/audit/requirements";
import { buildTruthMap } from "../lib/audit/truth";
import { contextCapabilityAdmissionReason } from "../lib/bootstrap/capabilityAdmission";

const packageA = {
  sources: [{ sourceRef: "requirements-a", role: "requirements_of_record", status: "active" }],
  evidence: [{ id: "requirement-a", sourceRef: "requirements-a", kind: "row", excerpt: "Receipt history is required." }],
  intelligenceObjects: [{
    id: "receipt-history",
    intelligenceType: "Capability",
    trust: "external_intelligence",
    statement: "Receipt history is part of the handoff.",
    isCurrent: true,
    scope: ["qa"],
    evidenceRefs: [],
  }],
};

const packageB = {
  sources: [{ sourceRef: "requirements-b", role: "requirements_of_record", status: "active" }],
  evidence: [{ id: "requirement-b", sourceRef: "requirements-b", kind: "row", excerpt: "Changed handoff timing is required." }],
  derivedClaims: [{
    id: "candidate-b",
    kind: "capability",
    statement: "Consider a handoff notification.",
    evidenceRefs: [],
    extra: { candidateKey: "candidate-b", intelligenceRefs: ["opportunity-b"] },
  }],
  intelligenceObjects: [
    {
      id: "opportunity-b",
      intelligenceType: "Opportunity",
      trust: "external_intelligence",
      statement: "A notification might help.",
      isCurrent: true,
      status: "open",
      scope: ["qa"],
      evidenceRefs: [],
      fields: {},
    },
    {
      id: "prior-b",
      intelligenceType: "Commitment",
      trust: "external_intelligence",
      statement: "An earlier handoff target.",
      isCurrent: false,
      status: "open",
      scope: ["qa"],
      evidenceRefs: [],
    },
  ],
};

const snapshot = (id: string, createdAt: string, packageBody: object): ContextSnapshot => ({
  id,
  scopeId: "scope",
  packageId: `package-${id}`,
  packageVersion: "1.1",
  producer: "gap_app",
  package: packageBody as ContextSnapshot["package"],
  contextHash: `hash-${id}`,
  completenessSummary: {},
  createdAt: new Date(createdAt),
});

const a = snapshot("snapshot-a", "2026-07-01T00:00:00.000Z", packageA);
const b = snapshot("snapshot-b", "2026-10-08T00:00:00.000Z", packageB);
const history = [b, a];

assert.equal(selectCurrentSnapshotFromHistory(history, a.id), a, "A is selected even though B was created later");
assert.equal(selectCurrentSnapshotFromHistory(history, b.id), b, "B is selected when the pointer moves to B");
assert.equal(selectCurrentSnapshotFromHistory(history, a.id), a, "restoring A restores the same immutable snapshot");
assert.equal(selectCurrentSnapshotFromHistory(history, null), null, "no current package never falls back to history");
assert.throws(
  () => selectCurrentSnapshotFromHistory(history, "missing-materialization"),
  /Current knowledge is still being processed/,
  "a selected package without its materialized snapshot fails closed"
);

const selectedB = selectCurrentSnapshotFromHistory(history, b.id)!;
const intelligenceB = projectIntelligence([
  { id: selectedB.id, scopeId: selectedB.scopeId, package: selectedB.package },
], "scope");
const requirementsB = projectRequirements([
  { id: selectedB.id, scopeId: selectedB.scopeId, package: selectedB.package },
]);
assert.equal(intelligenceB.objects.some((object) => object.externalId === "receipt-history"), false, "a head omitted by B is not revived from A");
assert.equal(intelligenceB.objects.find((object) => object.externalId === "opportunity-b")?.isCurrent, true, "B's current external Opportunity remains visible");
assert.equal(intelligenceB.objects.find((object) => object.externalId === "prior-b")?.isCurrent, false, "B's own non-head chain member remains historical");
assert.deepEqual(requirementsB.map((requirement) => requirement.evidenceId), ["requirement-b"], "only B's current requirements project");
assert.match(
  contextCapabilityAdmissionReason("refresh:candidate-b", packageB) ?? "",
  /does not explicitly name a product capability/,
  "opportunity admission refusal stays separate from snapshot currentness"
);

const scope = {
  id: "scope",
  name: "Snapshot selection proof",
  notionPageIds: [],
  figmaRefs: [],
  dependsOnScopeIds: [],
  teamCapacity: null,
} as unknown as Scope;

function model(currentSnapshot: ContextSnapshot | null) {
  return buildTruthMap({
    scope,
    findings: [],
    decisions: [],
    sources: [],
    contextDocs: [],
    snapshots: history,
    currentSnapshot,
    allocations: [],
    issues: [],
    dependsOn: [],
    lastRunAt: null,
    priorRunAt: null,
    staleAfterDays: 21,
    now: new Date("2026-10-08T12:00:00.000Z"),
  });
}

const hermesA = model(a).lanes.find((lane) => lane.id === "hermes")!;
const hermesB = model(b).lanes.find((lane) => lane.id === "hermes")!;
const hermesRestoredA = model(a).lanes.find((lane) => lane.id === "hermes")!;
const hermesMissing = model(null).lanes.find((lane) => lane.id === "hermes")!;

assert.equal(hermesA.checkpoints.find((checkpoint) => checkpoint.id === "hermes:fresh")?.state, "drift");
assert.equal(hermesB.checkpoints.find((checkpoint) => checkpoint.id === "hermes:fresh")?.state, "verified");
assert.match(hermesA.checkpoints.find((checkpoint) => checkpoint.id === "hermes:fresh")?.detail ?? "", /^current package accepted/);
assert.deepEqual(hermesRestoredA, hermesA, "A/B/A restores the same knowledge supply and freshness reading");
assert.equal(hermesMissing.supplied, false, "historical rows do not make current knowledge look supplied");
assert.match(
  hermesB.checkpoints.find((checkpoint) => checkpoint.id === "hermes:supplied")?.detail ?? "",
  /^1 current context snapshot/,
  "current supply counts the selected snapshot, not immutable history"
);

console.log("PASS audit current snapshot selection: pointer-owned A/B/A, fail-closed missing materialization, current Hermes supply/freshness");
