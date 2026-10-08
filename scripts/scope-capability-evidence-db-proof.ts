import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { buildPortfolioInputs } from "../lib/forecast/compute";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert(process.env.SIGNAL_REPAIR_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55434" && url.pathname === "/signal_t0_test_1004", "Disposable repair DB only");
  const key = randomUUID();
  const scope = await prisma.scope.create({ data: { name: `Captured evidence ${key}`, teamKey: "PRF", executionState: "not_configured" } });
  const bootstrap = await prisma.projectBootstrap.create({ data: { canonicalName: scope.name, normalizedName: scope.name, sourceHints: {}, status: "activated" } });
  const candidateId = `candidate-${key}`;
  const quote = "This is the exact original accepted fictional quote.";
  const provenance = { boundary: "human_accepted_bootstrap", sourceCandidateId: candidateId, evidenceRefs: ["same-evidence-id"] };
  try {
    const snapshots = [];
    for (const [index, excerpt] of [quote, "Newer source words must not replace the accepted quote."].entries()) {
      const packageId = `${key}-${index}`;
      const pkg = {
        version: "1.1", producer: "manual", packageId, scopeId: scope.id, generatedAt: "2026-10-08T12:00:00Z",
        sources: [{ sourceRef: "fixture://accepted-source", sourceType: "transcript", registrationId: null, role: "raw_evidence", status: "active", observedAt: "2026-10-08T12:00:00Z", succeeded: true, detail: null }],
        evidence: [{ id: "same-evidence-id", sourceRef: "fixture://accepted-source", kind: "bootstrap_evidence", excerpt, data: { occurredAt: "2026-08-18", char_start: 5, char_end: 55, offset_unit: "unicode_code_points" }, extra: { passageHash: "original-locator-hash" } }],
        derivedClaims: [{ id: `bootstrap-accepted:${candidateId}`, kind: "capability", statement: "Accepted fixture capability", evidenceRefs: ["same-evidence-id"] }],
        completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [],
      };
      snapshots.push(await prisma.contextSnapshot.create({ data: { scopeId: scope.id, producer: "manual", packageId, packageVersion: "1.1", contextHash: packageId, completenessSummary: {}, package: pkg, createdAt: new Date(`2026-10-0${7 + index}T12:00:00Z`) } }));
    }
    const audit = await prisma.auditRun.create({ data: { contextSnapshotId: snapshots[0].id, issueCount: 0, findingCount: 0, model: "evidence-proof" } });
    await prisma.projectActivation.create({ data: { bootstrapId: bootstrap.id, scopeId: scope.id, reviewRevision: 1, manifestVersion: "1.0", manifest: {}, contextSnapshotId: snapshots[0].id, firstAuditRunId: audit.id } });
    const capability = await prisma.capability.create({ data: { scopeId: scope.id, name: "Accepted fixture capability", provenance, sourceCandidateId: candidateId } });
    const before = await prisma.capability.findUniqueOrThrow({ where: { id: capability.id } });
    const inputs = await buildPortfolioInputs();
    const trace = inputs.scopes.find(item => item.scopeId === scope.id)?.capabilities.find(item => item.id === capability.id)?.evidenceTrace;
    assert.equal(trace?.length, 1);
    assert.equal(trace?.[0].state, "captured_at_acceptance");
    assert.equal(trace?.[0].capture?.contextSnapshotId, snapshots[0].id);
    assert.equal(trace?.[0].capture?.excerpt, quote);
    assert.equal(trace?.[0].capture?.sourceDate, "2026-08-18");
    assert.equal(trace?.[0].capture?.locator.charStart, 5);
    assert.equal(trace?.[0].capture?.sourceUrl, null, "no fabricated browser link for fixture reference");
    assert.deepEqual(await prisma.capability.findUniqueOrThrow({ where: { id: capability.id } }), before, "read model must not rewrite accepted capability/provenance");
    console.log("PASS actual portfolio DB read binds Scope evidence to immutable activation, not newer knowledge; exact quote/date/anchors and accepted-row preservation");
  } finally {
    await prisma.capability.deleteMany({ where: { scopeId: scope.id } });
    await prisma.projectActivation.deleteMany({ where: { scopeId: scope.id } });
    await prisma.auditRun.deleteMany({ where: { contextSnapshot: { scopeId: scope.id } } });
    await prisma.contextSnapshot.deleteMany({ where: { scopeId: scope.id } });
    await prisma.projectBootstrap.delete({ where: { id: bootstrap.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
  }
}
main().finally(() => prisma.$disconnect());
