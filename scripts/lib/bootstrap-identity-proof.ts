/** Called only from the guarded empty-database project-write proof. */
import assert from "node:assert/strict";
import { prisma } from "../../lib/prisma";
import { compileBootstrapPackage, executeBootstrapScan } from "../../lib/bootstrap/scan";
import { persistCompiledPackage } from "../../lib/bootstrap/packageStore";
import { richHistoricalCorpus } from "../../lib/bootstrap/fixtures";
import { readBootstrap } from "../../lib/bootstrap/read";
import { RequestValidationError } from "../../lib/http/json";
import type { ProjectBootstrapPackageV1 } from "../../lib/bootstrap/contracts";

type Request = (path: string, method?: string, body?: unknown) => Promise<Response>;

export async function runBootstrapIdentityProof(request: Request) {
  const create = (canonicalName: string) =>
    request("/api/project-bootstraps", "POST", { canonicalName, searchExistingKnowledge: false });
  const edit = (id: string, body: unknown) =>
    request(`/api/project-bootstraps/${id}`, "PATCH", body);
  const races = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      create(index % 2 ? " Fictional Setup Race " : "FICTIONAL SETUP RACE"),
    ),
  );
  assert.equal(races.filter((r) => r.status === 201).length, 1);
  assert.equal(races.filter((r) => r.status === 409).length, 9);
  const created = await races.find((r) => r.status === 201)!.json();
  for (const conflict of races.filter((r) => r.status === 409))
    assert.equal((await conflict.json()).bootstrapId, created.bootstrap.id);
  const other = await (await create("Fictional other setup")).json();
  const renames = await Promise.all([
    edit(created.bootstrap.id, { canonicalName: "Fictional shared setup" }),
    edit(other.bootstrap.id, { canonicalName: "Fictional shared setup" }),
  ]);
  assert.deepEqual(renames.map((r) => r.status).sort(), [200, 409]);
  const createRename = await Promise.all([
    create("Fictional setup create rename"),
    edit(other.bootstrap.id, { canonicalName: "Fictional setup create rename" }),
  ]);
  assert.equal(createRename.filter((r) => r.ok).length, 1);
  assert.equal(createRename.filter((r) => r.status === 409).length, 1);

  const identity = { canonicalName: "Harbor Relay", aliases: ["HR", "Relay"], sourceHints: [] };
  const response = await request("/api/project-bootstraps", "POST", {
    ...identity,
    searchExistingKnowledge: false,
  });
  assert.equal(response.status, 201);
  const { bootstrap } = await response.json();
  const scan = await prisma.bootstrapScanRun.create({
    data: {
      bootstrapId: bootstrap.id,
      sequence: 1,
      providerCoverage: [],
      metrics: {},
      warnings: [],
    },
  });
  const pkg = compileBootstrapPackage(bootstrap.id, identity, richHistoricalCorpus);
  await persistCompiledPackage(scan.id, pkg);
  let current = (await readBootstrap(bootstrap.id))!;
  const capability = current.candidates.find((c) => c.kind === "capability")!;
  assert(capability, "Fictional grounded capability is available for review");
  const candidatePath = `/api/project-bootstraps/${bootstrap.id}/candidates/${capability.id}`;
  assert.equal((await request(candidatePath, "PATCH", { status: "accepted" })).status, 200);
  const quoteSnapshot = await prisma.bootstrapPackage.findUniqueOrThrow({
    where: { id: current.activePackage!.id },
  });
  const revision = (await readBootstrap(bootstrap.id))!.bootstrap.reviewRevision;
  assert.equal((await edit(bootstrap.id, { ...identity })).status, 200);
  assert.equal(
    (await readBootstrap(bootstrap.id))!.bootstrap.reviewRevision,
    revision,
    "No-op saves do not invalidate a review",
  );

  for (const body of [
    { canonicalName: "x".repeat(161) },
    { aliases: [1] },
    { searchExistingKnowledge: "false" },
  ]) {
    assert.equal((await edit(bootstrap.id, body)).status, 400);
  }
  assert.equal((await edit("missing-setup", { ownerHint: "Fictional" })).status, 404);
  assert.equal((await request(candidatePath, "PATCH", { reason: "" })).status, 400);
  assert.equal((await request(candidatePath, "PATCH", { status: "not-a-status" })).status, 400);

  const queued = await prisma.bootstrapScanRun.create({
    data: {
      bootstrapId: bootstrap.id,
      sequence: 2,
      providerCoverage: [],
      metrics: {},
      warnings: [],
    },
  });
  assert.equal((await edit(bootstrap.id, { canonicalName: "Harbor Relay renamed" })).status, 200);
  current = (await readBootstrap(bootstrap.id))!;
  assert.equal(current.activePackage, null);
  assert.equal(current.candidates.length, 0);
  assert.equal(current.bootstrap.status, "draft");
  assert.equal(current.bootstrap.reviewRevision, revision + 1);
  assert.equal((await request(candidatePath, "PATCH", { status: "rejected" })).status, 404);
  const retired = await prisma.bootstrapCandidate.findUniqueOrThrow({
    where: { id: capability.id },
  });
  assert.equal(retired.active, false);
  assert.equal(retired.status, "accepted", "Original human disposition is historical, not erased");
  assert.deepEqual(
    await prisma.bootstrapPackage.findUniqueOrThrow({ where: { id: quoteSnapshot.id } }),
    quoteSnapshot,
    "Immutable evidence and quotes are unchanged",
  );
  await assert.rejects(persistCompiledPackage(scan.id, pkg), RequestValidationError);
  await executeBootstrapScan(queued.id);
  assert.equal(
    (await readBootstrap(bootstrap.id))!.bootstrap.status,
    "draft",
    "Queued old scan cannot restart after identity edit",
  );

  // Returning to an earlier spelling still cannot resurrect its old scan.
  assert.equal((await edit(bootstrap.id, identity)).status, 200);
  await assert.rejects(persistCompiledPackage(scan.id, pkg), RequestValidationError);
  const rescan = await prisma.bootstrapScanRun.create({
    data: {
      bootstrapId: bootstrap.id,
      sequence: 3,
      providerCoverage: [],
      metrics: {},
      warnings: [],
    },
  });
  await persistCompiledPackage(rescan.id, { ...pkg, generatedAt: new Date().toISOString() });
  current = (await readBootstrap(bootstrap.id))!;
  assert.equal(
    current.activePackage!.id,
    quoteSnapshot.id,
    "A deliberate fresh scan may reuse identical immutable evidence",
  );
  assert.equal(current.candidates.find((c) => c.id === capability.id)?.status, "accepted");

  // Publication and identity change are serialized; either order leaves the
  // changed identity without any accepted proposals from the prior identity.
  const raceScan = await prisma.bootstrapScanRun.create({
    data: {
      bootstrapId: bootstrap.id,
      sequence: 4,
      providerCoverage: [],
      metrics: {},
      warnings: [],
    },
  });
  const changedPkg: ProjectBootstrapPackageV1 = { ...pkg, packageId: `${pkg.packageId}-race` };
  const published = persistCompiledPackage(raceScan.id, changedPkg).catch((error) => {
    assert(error instanceof RequestValidationError);
  });
  assert.equal(
    (await edit(bootstrap.id, { canonicalName: "Harbor different identity" })).status,
    200,
  );
  await published;
  current = (await readBootstrap(bootstrap.id))!;
  assert.equal(current.activePackage, null);
  assert.equal(current.candidates.length, 0);

  // Matching source keys under another identity still require a human review.
  const otherScan = await prisma.bootstrapScanRun.create({
    data: {
      bootstrapId: bootstrap.id,
      sequence: 5,
      providerCoverage: [],
      metrics: {},
      warnings: [],
    },
  });
  const otherPkg = {
    ...pkg,
    packageId: `${pkg.packageId}-new-identity`,
    requestedIdentity: { ...identity, canonicalName: "Harbor different identity" },
  };
  await persistCompiledPackage(otherScan.id, otherPkg);
  current = (await readBootstrap(bootstrap.id))!;
  assert(current.candidates.every((c) => c.status === "pending" && c.reviewedProposal === null));
  // Leave this fictional setup for the browser error/retry test. Cleanup is
  // owned by the enclosing disposable proof, never by this helper.
  console.log(
    "PASS setup create/rename races, validation, no-op revisions, stale-scan rejection, exact quote preservation and identity-bound reviews",
  );
  return {
    bootstrapId: bootstrap.id,
    candidateId: current.candidates.find((c) => c.kind === "capability")!.id,
  };
}
