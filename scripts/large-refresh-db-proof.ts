import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { auditActivatedBootstrapRefresh } from "../lib/bootstrap/refresh";
import type { ProjectBootstrapPackageV1 } from "../lib/bootstrap/contracts";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert(process.env.SIGNAL_REPAIR_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55434" && url.pathname === "/signal_t0_test_1004");
  assert(!process.env.LINEAR_API_KEY, "No live connector during this disposable DB proof");
  const input = process.env.SIGNAL_LARGE_PACKAGE;
  assert(input, "Use a private captured package; never commit project evidence as a fixture");
  const key = randomUUID();
  const scope = await prisma.scope.create({ data: { name: `Large refresh QA ${key}`, teamKey: "QA", executionState: "not_configured" } });
  const bootstrap = await prisma.projectBootstrap.create({ data: { canonicalName: scope.name, normalizedName: scope.name, sourceHints: [], status: "activated" } });
  try {
    const captured = JSON.parse(readFileSync(input, "utf8"));
    const pkg = structuredClone(captured.activePackage?.package ?? captured) as ProjectBootstrapPackageV1;
    pkg.bootstrapId = bootstrap.id;
    pkg.packageId = `qa-large-refresh-${key}`;
    assert(pkg.evidence.length > 2_000 && pkg.proposals.length > 300);
    // Cross the batch boundary as well as using the real quote-complete size.
    const dependency = pkg.proposals.find((row) => row.kind === "dependency")!;
    // Keep the contract's 500-claim ceiling while forcing >250 finding inserts.
    pkg.proposals = pkg.proposals.slice(0, 200);
    for (let i = 0; i < 260; i++) pkg.proposals.push({ ...dependency, proposalId: `qa-extra-${i}`, candidateKey: `qa-extra-${i}`, fingerprint: `qa-extra-${i}`, title: `QA synthetic observation ${i}`, evidenceRefs: [] });
    const scan = await prisma.bootstrapScanRun.create({ data: { bootstrapId: bootstrap.id, sequence: 1, status: "complete", stage: "complete", providerCoverage: [], metrics: {}, warnings: [] } });
    const row = await prisma.bootstrapPackage.create({ data: { bootstrapId: bootstrap.id, scanRunId: scan.id, packageId: pkg.packageId, packageVersion: "1.1", producer: pkg.producer, compilerVersion: "qa", packageHash: key, package: JSON.parse(JSON.stringify(pkg)), generatedAt: new Date(pkg.generatedAt) } });
    const initial = await prisma.contextSnapshot.create({ data: { scopeId: scope.id, producer: "gap_app", packageId: `qa-initial-${key}`, packageVersion: "1.1", contextHash: key, package: {}, completenessSummary: {} } });
    const audit = await prisma.auditRun.create({ data: { contextSnapshotId: initial.id, model: "qa", issueCount: 0, findingCount: 0 } });
    await prisma.projectActivation.create({ data: { scopeId: scope.id, bootstrapId: bootstrap.id, reviewRevision: 0, manifestVersion: "qa", manifest: {}, contextSnapshotId: initial.id, firstAuditRunId: audit.id } });
    await prisma.projectBootstrap.update({ where: { id: bootstrap.id }, data: { activePackageId: row.id } });
    const start = Date.now();
    const first = await auditActivatedBootstrapRefresh(bootstrap.id);
    assert(first);
    const snapshots = await prisma.contextSnapshot.findMany({ where: { scopeId: scope.id, packageId: { startsWith: "bootstrap-refresh-v2:" } } });
    assert.equal(snapshots.length, 1);
    const runs = await prisma.auditRun.findMany({ where: { contextSnapshotId: snapshots[0].id }, include: { findings: true } });
    assert.equal(runs.length, 1);
    assert(runs[0].findings.length > 250);
    assert.equal(runs[0].findingCount, runs[0].findings.length);
    await auditActivatedBootstrapRefresh(bootstrap.id);
    assert.equal(await prisma.contextSnapshot.count({ where: { scopeId: scope.id } }), 2);
    assert.equal(await prisma.finding.count({ where: { auditRunId: runs[0].id } }), runs[0].findings.length);
    console.log(JSON.stringify({ ok: true, evidence: pkg.evidence.length, proposals: pkg.proposals.length, findings: runs[0].findings.length, idempotent: true, elapsedMs: Date.now() - start }));
  } finally {
    await prisma.projectActivation.deleteMany({ where: { scopeId: scope.id } });
    await prisma.finding.deleteMany({ where: { contextSnapshot: { scopeId: scope.id } } });
    await prisma.auditRun.deleteMany({ where: { contextSnapshot: { scopeId: scope.id } } });
    await prisma.scopeProposal.deleteMany({ where: { scopeId: scope.id } });
    await prisma.contextSnapshot.deleteMany({ where: { scopeId: scope.id } });
    await prisma.projectBootstrap.delete({ where: { id: bootstrap.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
  }
}
main().finally(() => prisma.$disconnect());
