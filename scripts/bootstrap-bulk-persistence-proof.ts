/** Real package, in-memory persistence adapter: no database or accepted writes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { validateBootstrapPackage } from "../lib/bootstrap/contracts";
import { persistCompiledPackage } from "../lib/bootstrap/scan";

async function main() {
  const pkg = validateBootstrapPackage(JSON.parse(readFileSync(process.argv[2], "utf8")));
  assert(pkg.proposals.length > 250);
  const [unchanged, changed] = pkg.proposals.filter(p => p.evidenceRefs.length > 0);
  const candidates: Prisma.BootstrapCandidateCreateManyInput[] = [];
  const links: Prisma.BootstrapEvidenceLinkCreateManyInput[] = [];
  const updates: unknown[] = [];
  let candidateBatches = 0, linkBatches = 0;
  const history = [unchanged, changed].map((p, i) => ({
    id: `prior-${i}`, candidateKey: p.candidateKey,
    sourceFingerprint: i ? "older-fingerprint" : p.fingerprint,
    status: "rejected", dispositionReason: "Operator reviewed", reviewedProposal: { note: "keep this" },
    evidenceLinks: [{ evidenceId: p.evidenceRefs[0], linkState: "detached", attachedBy: "operator", reason: "not relevant" }],
  }));
  const tx = {
    bootstrapCandidate: {
      updateMany: async () => ({ count: 2 }),
      createMany: async ({ data }: { data: Prisma.BootstrapCandidateCreateManyInput[] }) => {
        assert(data.length <= 250); candidateBatches++; candidates.push(...data); return { count: data.length };
      },
    },
    bootstrapEvidenceLink: {
      createMany: async ({ data }: { data: Prisma.BootstrapEvidenceLinkCreateManyInput[] }) => {
        assert(data.length <= 1000); linkBatches++; links.push(...data); return { count: data.length };
      },
    },
    bootstrapPackage: { create: async () => ({ id: "package-row" }) },
    projectBootstrap: { update: async (args: unknown) => { updates.push(args); } },
    bootstrapScanRun: { update: async (args: unknown) => { updates.push(args); } },
  };
  // Stub every query made by the actual production persistence function. Any
  // unexpected query fails (there is intentionally no DATABASE_URL).
  Object.defineProperty(prisma, "bootstrapPackage", { value: { findUnique: async () => null, findFirst: async () => null } });
  Object.defineProperty(prisma, "projectBootstrap", { value: { findUnique: async () => ({ status: "activated" }) } });
  Object.defineProperty(prisma, "bootstrapCandidate", { value: { findMany: async () => history } });
  Object.defineProperty(prisma, "$transaction", { value: async (fn: (client: Prisma.TransactionClient) => Promise<void>, options: { timeout: number }) => {
    assert.equal(options.timeout, 30_000);
    await fn(tx as unknown as Prisma.TransactionClient);
  } });
  await persistCompiledPackage("proof-scan", pkg);
  assert.equal(candidates.length, pkg.proposals.length);
  assert.equal(links.length, pkg.proposals.reduce((n, p) => n + p.evidenceRefs.length, 0));
  assert.equal(new Set(candidates.map(c => c.id)).size, candidates.length);
  assert.equal(new Set(links.map(l => `${l.candidateId}:${l.evidenceId}`)).size, links.length);
  for (const link of links) assert(candidates.some(c => c.id === link.candidateId));
  const retained = candidates.find(c => c.candidateKey === unchanged.candidateKey)!;
  assert.equal(retained.status, "rejected");
  assert.deepEqual(retained.reviewedProposal, { note: "keep this" });
  assert.equal(links.find(l => l.candidateId === retained.id && l.evidenceId === unchanged.evidenceRefs[0])?.linkState, "detached");
  const reopened = candidates.find(c => c.candidateKey === changed.candidateKey)!;
  assert.equal(reopened.status, "pending");
  assert.equal(reopened.changedSincePrior, true);
  assert.equal(links.find(l => l.candidateId === reopened.id && l.evidenceId === changed.evidenceRefs[0])?.linkState, "attached");
  assert.equal(updates.length, 2);
  console.log(JSON.stringify({ ok: true, candidates: candidates.length, evidenceLinks: links.length, candidateBatches, linkBatches, reviewOverlaysPreserved: true, changedSourceReopened: true, databaseWrites: false }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
