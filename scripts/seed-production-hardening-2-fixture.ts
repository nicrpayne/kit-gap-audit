// Disposable-only browser fixture for Production Hardening 2.
// Refuses every database except the named localhost container below.
import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is required.");
const url = new URL(rawUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55433" || url.pathname !== "/signal_ph2") {
  throw new Error("Refusing to seed anything except localhost:55433/signal_ph2.");
}

const prisma = new PrismaClient();
const now = new Date("2026-09-05T12:00:00.000Z");
const asOf = new Date("2026-08-05T12:00:00.000Z");
const likely = new Date("2026-09-17T00:00:00.000Z");

async function main() {
  const itrack = await prisma.scope.create({
    data: { id: "itrack", name: "iTrack", teamKey: "EMPTY-ITRACK", projectNames: ["iTrack"], teamCapacity: null },
  });
  const platform = await prisma.scope.create({
    data: { id: "platform", name: "Platform", teamKey: "PH2", projectNames: ["Platform"], teamCapacity: null, dependsOnScopeIds: [itrack.id] },
  });
  const jsa = await prisma.scope.create({
    data: { id: "jsa", name: "JSA", teamKey: "EMPTY-JSA", projectNames: ["JSA"], teamCapacity: null, dependsOnScopeIds: [platform.id] },
  });

  await prisma.person.createMany({ data: [
    { id: "person-1", name: "Person 1", fte: 1 },
    { id: "person-2", name: "Person 2", fte: 1 },
    { id: "person-3", name: "Person 3", fte: 1 },
  ] });
  await prisma.portfolioSettings.upsert({
    where: { id: "singleton" },
    update: { contextSwitchCostPct: 10 },
    create: { id: "singleton", contextSwitchCostPct: 10 },
  });

  const source = await prisma.source.create({
    data: { id: "source-jsa", kind: "notes", title: "JSA coverage review", content: "Required work is described but not represented as executable Reality.", scopeId: jsa.id, createdAt: asOf },
  });
  await prisma.finding.create({
    data: {
      id: "finding-missing-work",
      sourceId: source.id,
      type: "missing_work",
      title: "Required JSA work is not represented in Linear",
      quote: "The release still needs the operating checklist.",
      rationale: "No canonical executable work item represents it.",
      severity: "high",
      status: "open",
      blocking: false,
      matchedIssues: [],
      createdAt: asOf,
    },
  });

  await prisma.decision.create({
    data: { id: "decision-open", scopeId: jsa.id, title: "Choose the operating sequence", status: "open", owner: "Nic", createdAt: new Date("2026-08-03T00:00:00.000Z") },
  });
  await prisma.decision.create({
    data: {
      id: "decision-gated",
      scopeId: jsa.id,
      title: "Approve the iTrack handoff",
      status: "open",
      owner: "Nic",
      createdAt: new Date("2026-08-04T00:00:00.000Z"),
      gate: {
        create: {
          id: "gate-itrack",
          targetScopeId: itrack.id,
          dependency: "iTrack delivery waits for the handoff decision.",
          evidenceForGate: "Accepted operating review note.",
          low: 10,
          likely: 12,
          high: 14,
          serial: true,
          provenance: "manual",
        },
      },
    },
  });

  const rawCss = "@font-face{font-family:x;src:url(data:font/woff2;base64," + "A".repeat(12_000) + ")}";
  await prisma.report.create({
    data: {
      id: "report-legacy-html",
      scopeId: jsa.id,
      generatedAt: asOf,
      targetDate: null,
      likelyDate: likely,
      earliestDate: new Date("2026-09-15T00:00:00.000Z"),
      latestDate: new Date("2026-09-20T00:00:00.000Z"),
      confidenceAtTarget: null,
      likelyDateDeltaDays: null,
      shippedCount: 0,
      blockingCount: 1,
      resolvedSinceLastCount: 0,
      summaryMarkdown: `<!DOCTYPE html><html><head><title>Linear is down</title><style>${rawCss}</style></head><body>Source fetch failed</body></html>`,
    },
  });

  console.log(JSON.stringify({ fixture: "production-hardening-2-live-truth-v1", now: now.toISOString(), scopeId: jsa.id }));
}

main().finally(() => prisma.$disconnect());
