/**
 * Reproduction for: a rejected context package must not leave `activePackageId`
 * ahead of the snapshot it points at.
 *
 * Self-contained. Builds its own synthetic bootstrap packages -- no external
 * corpus, no payloads, no credentials. Needs only DATABASE_URL.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/pointer-safety-repro.ts
 *
 * Without the pre-check in lib/bootstrap/transport.ts the INVALID case moves
 * the pointer and bumps reviewRevision before throwing, and every
 * currentContextSnapshot() consumer for that scope then fails. With it, the
 * invalid package changes nothing.
 */
import { prisma } from "@/lib/prisma";
import { validateBootstrapPackage } from "@/lib/bootstrap/contracts";
import { ingestBootstrapPackage } from "@/lib/bootstrap/transport";
import { toContextPackage } from "@/lib/bootstrap/refresh";
import { hashProjectContextPackage } from "@/lib/context/hash";
import { currentContextSnapshot } from "@/lib/context/currentSnapshot";

const BOOTSTRAP_ID = "repro-pointer-safety";
const ARTIFACT = "fixture://transcript/repro";

function pkg(packageId: string, excerpt: string) {
  return {
    version: "1.1", packageId, producer: "hermes", compilerVersion: "repro-1",
    generatedAt: "2026-01-01T00:00:00.000Z", bootstrapId: BOOTSTRAP_ID,
    requestedIdentity: { canonicalName: "Repro", aliases: ["Repro"], sourceHints: [] },
    identity: { detectedCanonicalName: "Repro", aliases: ["Repro"], collisions: [], relatedEntities: [] },
    discovery: { strategies: [] },
    artifacts: [{
      artifactId: "artifact-repro", provider: "fixture", canonicalRef: ARTIFACT,
      title: "Repro artifact", availability: "available", observedAt: "2026-01-01T00:00:00.000Z",
      lineageRootIds: [ARTIFACT], derivativeOfArtifactIds: [],
    }],
    evidence: [{
      evidenceId: `${packageId}:ev-1`, artifactId: "artifact-repro", exactQuote: excerpt,
      passageHash: "sha256:repro", locator: { kind: "fixture" }, independence: "independent",
      lineageRootIds: [ARTIFACT],
    }],
    intelligenceHeads: [{
      intelligenceId: "repro:obs-1", type: "observation", statement: "A reproduction observation.",
      isCurrent: true, status: "recorded", observedDate: "2026-01-01",
      evidenceRefs: [`${packageId}:ev-1`], fields: {},
      provenance: { canonicalId: "obs-1", batchId: "repro-batch" },
    }],
    proposals: [{
      proposalId: "p-1", candidateKey: "repro:candidate:1", kind: "decision",
      title: "A reproduction candidate", statement: "A reproduction candidate.",
      whyProposed: "fixture", matchBasis: "fixture", currentness: "current", relevance: "direct",
      fingerprint: "fp-1", evidenceRefs: [`${packageId}:ev-1`], intelligenceRefs: [], payload: {},
    }],
    relations: [], coverage: [], ambiguities: [], gaps: [], warnings: [],
  };
}

const VALID = pkg("repro-valid", "A short, perfectly ordinary quotation.");
// One character over the context contract's 4,000-character excerpt bound.
// Accepted by the bootstrap contract, rejected when the context is derived --
// which is precisely the shape that broke production.
const INVALID = pkg("repro-invalid", "x".repeat(4001));

type State = { pointer: string | null; revision: number; candidates: number; active: number; readable: boolean };

async function read(scopeId: string): Promise<State> {
  const b = await prisma.projectBootstrap.findUniqueOrThrow({ where: { id: BOOTSTRAP_ID } });
  const row = b.activePackageId ? await prisma.bootstrapPackage.findUnique({ where: { id: b.activePackageId } }) : null;
  let readable = false;
  try { readable = Boolean(await currentContextSnapshot(scopeId)); } catch { readable = false; }
  return {
    pointer: (row?.package as { packageId?: string } | null)?.packageId ?? null,
    revision: b.reviewRevision,
    candidates: await prisma.bootstrapCandidate.count({ where: { bootstrapId: BOOTSTRAP_ID } }),
    active: await prisma.bootstrapCandidate.count({ where: { bootstrapId: BOOTSTRAP_ID, active: true } }),
    readable,
  };
}

async function seed(): Promise<string> {
  for (const m of ["projectActivation","bootstrapCandidate","bootstrapPackage","bootstrapScanRun","projectBootstrap","auditRun","contextSnapshot","scope"] as const) {
    await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[m].deleteMany();
  }
  const scope = await prisma.scope.create({ data: { name: "Repro", teamKey: "RPR" } });
  await prisma.projectBootstrap.create({ data: {
    id: BOOTSTRAP_ID, canonicalName: "Repro", normalizedName: "repro", aliases: ["Repro"],
    sourceHints: [], status: "activated", reviewRevision: 5 } });
  const scan = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: BOOTSTRAP_ID, sequence: 1, status: "complete", stage: "complete",
    providerCoverage: [], metrics: {}, warnings: [] } });
  const row = await prisma.bootstrapPackage.create({ data: {
    bootstrapId: BOOTSTRAP_ID, scanRunId: scan.id, packageId: VALID.packageId, packageVersion: "1.1",
    producer: "hermes", compilerVersion: "repro-1", packageHash: "seed", package: VALID,
    generatedAt: new Date(VALID.generatedAt) } });
  await prisma.bootstrapCandidate.create({ data: {
    id: "repro-seed-candidate", bootstrapId: BOOTSTRAP_ID, packageId: row.id,
    candidateKey: "repro:candidate:1", kind: "decision", title: "A reproduction candidate",
    summary: "A reproduction candidate.", whyProposed: "fixture", matchBasis: "fixture",
    currentness: "current", relevance: "direct", sourceFingerprint: "fp-1",
    originalProposal: {}, status: "accepted", active: true } });
  const ctx = toContextPackage(scope.id, VALID as never);
  const snap = await prisma.contextSnapshot.create({ data: {
    scopeId: scope.id, packageId: ctx.packageId, packageVersion: ctx.version, producer: ctx.producer,
    package: ctx as never, contextHash: hashProjectContextPackage(ctx), completenessSummary: {} as never } });
  const audit = await prisma.auditRun.create({ data: {
    sourceId: null, contextSnapshotId: snap.id, issueCount: 0, findingCount: 0, model: "repro" } });
  await prisma.projectActivation.create({ data: {
    bootstrapId: BOOTSTRAP_ID, scopeId: scope.id, reviewRevision: 5, manifestVersion: "1",
    manifest: {}, contextSnapshotId: snap.id, firstAuditRunId: audit.id } });
  await prisma.projectBootstrap.update({ where: { id: BOOTSTRAP_ID }, data: { activePackageId: row.id } });
  return scope.id;
}

let failures = 0;
function assert(label: string, ok: boolean) {
  process.stdout.write(`    ${ok ? "PASS" : "FAIL"}  ${label}\n`);
  if (!ok) failures += 1;
}

async function upload(label: string, scopeId: string, body: unknown) {
  const before = await read(scopeId);
  let outcome = "";
  try {
    const parsed = validateBootstrapPackage(body, BOOTSTRAP_ID);
    outcome = `HTTP ${(await ingestBootstrapPackage(BOOTSTRAP_ID, parsed)).status}`;
  } catch (error) { outcome = `REJECTED ${(error as Error).name}: ${(error as Error).message.slice(0, 180)}`; }
  const after = await read(scopeId);
  process.stdout.write(`\n### ${label}\n    outcome: ${outcome}\n`);
  process.stdout.write(`    pointer ${before.pointer} -> ${after.pointer}; revision ${before.revision} -> ${after.revision}; candidates ${before.candidates}/${before.active} -> ${after.candidates}/${after.active}; readable ${before.readable} -> ${after.readable}\n`);
  return { before, after, outcome };
}

(async () => {
  const scopeId = await seed();
  process.stdout.write("seeded: an ACTIVATED bootstrap at reviewRevision 5 with one accepted candidate\n");

  const bad = await upload("INVALID package (excerpt one character over the context bound)", scopeId, INVALID);
  assert("rejected", bad.outcome.startsWith("REJECTED"));
  assert("active package pointer unchanged", bad.before.pointer === bad.after.pointer);
  assert("reviewRevision unchanged", bad.before.revision === bad.after.revision);
  assert("candidates unchanged", bad.before.candidates === bad.after.candidates && bad.before.active === bad.after.active);
  assert("scope context still readable", bad.after.readable);

  const good = await upload("VALID package", scopeId, { ...VALID, packageId: "repro-valid-2" });
  assert("accepted", good.outcome.startsWith("HTTP 2"));
  assert("active package pointer advanced", good.before.pointer !== good.after.pointer);
  assert("reviewRevision advanced by exactly one", good.after.revision === good.before.revision + 1);
  assert("scope context readable", good.after.readable);
  const carried = await prisma.bootstrapCandidate.findFirst({
    where: { bootstrapId: BOOTSTRAP_ID, candidateKey: "repro:candidate:1", active: true },
    select: { status: true, carriedFromCandidateId: true } });
  assert("prior review disposition preserved (accepted)", carried?.status === "accepted");
  assert("carried from the earlier candidate", carried?.carriedFromCandidateId === "repro-seed-candidate");

  process.stdout.write(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
})();
