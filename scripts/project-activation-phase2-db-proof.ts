import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { activateProjectBootstrap } from "../lib/bootstrap/activation";
import { auditActivatedBootstrapRefresh } from "../lib/bootstrap/refresh";
import { computeForecast, ForecastUnavailableError } from "../lib/forecast/compute";
import { bootstrapHash } from "../lib/bootstrap/hash";
import type { CandidateDisposition, CandidateKind, ProjectBootstrapPackageV1 } from "../lib/bootstrap/contracts";

interface CandidateSeed {
  key: string;
  kind: CandidateKind;
  title: string;
  status: CandidateDisposition;
  payload: Record<string, unknown>;
  operatorAssertion?: boolean;
  evidence?: boolean;
}

async function counts() {
  const [scopes, capabilities, workLinks, decisions, gates, dependencies, milestones, aliases, snapshots, audits, findings, registrations, people, allocations, activations] = await Promise.all([
    prisma.scope.count(), prisma.capability.count(), prisma.capabilityWorkLink.count(), prisma.decision.count(), prisma.decisionGate.count(),
    prisma.scopeDependency.count(), prisma.timelineEvent.count(), prisma.scopeAlias.count(), prisma.contextSnapshot.count(),
    prisma.auditRun.count(), prisma.finding.count(), prisma.sourceRegistration.count(), prisma.person.count(), prisma.allocation.count(), prisma.projectActivation.count(),
  ]);
  return { scopes, capabilities, workLinks, decisions, gates, dependencies, milestones, aliases, snapshots, audits, findings, registrations, people, allocations, activations };
}

function packageFor(bootstrapId: string, name: string, candidates: CandidateSeed[], options?: { contradiction?: boolean; sparse?: boolean }): ProjectBootstrapPackageV1 {
  const artifactId = `artifact:${bootstrapId}`;
  const evidenceId = `evidence:${bootstrapId}`;
  const generatedAt = "2026-09-07T12:00:00.000Z";
  const coverage = [
    { provider: "signal-context", label: "Signal context", state: "available" as const, artifacts: 1, observedAt: generatedAt, detail: "Synthetic structured context available." },
    { provider: "hermes", label: "Hermes", state: "unavailable" as const, artifacts: 0, observedAt: generatedAt, detail: "Synthetic unavailable-provider condition." },
  ];
  const proposals = candidates.map((candidate) => {
    const fingerprint = bootstrapHash({ candidate: candidate.key, payload: candidate.payload });
    return {
      proposalId: `proposal:${candidate.key}`, candidateKey: candidate.key, fingerprint,
      kind: candidate.kind, title: candidate.title, statement: candidate.title,
      whyProposed: candidate.operatorAssertion ? "Operator assertion · no evidence yet" : "Synthetic direct evidence proposed this item.",
      matchBasis: candidate.operatorAssertion ? "operator assertion" : "current structured intelligence",
      basis: candidate.operatorAssertion ? "inferred" as const : "direct" as const,
      evidenceRefs: candidate.evidence === false || candidate.operatorAssertion ? [] : [evidenceId], intelligenceRefs: [],
      relevance: "high" as const, currentness: "current" as const,
      retrieval: { strategy: candidate.operatorAssertion ? "operator_assertion" as const : "structured_current_head" as const, scoreBand: candidate.operatorAssertion ? "not_applicable" as const : "strong" as const },
      ambiguityMarkers: [],
      grounding: { directEvidenceCount: candidate.evidence === false || candidate.operatorAssertion ? 0 : 1, independentLineageRootCount: candidate.evidence === false || candidate.operatorAssertion ? 0 : 1, derivativeOnly: false, unresolvedContradiction: false },
      payload: candidate.payload as Record<string, never>,
    };
  });
  return {
    version: "1.1", packageId: `synthetic:${bootstrapId}`, producer: "manual", compilerVersion: "phase2-db-proof",
    generatedAt, bootstrapId,
    requestedIdentity: { canonicalName: name, aliases: [`${name} Alias`], sourceHints: ["synthetic"] },
    identity: { detectedCanonicalName: name, aliases: [`${name} Alias`], collisions: [], relatedEntities: [] },
    discovery: { strategies: [
      { id: "identity", state: "complete", detail: "Exact synthetic identity." },
      { id: "lexical", state: "complete", detail: "Deterministic lexical fixture." },
      { id: "semantic", state: "unavailable", detail: "Not enabled." },
    ], partial: true },
    artifacts: [{ artifactId, provider: "signal-context", artifactType: "transcript", title: `${name} synthetic transcript`, canonicalRef: `fixture://transcript/${bootstrapId}`, observedAt: generatedAt, availability: "available", retrievalReasons: [{ kind: "exact_identity", detail: "Exact identity" }], relevanceBand: "included", lineageRootIds: [`fixture://transcript/${bootstrapId}`], derivativeOfArtifactIds: [] }],
    evidence: [{ evidenceId, artifactId, exactQuote: `${name} synthetic evidence passage.`, locator: { segment: "00:01:00" }, independence: "independent", lineageRootIds: [`fixture://transcript/${bootstrapId}`] }],
    intelligenceHeads: [], relations: [], proposals,
    coverage,
    ambiguities: options?.contradiction ? [{ id: `contradiction:${bootstrapId}`, kind: "contradiction", severity: "notice", summary: "Two current synthetic intelligence branches disagree.", refs: [] }] : [],
    gaps: options?.sparse ? [{ id: `gap:${bootstrapId}`, category: "Scope", summary: "No represented capability", detail: "Sparse historical knowledge supplied no product shape." }] : [],
    warnings: ["Synthetic proof package; no production data."],
  };
}

async function seedBootstrap(name: string, candidates: CandidateSeed[], options?: { contradiction?: boolean; sparse?: boolean }) {
  const bootstrap = await prisma.projectBootstrap.create({ data: {
    canonicalName: name, normalizedName: name.toLowerCase(), aliases: [`${name} Alias`], ownerHint: null,
    sourceHints: ["synthetic"], searchExistingKnowledge: true, status: "reviewing", reviewRevision: 1,
  } });
  const pkg = packageFor(bootstrap.id, name, candidates, options);
  const scan = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: bootstrap.id, sequence: 1, status: "complete", stage: "complete",
    providerCoverage: pkg.coverage as unknown as Prisma.InputJsonValue, metrics: {}, warnings: [], startedAt: new Date(pkg.generatedAt), completedAt: new Date(pkg.generatedAt),
  } });
  const packageRow = await prisma.bootstrapPackage.create({ data: {
    bootstrapId: bootstrap.id, scanRunId: scan.id, packageId: pkg.packageId, packageVersion: pkg.version,
    producer: pkg.producer, compilerVersion: pkg.compilerVersion, packageHash: bootstrapHash(pkg), package: pkg as unknown as Prisma.InputJsonValue, generatedAt: new Date(pkg.generatedAt),
  } });
  await prisma.bootstrapScanRun.update({ where: { id: scan.id }, data: { resultPackageId: packageRow.id } });
  await prisma.projectBootstrap.update({ where: { id: bootstrap.id }, data: { activePackageId: packageRow.id } });
  for (const candidate of candidates) {
    const proposal = pkg.proposals.find((item) => item.candidateKey === candidate.key)!;
    const row = await prisma.bootstrapCandidate.create({ data: {
      bootstrapId: bootstrap.id, packageId: packageRow.id, candidateKey: candidate.key, kind: candidate.kind,
      title: candidate.title, summary: candidate.title, whyProposed: proposal.whyProposed, matchBasis: proposal.matchBasis,
      currentness: "current", relevance: "high", sourceFingerprint: proposal.fingerprint,
      originalProposal: proposal as unknown as Prisma.InputJsonValue, status: candidate.status, operatorAssertion: candidate.operatorAssertion ?? false,
    } });
    if (proposal.evidenceRefs[0]) await prisma.bootstrapEvidenceLink.create({ data: { candidateId: row.id, evidenceId: proposal.evidenceRefs[0] } });
  }
  return bootstrap;
}

async function main() {
  const before = await counts();
  const upstream = await prisma.scope.create({ data: { name: "Ember Gateway Synthetic", teamKey: "SYN", projectNames: ["Synthetic Gateway"] } });
  const richSeeds: CandidateSeed[] = [
    { key: "source-1", kind: "source", title: "Synthetic transcript", status: "accepted", payload: { provider: "transcript", canonicalRef: "fixture://source/rich" } },
    { key: "cap-1", kind: "capability", title: "Offline relay", status: "accepted", payload: { name: "Offline relay", intent: "Move a payload without a connection." } },
    { key: "cap-2", kind: "capability", title: "Approval rail", status: "accepted", payload: { name: "Approval rail", executionLinks: [{ provider: "linear", externalId: "SYN-101" }] } },
    { key: "cap-3", kind: "capability", title: "Rejected ornament", status: "rejected", payload: { name: "Rejected ornament" } },
    { key: "cap-4", kind: "capability", title: "Deferred export", status: "deferred", payload: { name: "Deferred export" } },
    { key: "decision-1", kind: "decision", title: "Which approval path?", status: "accepted", payload: { question: "Which approval path?" } },
    { key: "decision-2", kind: "decision", title: "Informational preference", status: "information-only", payload: { question: "Which color?" } },
    { key: "dependency-1", kind: "dependency", title: "Harbor waits on Ember", status: "accepted", payload: { upstreamScopeId: upstream.id, relationshipKind: "depends_on", assertionBasis: "Typed dependency evidence." } },
    { key: "dependency-2", kind: "dependency", title: "Possible archive relation", status: "deferred", payload: { upstreamScopeId: upstream.id, relationshipKind: "depends_on" } },
    { key: "milestone-1", kind: "milestone", title: "Pilot review", status: "accepted", payload: { date: "2026-10-02T00:00:00.000Z", semanticState: "commitment" } },
    { key: "milestone-2", kind: "milestone", title: "Possible launch", status: "deferred", payload: { date: "2026-11-01T00:00:00.000Z", semanticState: "projected" } },
    { key: "milestone-3", kind: "milestone", title: "Rejected date", status: "rejected", payload: { date: "2026-09-01T00:00:00.000Z" } },
    { key: "person-1", kind: "person", title: "Synthetic Owner", status: "information-only", payload: { displayLabel: "Synthetic Owner", staffingEffect: false } },
    { key: "manual-capability", kind: "capability", title: "Operator safety rail", status: "accepted", payload: { name: "Operator safety rail" }, operatorAssertion: true, evidence: false },
  ];
  const rich = await seedBootstrap("Harbor Relay Synthetic", richSeeds, { contradiction: true });
  const activated = await activateProjectBootstrap(rich.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } });
  assert.equal(activated.reused, false);
  assert.equal(activated.scope.executionState, "not_configured");
  assert.equal(activated.audit.findings.length, activated.audit.findingCount);
  assert.ok(activated.audit.findings.some((finding) => finding.title.includes("no execution work mapping")));
  assert.ok(activated.audit.findings.some((finding) => finding.type === "contradiction"));
  await assert.rejects(() => computeForecast(activated.scope), (error: unknown) => error instanceof ForecastUnavailableError && error.reason === "Missing executable work mapping");

  const [richCaps, richLinks, richDecisions, richGates, richDependencies, richMilestones, richPeople, richAllocations, richSnapshots] = await Promise.all([
    prisma.capability.findMany({ where: { scopeId: activated.scope.id } }),
    prisma.capabilityWorkLink.findMany({ where: { capability: { scopeId: activated.scope.id } } }),
    prisma.decision.findMany({ where: { scopeId: activated.scope.id }, include: { evidence: true } }),
    prisma.decisionGate.findMany({ where: { targetScopeId: activated.scope.id } }),
    prisma.scopeDependency.findMany({ where: { downstreamScopeId: activated.scope.id } }),
    prisma.timelineEvent.findMany({ where: { scopeId: activated.scope.id } }),
    prisma.person.count(), prisma.allocation.count(), prisma.contextSnapshot.findMany({ where: { scopeId: activated.scope.id } }),
  ]);
  assert.equal(richCaps.length, 3, "only accepted capabilities enter Reality");
  assert.equal(richLinks.length, 1);
  assert.equal(richDecisions.length, 1);
  assert.equal(richGates.length, 0, "accepting a Decision must not invent a DecisionGate");
  assert.equal(richDependencies.length, 1);
  assert.equal(richMilestones.length, 1);
  assert.equal(richMilestones[0].semanticState, "commitment");
  assert.equal(richPeople, before.people, "person mentions are not staffing");
  assert.equal(richAllocations, before.allocations, "activation creates no allocations");
  assert.equal(richSnapshots.length, 1);
  const operatorCapability = richCaps.find((capability) => capability.name === "Operator safety rail")!;
  assert.equal((operatorCapability.provenance as Record<string, unknown>).basis, "operator_assertion");
  assert.equal((operatorCapability.provenance as Record<string, unknown>).originalAuthorshipPreserved, true);
  assert.ok((richSnapshots[0].package as Record<string, unknown>).warnings);

  const afterFirst = await counts();
  const retried = await activateProjectBootstrap(rich.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } });
  assert.equal(retried.reused, true);
  assert.deepEqual(await counts(), afterFirst, "response-loss retry must create no duplicate canonical rows");

  const rejected = await prisma.bootstrapCandidate.findFirstOrThrow({ where: { bootstrapId: rich.id, candidateKey: "cap-3" } });
  assert.equal(rejected.status, "rejected");
  assert.equal(await prisma.capability.count({ where: { sourceCandidateId: rejected.id } }), 0);

  const canonicalBeforeRefresh = {
    scopes: await prisma.scope.count(), capabilities: await prisma.capability.count(), decisions: await prisma.decision.count(),
    dependencies: await prisma.scopeDependency.count(), milestones: await prisma.timelineEvent.count(), allocations: await prisma.allocation.count(),
  };
  const refreshPackage = packageFor(rich.id, "Harbor Relay Synthetic", [
    { key: "refresh-dependency", kind: "dependency", title: "New external dependency candidate", status: "pending", payload: { toEntity: "Unknown external project" } },
  ], { contradiction: true });
  refreshPackage.packageId += ":refresh-2";
  const refreshScan = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: rich.id, sequence: 2, status: "complete", stage: "complete",
    providerCoverage: refreshPackage.coverage as unknown as Prisma.InputJsonValue, metrics: {}, warnings: [],
    startedAt: new Date(refreshPackage.generatedAt), completedAt: new Date(refreshPackage.generatedAt),
  } });
  const refreshRow = await prisma.bootstrapPackage.create({ data: {
    bootstrapId: rich.id, scanRunId: refreshScan.id, packageId: refreshPackage.packageId, packageVersion: refreshPackage.version,
    producer: refreshPackage.producer, compilerVersion: refreshPackage.compilerVersion, packageHash: bootstrapHash(refreshPackage),
    package: refreshPackage as unknown as Prisma.InputJsonValue, generatedAt: new Date(refreshPackage.generatedAt),
  } });
  await prisma.projectBootstrap.update({ where: { id: rich.id }, data: { activePackageId: refreshRow.id } });
  const refreshAudit = await auditActivatedBootstrapRefresh(rich.id);
  const refreshRetry = await auditActivatedBootstrapRefresh(rich.id);
  assert(refreshAudit && refreshRetry);
  assert.equal(refreshAudit.canonicalWrites, 0);
  assert.equal(refreshRetry.reused, true);
  assert.deepEqual({
    scopes: await prisma.scope.count(), capabilities: await prisma.capability.count(), decisions: await prisma.decision.count(),
    dependencies: await prisma.scopeDependency.count(), milestones: await prisma.timelineEvent.count(), allocations: await prisma.allocation.count(),
  }, canonicalBeforeRefresh, "post-activation knowledge refresh must not mutate canonical Reality");
  assert.ok(refreshAudit.audit?.findings.some((finding) => finding.type === "contradiction"));

  const sparse = await seedBootstrap("Cedar Sparse Synthetic", [], { sparse: true });
  const sparseActivation = await activateProjectBootstrap(sparse.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } });
  assert.ok(sparseActivation.audit.findings.some((finding) => finding.title === "Accepted project has no represented capabilities"));

  const contradictory = await seedBootstrap("Lantern Contradictory Synthetic", [], { contradiction: true, sparse: true });
  const contradictoryActivation = await activateProjectBootstrap(contradictory.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } });
  assert.equal(await prisma.decision.count({ where: { scopeId: contradictoryActivation.scope.id } }), 0);
  assert.ok(contradictoryActivation.audit.findings.some((finding) => finding.type === "contradiction"));

  const concurrent = await seedBootstrap("Juniper Concurrent Synthetic", [
    { key: "concurrent-capability", kind: "capability", title: "Concurrent safety", status: "accepted", payload: { name: "Concurrent safety" } },
  ]);
  const concurrentResults = await Promise.all([
    activateProjectBootstrap(concurrent.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } }),
    activateProjectBootstrap(concurrent.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } }),
  ]);
  assert.equal(concurrentResults[0].scope.id, concurrentResults[1].scope.id, "simultaneous clicks must converge on one Scope");
  assert.equal(await prisma.projectActivation.count({ where: { bootstrapId: concurrent.id } }), 1);
  assert.equal(await prisma.scope.count({ where: { name: "Juniper Concurrent Synthetic" } }), 1);

  const invalid = await seedBootstrap("Atomic Failure Synthetic", [{ key: "bad-milestone", kind: "milestone", title: "Dateless accepted milestone", status: "accepted", payload: {} }]);
  const beforeFailure = await counts();
  await assert.rejects(() => activateProjectBootstrap(invalid.id, { expectedRevision: 1, acknowledgeProviderGaps: true, execution: { state: "not_configured" } }), /explicit valid date/);
  assert.deepEqual(await counts(), beforeFailure, "validation failure must leave zero partial canonical activation writes");

  const after = await counts();
  console.log(JSON.stringify({
    before,
    richActivation: {
      scopeId: activated.scope.id, activationId: activated.activation.id, contextSnapshotId: activated.snapshot.id,
      firstAuditRunId: activated.audit.id, findings: activated.audit.findings.length,
      canonical: { capabilities: richCaps.length, workLinks: richLinks.length, decisions: richDecisions.length, decisionGates: richGates.length, dependencies: richDependencies.length, milestones: richMilestones.length },
      external: { rejectedCapability: rejected.id, peopleNotStaffing: 1, deferredDependency: 1 },
      retryReused: retried.reused,
      refresh: { canonicalWrites: refreshAudit.canonicalWrites, reused: refreshRetry.reused, findings: refreshAudit.audit?.findings.length ?? 0 },
    },
    sparseFirstAuditFindings: sparseActivation.audit.findings.length,
    contradictoryFirstAuditFindings: contradictoryActivation.audit.findings.length,
    concurrentRetry: { sameScope: true, activationRows: 1 },
    atomicFailure: "zero partial writes",
    after,
  }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
}).finally(() => prisma.$disconnect());
