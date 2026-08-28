// PERSIST THE EXACT BRIDGE-PRODUCED JSA PACKAGE, LOCALLY.
//
// The file is producer authority and is read BYTE-FOR-BYTE — nothing here
// rewrites, patches or reshapes it. Two things around it have to exist first,
// and both are real requirements of the production handshake rather than
// conveniences for this script:
//
//   THE SCOPE THE PACKAGE NAMES. `pkg.scopeId` is Signal's own cuid for JSA
//   in the deployment the bridge was pointed at. `persistContextSnapshot`
//   refuses a package whose scopeId names no Scope, so a local mirror row is
//   created with that exact id and JSA's own Linear/Notion/Figma config, so
//   the merged graph is JSA's real substrate rather than an empty shell.
//
//   THE TWO REGISTRATIONS. 45 of the 47 sources are ad-hoc; 2 are registered
//   and active and name registration ids by cuid. The source policy refuses a
//   package claiming a registration Signal does not hold — correctly, that is
//   the impersonation check — so those rows are created from what the package
//   itself declares.
//
// Local audit findings and decisions belong to the "jsa" Scope row and do NOT
// follow the mirror; in production they are the same Scope, so the merged
// counts this reports are the substrate plus the payload, minus the audit
// outputs. Reported that way rather than implied away.
//
//   npx tsx scripts/seed-real-jsa-package.ts          seed
//   npx tsx scripts/seed-real-jsa-package.ts --drop   remove it again

import { PrismaClient } from "@prisma/client";
import { persistContextSnapshot } from "../lib/context/snapshot";
import { projectIntelligence } from "../lib/audit/intelligence";
import { readRealPackage, realPackageBytes, REAL_PACKAGE_PATH } from "./lib/real-package";

const prisma = new PrismaClient();

/**
 * WHAT THE HANDSHAKE NEEDS TO EXIST FIRST, in one place — a local mirror of
 * the Scope the package names, and the registrations its two registered
 * sources declare. Exported so the ingest proof establishes exactly the same
 * preconditions rather than a second, drifting copy of them.
 */
export async function ensurePrerequisites(prismaClient = prisma) {
  const pkg = readRealPackage();
  const scopeId = pkg.scopeId;

  const jsa = await prismaClient.scope.findUnique({ where: { id: "jsa" } });
  if (!jsa) throw new Error('No "jsa" Scope to mirror. Run prisma/seed-dev.ts first.');

  await prismaClient.scope.upsert({
    where: { id: scopeId },
    update: {},
    create: {
      id: scopeId,
      name: jsa.name,
      teamKey: jsa.teamKey,
      projectNames: jsa.projectNames,
      labelFilter: jsa.labelFilter,
      targetDate: jsa.targetDate,
      teamCapacity: jsa.teamCapacity,
      includeTriage: jsa.includeTriage,
      estimationContext: jsa.estimationContext,
      notionPageIds: jsa.notionPageIds,
      figmaRefs: jsa.figmaRefs,
      dependsOnScopeIds: jsa.dependsOnScopeIds,
    },
  });

  for (const src of pkg.sources.filter((s) => s.registrationId)) {
    await prismaClient.sourceRegistration.upsert({
      where: { id: src.registrationId! },
      update: { sourceType: src.sourceType, sourceRef: src.sourceRef, status: "active" },
      create: {
        id: src.registrationId!,
        sourceType: src.sourceType,
        sourceRef: src.sourceRef,
        scopeIds: [scopeId],
        role: src.role ?? "raw_evidence",
        status: "active",
        rationale: "Registered source declared by the bridge's own package manifest",
      },
    });
  }
  return scopeId;
}

/** Undo it. */
export async function dropPrerequisites(prismaClient = prisma) {
  const pkg = readRealPackage();
  const regIds = [...new Set(pkg.sources.map((s) => s.registrationId).filter((x): x is string => !!x))];
  const snaps = await prismaClient.contextSnapshot.deleteMany({ where: { packageId: pkg.packageId } });
  const regs = await prismaClient.sourceRegistration.deleteMany({ where: { id: { in: regIds } } });
  await prismaClient.allocation.deleteMany({ where: { scopeId: pkg.scopeId } });
  const sc = await prismaClient.scope.deleteMany({ where: { id: pkg.scopeId } });
  return { snapshots: snaps.count, registrations: regs.count, scopes: sc.count };
}

async function main() {
  const drop = process.argv.includes("--drop");
  const pkg = readRealPackage();
  const scopeId = pkg.scopeId;

  if (drop) {
    const r = await dropPrerequisites();
    console.log(`removed ${r.snapshots} snapshot(s), ${r.registrations} registration(s), ${r.scopes} mirror Scope`);
    return;
  }
  await ensurePrerequisites();

  const bytes = realPackageBytes();
  const result = await persistContextSnapshot(pkg, { expectedScopeId: scopeId });
  const row = await prisma.contextSnapshot.findUnique({ where: { id: result.id } });
  const projected = projectIntelligence([{ id: row!.id, scopeId: row!.scopeId, package: row!.package }], scopeId);

  console.log(
    [
      `file            ${REAL_PACKAGE_PATH.split("/").pop()}`,
      `bytes           ${bytes} (${(bytes / 1024).toFixed(0)} KB)`,
      `packageId       ${pkg.packageId}`,
      `scopeId         ${scopeId}`,
      `snapshot        ${result.id}${result.reused ? " (reused)" : ""}`,
      `hash            ${result.contextHash}`,
      ``,
      `objects         ${projected.objects.length}  (current ${projected.meta.currentCount})`,
      `relations       ${projected.relations.length}  ${JSON.stringify(projected.meta.byRelClass)}`,
      `cited passages  ${projected.citedPassages.length}  anchored ${projected.citedPassages.filter((x) => Object.keys(x.anchor).length > 0).length}`,
      `independence    ${JSON.stringify(
        projected.citedPassages.reduce<Record<string, number>>((a, x) => {
          const k = x.independence ?? "absent (unknown)";
          a[k] = (a[k] ?? 0) + 1;
          return a;
        }, {})
      )}`,
      `dangling        ${projected.meta.danglingCitations}`,
      `out of scope    ${projected.meta.outOfScope}`,
    ].join("\n")
  );
}

// Only when run directly — the helpers above are imported by the ingest
// proof, and a module that seeds a database on import is a trap.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
