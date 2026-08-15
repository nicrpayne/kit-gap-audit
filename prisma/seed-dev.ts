// Local design/development seed -- a realistic multi-Scope portfolio with
// dependencies, a named capacity pool, blocking decisions, and enough
// report history for Momentum's trend to be real rather than mocked.
// Pairs with KIT_DEV_FIXTURES=1 (lib/dev/fixtures.ts), which supplies the
// Linear side. Never run against a real database:
//   DATABASE_URL=... npx tsx prisma/seed-dev.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86400000);
}

async function main() {
  // Wipe the local dev graph so reseeding is idempotent.
  //
  // The Decision and Context layers arrived after this script did, and both
  // hold foreign keys into Scope. Leaving them behind made `scope.deleteMany`
  // fail on ContextSnapshot_scopeId_fkey, so a second reseed silently did
  // nothing and later proof runs inherited the previous run's decisions --
  // which is how a correct duplicate-title warning got mistaken for a tool
  // that would not close. Wipe them first, deepest child outwards.
  await prisma.decisionEvidence.deleteMany({});
  await prisma.decisionGate.deleteMany({});
  await prisma.decisionCandidate.deleteMany({});
  await prisma.decision.deleteMany({});
  await prisma.contextSnapshot.deleteMany({});
  await prisma.finding.deleteMany({});
  await prisma.source.deleteMany({});
  await prisma.report.deleteMany({});
  await prisma.allocation.deleteMany({});
  await prisma.person.deleteMany({});
  await prisma.workEstimate.deleteMany({});
  await prisma.contextDoc.deleteMany({});
  await prisma.scope.deleteMany({});

  // Platform: capacity INFERRED from Linear (no allocations, no explicit
  // value) -- the fixture puts 10 distinct assignees on remaining work, so
  // Reality resolves to 10 FTE. This is the case that was opaque in
  // production and is now the main thing the Instrument has to explain.
  const platform = await prisma.scope.create({
    data: {
      id: "platform",
      name: "Platform",
      teamKey: "PLAT",
      projectNames: ["KIT Platform"],
      targetDate: daysFromNow(34),
      teamCapacity: null,
      dependsOnScopeIds: [],
    },
  });

  // Design: allocations-sourced, and shares Sam with JSA -- the only way
  // context-switch cost can actually bite, so the Instrument's "what does
  // this affect" answer has something true to report.
  const design = await prisma.scope.create({
    data: {
      id: "design",
      name: "Design",
      teamKey: "DSN",
      projectNames: ["KIT Design"],
      targetDate: null, // deliberately no target -- exercises the NO TARGET state
      teamCapacity: null,
      dependsOnScopeIds: [],
    },
  });

  const jsa = await prisma.scope.create({
    data: {
      id: "jsa",
      name: "JSA",
      teamKey: "SOF",
      projectNames: ["KIT Safety (JSA and iTrack)"],
      targetDate: daysFromNow(33),
      teamCapacity: null,
      dependsOnScopeIds: [platform.id],
    },
  });

  // iTrack: EXPLICIT aggregate capacity -- somebody typed 5.
  const itrack = await prisma.scope.create({
    data: {
      id: "itrack",
      name: "iTrack",
      teamKey: "TRK",
      projectNames: ["KIT iTrack"],
      targetDate: daysFromNow(30),
      teamCapacity: 5,
      dependsOnScopeIds: [platform.id],
    },
  });

  // JSA and Design are the ALLOCATIONS-sourced scopes; Sam is split across
  // both, which is the only configuration in which context-switch cost has
  // any effect at all.
  const people = await Promise.all(
    [
      { name: "Sam Ortiz", fte: 1.0 },
      { name: "Maru Tanaka", fte: 1.0 },
      { name: "Lucy Bell", fte: 0.6 },
      { name: "Alex Reyes", fte: 1.0 },
    ].map((p) => prisma.person.create({ data: p }))
  );
  const [sam, maru, lucy, alex] = people;

  await prisma.allocation.createMany({
    data: [
      { personId: maru.id, scopeId: jsa.id, fraction: 1.0 },
      { personId: lucy.id, scopeId: jsa.id, fraction: 1.0 },
      { personId: alex.id, scopeId: jsa.id, fraction: 0.8 },
      { personId: sam.id, scopeId: jsa.id, fraction: 0.6 },
      { personId: sam.id, scopeId: design.id, fraction: 0.4 },
    ],
  });

  await prisma.portfolioSettings.upsert({
    where: { id: "singleton" },
    update: { contextSwitchCostPct: 12 },
    create: { id: "singleton", contextSwitchCostPct: 12 },
  });

  // Blocking decisions -> DecisionGates in the simulation. These are the
  // real "gates" pressure readout, not decoration.
  const notes = await prisma.source.create({
    data: {
      kind: "notes",
      title: "Notes — status sync",
      content: "Working notes from the weekly status sync.",
      scopeId: jsa.id,
    },
  });
  const platNotes = await prisma.source.create({
    data: {
      kind: "notes",
      title: "Notes — platform planning",
      content: "Platform planning notes.",
      scopeId: platform.id,
    },
  });

  await prisma.finding.createMany({
    data: [
      {
        sourceId: notes.id,
        type: "decision",
        title: "JSA/iTrack design ownership split unresolved",
        quote: "JSA / iTrack design ownership split — Lucy vs Maru",
        rationale: "Design work can't be assigned until this is settled.",
        severity: "high",
        blocking: true,
        owner: "Nic",
        blocks: "Design work assignment across JSA/iTrack",
        estimateHint: "about a week to settle",
        status: "open",
      },
      {
        sourceId: notes.id,
        type: "decision",
        title: "App Store submission timeline has unbounded rejection risk",
        quote: "submission is 'a bit of a gamble'",
        rationale: "Resubmission cycles aren't bounded in the plan.",
        severity: "high",
        blocking: true,
        owner: "Alex",
        blocks: "Committing to a firm release date",
        estimateHint: "one to three weeks",
        status: "open",
      },
      {
        sourceId: platNotes.id,
        type: "decision",
        title: "GitHub/VPN access levels blocker needs an owner",
        quote: "Needs an owner today.",
        rationale: "Infra work is already in progress and will stall.",
        severity: "high",
        blocking: true,
        owner: "Sam / James if out",
        blocks: "Infra work already in progress",
        estimateHint: "a couple of days",
        status: "open",
      },
      {
        sourceId: notes.id,
        type: "missing_work",
        title: "Offline conflict resolution never scoped",
        quote: "what happens when two crews edit the same JSA offline?",
        rationale: "Not represented in any ticket.",
        severity: "medium",
        blocking: false,
        estimateHint: "a week or so",
        status: "open",
      },
    ],
  });

  // Report history -- eight weekly reports per scope. Momentum reads the
  // most recent one; the trend sparkline reads the series. The shapes
  // differ on purpose so the three scopes tell three different stories:
  // Platform is improving, JSA has slipped then steadied, iTrack is flat.
  const series: Record<string, { likely: number[]; conf: number[] }> = {
    [platform.id]: {
      likely: [86, 82, 79, 74, 71, 66, 61, 57],
      conf: [21, 27, 33, 38, 44, 51, 58, 64],
    },
    [jsa.id]: {
      likely: [64, 68, 73, 79, 84, 86, 86, 85],
      conf: [58, 52, 46, 38, 33, 31, 32, 34],
    },
    [itrack.id]: {
      likely: [104, 103, 105, 104, 103, 104, 103, 104],
      conf: [40, 41, 39, 40, 41, 40, 41, 40],
    },
  };

  for (const [scopeId, s] of Object.entries(series)) {
    for (let i = 0; i < s.likely.length; i++) {
      const weeksAgo = s.likely.length - i;
      const generatedAt = daysFromNow(-weeksAgo * 7);
      const likelyDate = new Date(generatedAt.getTime() + s.likely[i] * 86400000);
      await prisma.report.create({
        data: {
          scopeId,
          generatedAt,
          targetDate: daysFromNow(74),
          likelyDate,
          earliestDate: new Date(likelyDate.getTime() - 12 * 86400000),
          latestDate: new Date(likelyDate.getTime() + 21 * 86400000),
          confidenceAtTarget: s.conf[i],
          likelyDateDeltaDays: i === 0 ? null : s.likely[i] - s.likely[i - 1],
          shippedCount: 2 + (i % 3),
          blockingCount: 3,
          resolvedSinceLastCount: i % 2,
          summaryMarkdown: "Local dev seed report.",
        },
      });
    }
  }

  console.log("Seeded: 4 scopes, 4 people, 5 allocations, 4 findings, 24 reports.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
