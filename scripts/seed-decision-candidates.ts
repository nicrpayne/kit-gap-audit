// A REAL HERMES-SHAPED CONTEXT PACKAGE, so the candidate path can be
// proven end to end rather than asserted.
//
// This does NOT insert candidates. It persists one ContextSnapshot through
// the ordinary boundary (lib/context/snapshot.ts) carrying two derived
// claims of kind "decision" with cited transcript evidence -- exactly what
// a refinement-call package would contain. Everything after this point is
// the product's own path: POST /api/decision-candidates scans snapshots,
// and only an explicit human accept creates a Decision.
//
// Idempotent twice over: persistContextSnapshot reuses an identical
// package by (producer, packageId), and the candidate import keys on
// snapshot id + claim id.
//
//   npx tsx scripts/seed-decision-candidates.ts [scopeId]

import { PrismaClient } from "@prisma/client";
import { persistContextSnapshot } from "../lib/context/snapshot";
import type { ProjectContextPackage } from "../lib/context/package";

const prisma = new PrismaClient();

async function main() {
  const scopeId = process.argv[2] ?? "jsa";
  const scope = await prisma.scope.findUnique({ where: { id: scopeId }, select: { id: true, name: true } });
  if (!scope) throw new Error(`Unknown scope "${scopeId}"`);

  const pkg: ProjectContextPackage = {
    version: "1.0",
    packageId: "refinement-call-2026-08-14",
    producer: "hermes",
    generatedAt: "2026-08-14T15:40:00.000Z",
    scopeId: scope.id,
    sources: [
      {
        sourceType: "transcript",
        sourceRef: "Refinement call · 14 Aug",
        registrationId: null, // ad-hoc evidence, not a registered standing source
        role: "refinement",
        status: "candidate",
        observedAt: "2026-08-14T15:05:00.000Z",
        succeeded: true,
        detail: null,
      },
    ],
    evidence: [
      {
        id: "t-0412",
        sourceRef: "Refinement call · 14 Aug",
        kind: "note",
        excerpt:
          "\"Do we store the address as one string or as structured fields? It matters for the Maps lookup later.\"",
      },
      {
        id: "t-0418",
        sourceRef: "Refinement call · 14 Aug",
        kind: "note",
        excerpt:
          "\"If we go single-string now we will have to migrate every record when we add validation.\"",
      },
      {
        id: "t-0530",
        sourceRef: "Refinement call · 14 Aug",
        kind: "note",
        excerpt: "\"The location dropdown should probably come from Google Maps Places rather than our own list.\"",
      },
    ],
    derivedClaims: [
      {
        id: "claim-address-storage",
        kind: "decision",
        statement: "Address storage format",
        evidenceRefs: ["t-0412", "t-0418"],
      },
      {
        id: "claim-location-dropdown",
        kind: "decision",
        statement: "Location dropdown source",
        evidenceRefs: ["t-0530"],
      },
      {
        // Deliberately NOT a decision. Proves the importer ignores claims
        // that are observations rather than choices.
        id: "claim-observation",
        kind: "observation",
        statement: "The team met on 14 Aug",
        evidenceRefs: [],
      },
    ],
    completeness: { expectedSources: ["Refinement call · 14 Aug"], missingSources: [], excludedSources: [] },
    warnings: [],
  };

  const snap = await persistContextSnapshot(pkg, { expectedScopeId: scope.id });
  console.log(
    `${snap.reused ? "reused" : "persisted"} ContextSnapshot ${snap.id} for ${scope.name} ` +
      `(${pkg.derivedClaims!.length} derived claims, ${pkg.evidence.length} evidence items)`
  );
  console.log("No Decision, no Finding, no gate was created by this script.");
  const decisions = await prisma.decision.count();
  const gates = await prisma.decisionGate.count();
  console.log(`decisions=${decisions} gates=${gates}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
