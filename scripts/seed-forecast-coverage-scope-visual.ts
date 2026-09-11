import { PrismaClient } from "@prisma/client";

if (process.env.FORECAST_SCOPE_VISUAL_FIXTURE !== "1") {
  throw new Error("Use only with the disposable visual-proof database.");
}

const prisma = new PrismaClient();
const provenance = { fixture: "forecast-coverage-scope-composer-fix" };

async function main() {
  const platform = await prisma.scope.create({
    data: {
      id: "visual-platform",
      name: "Platform",
      teamKey: "PLAT",
      projectNames: ["KIT Platform"],
      executionState: "configured",
    },
  });
  const jsa = await prisma.scope.create({
    data: {
      id: "visual-jsa",
      name: "JSA",
      teamKey: "EMPTY-JSA",
      projectNames: ["KIT JSA"],
      executionState: "configured",
      dependsOnScopeIds: [platform.id],
    },
  });
  const itrack = await prisma.scope.create({
    data: {
      id: "visual-itrack",
      name: "iTrack",
      teamKey: "EMPTY-ITRACK",
      projectNames: ["KIT iTrack"],
      targetDate: new Date("2026-10-31T00:00:00.000Z"),
      executionState: "configured",
      dependsOnScopeIds: [platform.id],
    },
  });

  for (const [name, description, status] of [
    ["Crew acknowledgment", "Optional, explicitly non-blocking after approval; collect usage data.", "accepted"],
    ["Arc-Angel JSA guidance", "Advisory safety suggestions inside existing information boxes.", "accepted"],
    ["Expanded STKY control flows", "Cut from the current JSA release.", "removed"],
    ["Midday JSA change flow", "Outside the current JSA release.", "removed"],
    ["Offline support", "Post-beta JSA V1 candidate.", "planned"],
    ["JSA notifications", "Post-beta JSA V1 candidate.", "planned"],
    ["Photo upload", "Post-beta JSA V1 candidate.", "planned"],
    ["Submission and job-lead approvals", "Post-beta JSA V1 candidate.", "planned"],
    ["PDF / Docufy output", "Post-beta JSA V1 candidate.", "planned"],
  ] as const) {
    await prisma.capability.create({ data: { scopeId: jsa.id, name, description, status, provenance } });
  }
  await prisma.capability.create({
    data: {
      scopeId: itrack.id,
      name: "iTrack Quality",
      description: "Rev 1 provisions for Quality but does not build the Quality workflow.",
      status: "provision_only",
      provenance,
    },
  });

  await prisma.decision.create({
    data: {
      scopeId: jsa.id,
      title: "What roles and IT Portal access model belongs in JSA V1?",
      rationale: "Confirm the V1 roles, access boundaries, and IT Portal handoff.",
    },
  });
  for (const [title, rationale] of [
    ["What event or severity triggers each iTrack notification?", "Notification boundary remains governed and unresolved."],
    ["Who belongs in the named iTrack investigation charter group?", "The charter group remains governed and unresolved."],
    ["Which channels should iTrack Rev 1 notifications use?", "Channel choice remains governed and unresolved."],
    ["What investigation capability belongs in iTrack Rev 1?", "Two current organizational directions remain unresolved."],
  ]) {
    await prisma.decision.create({ data: { scopeId: itrack.id, title, rationale } });
  }
  await prisma.decision.create({
    data: {
      scopeId: itrack.id,
      title: "Test",
      rationale: "Legacy migrated gate preserved for production-shaped reproduction.",
      gate: {
        create: {
          targetScopeId: itrack.id,
          dependency: "Legacy serial test dependency",
          evidenceForGate: "Production-shaped disposable fixture",
          low: 1,
          likely: 4,
          high: 10,
          serial: true,
          provenance: "migrated",
        },
      },
    },
  });

  console.log(JSON.stringify({ ok: true, scopes: [jsa.id, platform.id, itrack.id] }));
}

main().finally(() => prisma.$disconnect());
