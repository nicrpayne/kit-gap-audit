import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const JSA_SCOPE_ID = "cmrpatpkv0000ov1ylif2k088";
const JSA_SNAPSHOT_ID = "cmtu8ppmk0003l21y8933nijc";
const JSA_PACKAGE_ID = "hermes-si-0b95c9006c75fa4fa86931fb151eb7c55cee9442";
const ITRACK_SCOPE_ID = "cmsnchj1g0001pl1y7odyjqsc";
const ITRACK_SNAPSHOT_ID = "cmtu8pp5o0001l21ykss4dtl4";
const ITRACK_PACKAGE_ID = "hermes-si-557be2140577ebced2e0e698913b0c41237fe980";

const evidence = [
  "September 8 is beta day; everyone who's in beta has access.",
  "The extended STKY control flows are cut from beta.",
  "Crew acknowledgment is an optional, explicitly non-blocking experiment; work is never gated.",
  "Midday change and the extended controls were discussed as one package.",
  "Arc-Angel is advisory only, non-blocking, and can be a minimal web service.",
  "Offline, notifications, approval, photo upload, and PDF are NOT Beta requirements.",
  "Quality is provisioned for, not built in iTrack Rev 1.",
  "The later direction is system-derived severity rather than reporter self-selects.",
  "Cam asked for some form of investigation tool in Rev 1.",
  "Colton asked to rebuild iTrack as is, with minimal differences.",
  "The Quality Kaizen is planned for 2026-10-02.",
  "The Oct 31 commitment applies to iTrack 2.0, not to iTrack Quality.",
  "A Platform API is a causal prerequisite for iTrack incident routing.",
];

function contextPackage(project: "JSA" | "iTrack", packageId: string) {
  const observedAt = "2026-09-09T14:57:00.000Z";
  return {
    version: "1.1",
    packageId,
    producer: "hermes",
    generatedAt: observedAt,
    scope: { id: project === "JSA" ? JSA_SCOPE_ID : ITRACK_SCOPE_ID, name: project },
    sources: [{ sourceType: "transcript", sourceRef: `fixture://${project.toLowerCase()}/september-9`, registrationId: null, role: "governing evidence", status: "active", observedAt, succeeded: true, detail: "Screenshot-only mirror of the verified reconciliation." }],
    evidence: evidence.map((excerpt, index) => ({ id: `${project.toLowerCase()}-evidence-${index + 1}`, sourceRef: `fixture://${project.toLowerCase()}/september-9`, kind: "transcript passage", excerpt, observedAt })),
    derivedClaims: [],
    intelligenceObjects: evidence.map((statement, index) => ({ id: `${project.toLowerCase()}-intelligence-${index + 1}`, intelligenceType: index === 12 ? "Dependency" : "Observation", trust: "external_intelligence", statement, status: "current", isCurrent: true, observedDate: "2026-09-08", scope: [project], evidenceRefs: [`${project.toLowerCase()}-evidence-${index + 1}`] })),
    intelligenceRelations: [],
    completeness: { state: "partial", detail: "Verified reconciliation baseline." },
    warnings: ["Local screenshot fixture; no production state."],
  };
}

async function seedProject(input: { scopeId: string; snapshotId: string; packageId: string; name: string }) {
  const existing = await prisma.scope.findUnique({ where: { id: input.scopeId } });
  if (existing) return;
  const scope = await prisma.scope.create({ data: {
    id: input.scopeId,
    name: input.name,
    teamKey: "SOF",
    projectNames: [`KIT ${input.name}`],
    executionState: "configured",
    executionDetail: "Mapped, but zero current issues returned; confirmation required.",
  } });
  const bootstrap = await prisma.projectBootstrap.create({ data: {
    canonicalName: input.name,
    normalizedName: input.name.toLowerCase(),
    aliases: [input.name],
    sourceHints: ["Hermes current state"],
    status: "activated",
    reviewRevision: 1,
  } });
  const scan = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: bootstrap.id,
    sequence: 1,
    status: "complete",
    stage: "complete",
    providerCoverage: [{ provider: "hermes", state: "available" }] as Prisma.InputJsonValue,
    metrics: { transcripts: 40, intelligenceObjects: 85 } as Prisma.InputJsonValue,
    warnings: [] as Prisma.InputJsonValue,
    startedAt: new Date("2026-09-09T14:11:00.000Z"),
    completedAt: new Date("2026-09-09T14:57:00.000Z"),
  } });
  const pkg = contextPackage(input.name as "JSA" | "iTrack", input.packageId);
  const packageRow = await prisma.bootstrapPackage.create({ data: {
    bootstrapId: bootstrap.id,
    scanRunId: scan.id,
    packageId: input.packageId,
    packageVersion: "1.1",
    producer: "hermes",
    compilerVersion: "screenshot-baseline-v1",
    packageHash: `screenshot-${input.name.toLowerCase()}`,
    package: pkg as Prisma.InputJsonValue,
    generatedAt: new Date("2026-09-09T14:57:00.000Z"),
  } });
  await prisma.bootstrapScanRun.update({ where: { id: scan.id }, data: { resultPackageId: packageRow.id } });
  await prisma.projectBootstrap.update({ where: { id: bootstrap.id }, data: { activePackageId: packageRow.id } });
  const snapshot = await prisma.contextSnapshot.create({ data: {
    id: input.snapshotId,
    scopeId: scope.id,
    packageId: `bootstrap-refresh:${input.packageId}`,
    packageVersion: "1.1",
    producer: "hermes",
    package: pkg as Prisma.InputJsonValue,
    contextHash: `screenshot-${input.name.toLowerCase()}`,
    completenessSummary: { state: "partial", providers: { hermes: "current" } } as Prisma.InputJsonValue,
    createdAt: new Date("2026-09-09T14:57:30.000Z"),
  } });
  const audit = await prisma.auditRun.create({ data: {
    contextSnapshotId: snapshot.id,
    issueCount: input.name === "JSA" ? 438 : 543,
    findingCount: 0,
    model: "governed-refresh-v1",
    createdAt: new Date("2026-09-09T14:58:00.000Z"),
  } });
  await prisma.projectActivation.create({ data: {
    bootstrapId: bootstrap.id,
    scopeId: scope.id,
    reviewRevision: 1,
    manifestVersion: "1.0",
    manifest: { baseline: true, canonicalWrites: 0 } as Prisma.InputJsonValue,
    contextSnapshotId: snapshot.id,
    firstAuditRunId: audit.id,
  } });
}

async function main() {
  await seedProject({ scopeId: JSA_SCOPE_ID, snapshotId: JSA_SNAPSHOT_ID, packageId: JSA_PACKAGE_ID, name: "JSA" });
  await seedProject({ scopeId: ITRACK_SCOPE_ID, snapshotId: ITRACK_SNAPSHOT_ID, packageId: ITRACK_PACKAGE_ID, name: "iTrack" });
  const requestedKnowledge = process.env.DEMO_KNOWLEDGE_STATE ?? "current";
  const knowledgeState = requestedKnowledge === "new"
    ? { state: "current", watermark: "2026-09-09T16:00:00.000Z", detail: "A newer completed Hermes state is ready." }
    : requestedKnowledge === "ingesting"
      ? { state: "ingesting", watermark: "2026-09-09T14:57:00.000Z", detail: "Hermes is still ingesting." }
      : { state: "current", watermark: "2026-09-09T14:57:00.000Z", detail: "Latest completed Hermes state." };
  await prisma.bootstrapCompanion.upsert({
    where: { id: "screenshot-companion" },
    create: { id: "screenshot-companion", label: "Knowledge companion", version: "0.3.0", state: "online", capabilities: ["project-refresh"], lastSeenAt: new Date(), knowledgeState },
    update: { state: "online", lastSeenAt: new Date(), knowledgeState },
  });
  console.log(JSON.stringify({ ok: true, jsa: JSA_SCOPE_ID, itrack: ITRACK_SCOPE_ID }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
