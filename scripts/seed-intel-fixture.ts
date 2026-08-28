// SEED THE SYNTHETIC INTELLIGENCE PAYLOAD, THROUGH THE REAL BOUNDARY.
//
// A DEV FIXTURE. Every statement it writes is prefixed `[synthetic]`, the
// package warns about itself, and nothing in the app treats it differently
// from real intelligence — which is the point: this exercises the actual
// path a Hermes push takes.
//
// It also settles the persistence question empirically. External
// intelligence needs NO new Prisma model, NO new column and NO new index:
// it rides inside `ContextSnapshot.package`, the Json column that already
// holds the producer's package verbatim, and the graph read already loads
// those snapshots for Requirements. This script proves that by going
// through `persistContextSnapshot` — the same function POST /api/refresh
// calls — with an unchanged schema.
//
//   npx tsx scripts/seed-intel-fixture.ts        seed
//   npx tsx scripts/seed-intel-fixture.ts --drop remove it again

import { PrismaClient } from "@prisma/client";
import { persistContextSnapshot } from "../lib/context/snapshot";
import { projectIntelligence } from "../lib/audit/intelligence";
import { buildIntelligenceFixturePackage, JSA_SCALE } from "./lib/intel-fixture";

const prisma = new PrismaClient();
const SCOPE = "jsa";

async function main() {
  const drop = process.argv.includes("--drop");
  const pkg = buildIntelligenceFixturePackage(SCOPE);

  if (drop) {
    const removed = await prisma.contextSnapshot.deleteMany({
      where: { packageId: pkg.packageId, producer: pkg.producer },
    });
    console.log(`removed ${removed.count} synthetic snapshot(s)`);
    return;
  }

  const scope = await prisma.scope.findUnique({ where: { id: SCOPE } });
  if (!scope) throw new Error(`No "${SCOPE}" Scope. Run prisma/seed-dev.ts first.`);

  const before = await prisma.contextSnapshot.count();
  const result = await persistContextSnapshot(pkg, { expectedScopeId: SCOPE });
  const after = await prisma.contextSnapshot.count();

  // Read it back the way the graph does — from the Json column, with no
  // schema change behind it.
  const row = await prisma.contextSnapshot.findUnique({ where: { id: result.id } });
  const projected = projectIntelligence(
    [{ id: row!.id, scopeId: row!.scopeId, package: row!.package }],
    SCOPE
  );

  console.log(
    [
      `snapshot        ${result.id}${result.reused ? " (reused)" : ""}`,
      `rows            ${before} → ${after}`,
      `objects         ${projected.objects.length}/${JSA_SCALE.objects}`,
      `current         ${projected.meta.currentCount}/${JSA_SCALE.currentObjects}`,
      `relations       ${projected.relations.length}/${JSA_SCALE.relations} ` +
        `{temporal ${projected.meta.byRelClass.temporal ?? 0}, semantic ${projected.meta.byRelClass.semantic ?? 0}, ` +
        `contextual ${projected.meta.byRelClass.contextual ?? 0}}`,
      `cited passages  ${projected.citedPassages.length}`,
      `dangling        ${projected.meta.danglingCitations}`,
      "",
      "PERSISTENCE: no new model, no new column, no new index — the package's",
      "own Json column carried all of it, and the graph read that already",
      "loads these snapshots for Requirements picked it up unchanged.",
    ].join("\n")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
