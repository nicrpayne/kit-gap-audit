import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { LinearIssueSummary } from "../lib/linear";
import { compileScopeProposal, type ProposalCapability } from "../lib/scope/proposal";

const args = process.argv.slice(2);
if (args[0] === "--capture" && args[1]) {
  const target = resolve(args[1]);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(0));
  console.log(`Captured ${target}`);
  process.exit(0);
}
const [projectPath, graphPath] = args;
if (!projectPath || !graphPath) throw new Error("Usage: tsx scripts/scope-v2-real-input-proof.ts <project-payload.json> <audit-graph.json>");
function readInput(path: string) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try { return readFileSync(path, "utf8"); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EAGAIN")) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  throw new Error(`Timed out reading ${path}`);
}
const project = JSON.parse(readInput(projectPath)) as Record<string, unknown>;
const graphPayload = JSON.parse(readInput(graphPath)) as Record<string, unknown>;
const scopes = project.scopes as Record<string, unknown>[];
const scope = scopes.find((item) => item.name === (process.env.SIGNAL_SCOPE_NAME ?? "JSA"));
if (!scope) throw new Error("Requested production Scope was not present in the read-only project payload.");

const execution = scope.executionItems as Record<string, unknown>[];
const issues: LinearIssueSummary[] = execution.map((item) => ({
  identifier: String(item.id),
  url: typeof item.externalUrl === "string" ? item.externalUrl : null,
  title: String(item.label).replace(new RegExp(`^${String(item.id)}\\s+`), ""),
  description: null,
  state: String(item.state ?? "Unknown"),
  stateType: "unstarted",
  estimate: typeof item.points === "number" ? item.points : null,
  assignee: typeof item.assignee === "string" ? item.assignee : null,
  labels: [],
  completedAt: null,
  updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
  parentIdentifier: typeof item.parentIdentifier === "string" ? item.parentIdentifier : null,
  parentTitle: typeof item.parentTitle === "string" ? item.parentTitle : null,
  projectName: typeof item.projectName === "string" ? item.projectName : null,
}));
const capabilities: ProposalCapability[] = (scope.capabilities as Record<string, unknown>[]).map((item) => ({
  id: String(item.id), name: String(item.name), description: typeof item.description === "string" ? item.description : null,
  status: String(item.status), revision: Number(item.revision),
  workLinks: (item.workLinks as Record<string, unknown>[]).map((link) => ({ externalId: String(link.externalId), state: String(link.state) })),
}));

const graph = graphPayload.graph as { nodes: { key: string; attributes: Record<string, unknown> }[] };
const snapshotNodes = graph.nodes.filter((node) => node.attributes.kind === "intelligence");
const latestSnapshot = snapshotNodes.sort((a, b) => String(b.attributes.acceptedAt).localeCompare(String(a.attributes.acceptedAt)))[0];
if (!latestSnapshot) throw new Error("Production graph contained no accepted ContextSnapshot.");
const snapshotId = String(latestSnapshot.key).replace(/^intelligence:/, "");
const acceptedAt = String(latestSnapshot.attributes.acceptedAt);
const intelNodes = graph.nodes.filter((node) => node.attributes.kind === "intel" && node.attributes.snapshotId === snapshotId && node.attributes.isCurrent === true);
const intelligenceObjects = intelNodes.map((node) => {
  const value = node.attributes;
  return {
    id: String(value.externalId), intelligenceType: String(value.intelligenceType), trust: String(value.trust), statement: String(value.statement),
    statementBasis: typeof value.statementBasis === "string" ? value.statementBasis : null,
    status: typeof value.dataStatus === "string" ? value.dataStatus : null,
    isCurrent: true, observedDate: typeof value.observedDate === "string" ? value.observedDate : null,
    dates: value.dates as Record<string, unknown>, scope: value.scope as string[], fields: value.fields as Record<string, unknown>,
    provenance: value.provenance as Record<string, unknown>, extra: value.extra as Record<string, unknown>,
    evidenceRefs: [],
  };
});
const contextHash = createHash("sha256").update(intelligenceObjects.map((item) => item.id).sort().join("\n")).digest("hex");
const compiled = compileScopeProposal({
  includeTriage: false,
  issues,
  capabilities,
  snapshot: {
    id: snapshotId, packageId: String(latestSnapshot.attributes.label), packageVersion: "1.1", producer: String(latestSnapshot.attributes.producer),
    contextHash, createdAt: new Date(acceptedAt), completenessSummary: { status: "unknown_from_graph_export" },
    package: {
      version: "1.1", packageId: String(latestSnapshot.attributes.label), producer: String(latestSnapshot.attributes.producer), generatedAt: acceptedAt,
      scopeId: String(scope.scopeId), sources: [], evidence: [], intelligenceObjects, intelligenceRelations: [],
      completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: ["Read-only graph export does not expose snapshot completeness internals."],
    },
  },
});

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const requested = [
  { key: "notifications", pattern: /notification/i },
  { key: "pdf_docufy", pattern: /pdf|docufy/i },
  { key: "offline", pattern: /offline/i },
  { key: "submission_job_lead_approvals", pattern: /submission|job.?lead|approval/i },
];
const shapes = requested.map(({ key, pattern }) => {
  const item = compiled.items.find((candidate) => pattern.test(candidate.title) && candidate.origins.includes("reality"));
  assert.ok(item, `${key} did not reconcile from the read-only production inputs`);
  assert.deepEqual(item.origins, ["knowledge", "reality", "linear"], `${key} did not preserve all three source origins`);
  assert.ok(item.provenance.contextRefs.length > 0, `${key} has no current Knowledge references`);
  assert.ok(item.provenance.linearParents.length > 0 && item.workItemIds.length > 0, `${key} has no corroborating Linear cluster`);
  assert.equal(item.releaseSignal, "likely_in", `${key} was not interpreted for the active V1 boundary`);
  assert.equal(item.reconciliationState, "aligned", `${key} retained a false cross-boundary conflict`);
  assert.equal(item.conflicts.length, 0, `${key} retained a release conflict without same-boundary opposition`);
  assert.equal(item.action, "link_existing", `${key} did not expose its missing work links for review`);
  return {
    key,
    title: item.title,
    origins: item.origins,
    reconciliationState: item.reconciliationState,
    releaseSignal: item.releaseSignal,
    confidence: { band: item.confidence, score: item.confidenceScore },
    action: item.action,
    linear: { parentIds: item.provenance.linearParents.map((parent) => parent.identifier), workItemIds: item.workItemIds, alreadyLinked: item.alreadyLinkedItemIds.length },
    knowledge: { referenceCount: item.provenance.contextRefs.length, kinds: [...new Set(item.provenance.contextRefs.map((ref) => ref.kind))].sort(), referenceHashes: item.provenance.contextRefs.map((ref) => hash(ref.id)).sort() },
    releaseInterpretation: {
      activeRelease: item.provenance.releaseInterpretation.activeRelease,
      activeReleaseSource: item.provenance.releaseInterpretation.activeReleaseSource,
      policy: item.provenance.releaseInterpretation.policy,
      effectiveClaims: item.provenance.releaseInterpretation.effectiveClaims.map((claim) => ({ ...claim, evidenceIdHash: hash(claim.evidenceId), evidenceId: undefined })),
      supersededClaims: item.provenance.releaseInterpretation.supersededClaims.map((claim) => ({ ...claim, evidenceIdHash: hash(claim.evidenceId), evidenceId: undefined })),
      otherBoundaryClaims: item.provenance.releaseInterpretation.otherBoundaryClaims.map((claim) => ({ ...claim, evidenceIdHash: hash(claim.evidenceId), evidenceId: undefined })),
      genericClaims: item.provenance.releaseInterpretation.genericClaims.map((claim) => ({ ...claim, evidenceIdHash: hash(claim.evidenceId), evidenceId: undefined })),
    },
    reality: item.provenance.realityCapability ? {
      idHash: hash(item.provenance.realityCapability.id),
      name: item.provenance.realityCapability.name,
      status: item.provenance.realityCapability.status,
      revision: item.provenance.realityCapability.revision,
    } : null,
    rationale: item.rationale,
    conflicts: item.conflicts,
  };
});
const unmatched = compiled.items.filter((item) => item.reconciliationState === "execution_exception").map((item) => ({
  parentId: item.provenance.linearParent?.identifier ?? null,
  workItemIds: item.workItemIds,
  titleHash: hash(item.title),
  confidence: item.confidence,
  reason: item.rationale.headline,
}));
const remainingConflicts = compiled.items.filter((item) => item.reconciliationState === "conflict").map((item) => {
  const interpretation = item.provenance.releaseInterpretation;
  const inClaims = interpretation.effectiveClaims.filter((claim) => claim.direction === "in");
  const outClaims = interpretation.effectiveClaims.filter((claim) => claim.direction === "out");
  const realityStatus = item.provenance.realityCapability?.status ?? null;
  assert.ok(interpretation.activeRelease, `${item.title} conflict has no resolved active release`);
  assert.ok(
    (inClaims.length > 0 && outClaims.length > 0)
      || (realityStatus === "accepted" && outClaims.length > 0)
      || (["outside", "future", "removed"].includes(realityStatus ?? "") && inClaims.length > 0),
    `${item.title} conflict lacks same-boundary opposing evidence`,
  );
  assert.ok(interpretation.effectiveClaims.every((claim) => claim.normalizedBoundary === compiled.sourceWatermark.activeRelease.normalizedName), `${item.title} conflict includes another release boundary`);
  return {
    title: item.title,
    activeRelease: interpretation.activeRelease,
    reality: item.provenance.realityCapability ? { status: item.provenance.realityCapability.status, revision: item.provenance.realityCapability.revision } : null,
    effectiveClaims: interpretation.effectiveClaims.map((claim) => ({ direction: claim.direction, boundary: claim.boundary, observedAt: claim.observedAt, evidenceIdHash: hash(claim.evidenceId) })),
    rule: inClaims.length && outClaims.length ? "opposing_current_same_boundary_claims" : "accepted_reality_opposes_current_same_boundary_claim",
  };
});
const artifact = {
  proof: "read_only_current_production_inputs",
  productionWrites: 0,
  capturedFrom: ["GET /api/instrument/project", "GET /api/audit/graph?scope=<redacted>&slice=detail"],
  scope: { name: String(scope.name), idHash: hash(String(scope.scopeId)) },
  sourceWatermarks: {
    linearAsOf: compiled.sourceWatermark.linearAsOf,
    linearIssueCount: compiled.sourceWatermark.linearIssueCount,
    linearClusterCount: compiled.sourceWatermark.linearClusterCount,
    snapshotIdHash: hash(snapshotId),
    contextAcceptedAt: acceptedAt,
    contextObjectCount: intelligenceObjects.length,
    contextObjectIdSetHash: contextHash,
    realityCapabilityCount: capabilities.length,
    activeRelease: compiled.sourceWatermark.activeRelease,
  },
  census: { proposalItems: compiled.items.length, ...compiled.summary, unmatchedExecutionClusters: unmatched.length },
  requestedShapes: shapes,
  remainingConflicts,
  unmatchedExecution: unmatched,
  method: compiled.compilerVersion,
  fingerprint: compiled.fingerprint,
  privacy: "Statements and personal names are omitted. Context object and Reality capability identifiers are hashed; Linear identifiers are retained as execution-system keys.",
};
const artifactPath = resolve("artifacts/scope-v2-real-input-proof.json");
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
if (process.env.SIGNAL_SCOPE_V2_OUTPUT_DIR) {
  const outputPath = resolve(process.env.SIGNAL_SCOPE_V2_OUTPUT_DIR, "scope-v2-real-input-proof.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log(JSON.stringify(artifact, null, 2));
