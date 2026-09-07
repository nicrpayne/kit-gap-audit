import { prisma } from "../lib/prisma";
import { compileBootstrapPackage, persistCompiledPackage } from "../lib/bootstrap/scan";
import { richHistoricalCorpus } from "../lib/bootstrap/fixtures";
import { bootstrapHash } from "../lib/bootstrap/hash";

async function ensureHistoricalCorpus() {
  const scope = await prisma.scope.upsert({
    where: { id: "phase1-demo-archive" },
    update: {},
    create: { id: "phase1-demo-archive", name: "Historical knowledge archive", teamKey: "ARCHIVE", projectNames: [] },
  });
  let source = await prisma.source.findFirst({ where: { title: "Harbor Relay planning review", scopeId: scope.id } });
  source ??= await prisma.source.create({ data: {
    kind: "transcript", title: "Harbor Relay planning review", scopeId: scope.id,
    content: "Harbor Relay needs offline transfer, an approval decision, and the launch depends on Dock Gateway. Morgan owns the approval question.",
    createdAt: new Date("2026-08-20T15:00:00.000Z"),
  } });
  const directRef = `signal://source/${source.id}`;
  const pkg = {
    version: "project-context-package-v1", packageId: "phase1-demo-harbor-history-v1", producer: "hermes",
    scope: { id: scope.id, name: scope.name }, generatedAt: "2026-08-22T12:00:00.000Z",
    sources: [
      { sourceType: "transcript", sourceRef: directRef, title: source.title, observedAt: "2026-08-20T15:00:00.000Z", extra: { deepLink: `/audit/${source.id}`, lineageRootIds: ["fixture://transcript/harbor-review"] } },
      { sourceType: "wiki", sourceRef: "ke://wiki/project/harbor-relay", title: "Harbor Relay project synthesis", observedAt: "2026-08-22T12:00:00.000Z", extra: { lineageRootIds: ["fixture://transcript/harbor-review"] } },
    ],
    evidence: [
      { id: "evidence-harbor-direct", excerpt: "Harbor Relay needs offline transfer, an approval decision, and the launch depends on Dock Gateway.", sourceRef: directRef, observedAt: "2026-08-20T15:00:00.000Z", independence: "independent", data: { segmentId: "00:14:22" }, extra: { lineageRootIds: ["fixture://transcript/harbor-review"] } },
      { id: "evidence-harbor-wiki", excerpt: "Harbor Relay needs offline transfer.", sourceRef: "ke://wiki/project/harbor-relay", observedAt: "2026-08-22T12:00:00.000Z", independence: "derivative", data: { blockId: "summary-2" }, extra: { lineageRootIds: ["fixture://transcript/harbor-review"] } },
    ],
    intelligenceObjects: richHistoricalCorpus.intelligence.map((item) => ({
      id: item.id, intelligenceType: item.type, statement: item.statement, isCurrent: item.isCurrent,
      observedDate: item.observedDate, fields: item.fields, evidenceRefs: item.evidenceRefs, provenance: item.provenance,
    })),
    intelligenceRelations: [], derivedClaims: [],
  };
  const existing = await prisma.contextSnapshot.findUnique({ where: { producer_packageId: { producer: "hermes", packageId: pkg.packageId } } });
  if (!existing) await prisma.contextSnapshot.create({ data: {
    scopeId: scope.id, packageId: pkg.packageId, packageVersion: pkg.version, producer: pkg.producer,
    package: pkg, contextHash: bootstrapHash(pkg), completenessSummary: { fixture: true, providers: ["transcript", "wiki"] },
    createdAt: new Date(pkg.generatedAt),
  } });
}

async function main() {
await ensureHistoricalCorpus();
const prior = await prisma.projectBootstrap.findFirst({ where: { normalizedName: "harbor relay", status: { not: "archived" } } });
if (prior) {
  console.log(prior.id);
  await prisma.$disconnect();
  process.exit(0);
}
const bootstrap = await prisma.projectBootstrap.create({ data: {
  canonicalName: "Harbor Relay", normalizedName: "harbor relay", aliases: ["HR", "Relay"],
  ownerHint: "Morgan", sourceHints: ["Planning review", "Project wiki"], searchExistingKnowledge: true, status: "scanning",
} });
const scan = await prisma.bootstrapScanRun.create({ data: {
  bootstrapId: bootstrap.id, sequence: 1, status: "running", stage: "proposal_compilation",
  providerCoverage: [], metrics: {}, warnings: [], startedAt: new Date("2026-09-06T18:00:00.000Z"),
} });
const pkg = compileBootstrapPackage(bootstrap.id, { canonicalName: "Harbor Relay", aliases: ["HR", "Relay"], ownerHint: "Morgan", sourceHints: ["Planning review", "Project wiki"] }, richHistoricalCorpus, new Date("2026-09-06T18:00:00.000Z"));
await persistCompiledPackage(scan.id, pkg);
console.log(bootstrap.id);
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
