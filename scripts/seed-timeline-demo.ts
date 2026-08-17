// DEV ONLY. Seeds the Timeline-specific states that the proofs and the
// screenshot sweep need to exist: a decided Decision, an advisory
// needed-by, manual landmarks in each temporal state, and a context
// package carrying two landmark claims -- one whose evidence honestly
// supplies a date, one that does not.
//
// It creates no Reality that the product would not create itself. Every
// row here is something a human could add by hand through the UI, or that
// the harvester would produce from a real package. Nothing here is
// referenced by the app; it exists so a fresh dev database can show every
// state without waiting months for real history to accumulate.
//
//   npx tsx scripts/seed-timeline-demo.ts

import { PrismaClient } from "@prisma/client";
import { harvestTimelineCandidates } from "../lib/timeline/candidates";

const prisma = new PrismaClient();
const DAY = 86400000;

async function main() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  if (scopes.length === 0) throw new Error("No scopes. Run prisma/seed-dev.ts first.");
  const byName = new Map(scopes.map((s) => [s.name, s]));
  const jsa = byName.get("JSA") ?? scopes[0];
  const platform = byName.get("Platform") ?? scopes[0];
  const design = byName.get("Design") ?? scopes[0];
  const now = Date.now();

  // ── a Decision that was actually answered ─────────────────────────
  const open = await prisma.decision.findFirst({
    where: { scopeId: platform.id, status: "open" },
    orderBy: { createdAt: "asc" },
  });
  if (open) {
    await prisma.decision.update({
      where: { id: open.id },
      data: {
        status: "decided",
        decidedAt: new Date(now - 9 * DAY),
        resolution: "Platform owns the shared tax rules module; JSA consumes it.",
        owner: "Nic",
      },
    });
  }

  // ── an open Decision with an advisory needed-by, still ahead ──────
  const stillOpen = await prisma.decision.findFirst({
    where: { scopeId: jsa.id, status: "open" },
    orderBy: { createdAt: "asc" },
  });
  if (stillOpen) {
    await prisma.decision.update({
      where: { id: stillOpen.id },
      data: { neededBy: new Date(now + 12 * DAY), owner: "Nic" },
    });
  }

  // ── manual landmarks, one per temporal state ──────────────────────
  const landmarks = [
    {
      scopeId: jsa.id,
      title: "JSA build kickoff",
      date: new Date(now - 47 * DAY),
      temporalState: "occurred",
      kind: "kickoff",
      note: "Whole team in the room; scope agreed.",
    },
    {
      scopeId: platform.id,
      title: "Tax engine cutover",
      date: new Date(now - 21 * DAY),
      endDate: new Date(now - 14 * DAY),
      temporalState: "occurred",
      kind: "phase",
      note: "Ran a week; both engines live in parallel.",
    },
    {
      scopeId: jsa.id,
      title: "Customer pilot",
      date: new Date(now + 26 * DAY),
      temporalState: "planned",
      kind: "delivery",
      note: "Two pilot sites lined up.",
    },
    // THE ONE THAT MATTERS. Its date is behind NOW and it is still marked
    // planned, so it reads as OVERDUE rather than quietly becoming history.
    {
      scopeId: design.id,
      title: "Design system freeze",
      date: new Date(now - 6 * DAY),
      temporalState: "planned",
      kind: "milestone",
      note: "Was meant to land last week. Still not done.",
    },

    // ── THE PLAN, RIGHT OF NOW ────────────────────────────────────
    // Business activity with real duration, deliberately OVERLAPPING, so
    // the subtrack packing has something honest to prove itself against.
    // These are the sort of thing Linear will never know: a marketing
    // window, a field pilot, a submission date. Every one is something a
    // person would type into + Add event, or accept from a transcript.
    {
      scopeId: jsa.id,
      title: "Marketing plan",
      date: new Date(now + 8 * DAY),
      endDate: new Date(now + 26 * DAY),
      temporalState: "planned",
      kind: "phase",
      note: "Campaign build, ahead of the pilot.",
    },
    {
      scopeId: jsa.id,
      title: "Field readiness",
      date: new Date(now + 19 * DAY),
      endDate: new Date(now + 40 * DAY),
      temporalState: "planned",
      kind: "phase",
      note: "Overlaps marketing on purpose — the two run together.",
    },
    {
      scopeId: platform.id,
      title: "Launch comms",
      date: new Date(now + 30 * DAY),
      endDate: new Date(now + 52 * DAY),
      temporalState: "planned",
      kind: "phase",
      note: "Overlaps hardening — the announcement is built while the build settles.",
    },
    {
      scopeId: platform.id,
      title: "App Store submission",
      date: new Date(now + 44 * DAY),
      temporalState: "planned",
      kind: "milestone",
      note: "Review window is unpredictable; treated as a fixed date.",
    },
    {
      scopeId: platform.id,
      title: "Hardening",
      date: new Date(now + 21 * DAY),
      endDate: new Date(now + 42 * DAY),
      temporalState: "planned",
      kind: "phase",
      note: null,
    },
    {
      scopeId: design.id,
      title: "Brand refresh",
      date: new Date(now + 12 * DAY),
      endDate: new Date(now + 33 * DAY),
      temporalState: "planned",
      kind: "phase",
      note: null,
    },
  ];
  for (const l of landmarks) {
    const exists = await prisma.timelineEvent.findFirst({ where: { scopeId: l.scopeId, title: l.title } });
    if (!exists) await prisma.timelineEvent.create({ data: { ...l, source: "manual", sourceLabel: "Added by hand" } });
  }

  // ── a context package with two landmark claims ────────────────────
  // One cites evidence that states when it happened; the other does not,
  // and therefore must arrive dateless.
  const packageId = "timeline-demo-1";
  const existing = await prisma.contextSnapshot.findFirst({ where: { producer: "hermes", packageId } });
  if (!existing) {
    const observedAt = new Date(now - 5 * DAY).toISOString();
    await prisma.contextSnapshot.create({
      data: {
        scopeId: jsa.id,
        packageId,
        packageVersion: "1",
        producer: "hermes",
        contextHash: `demo-${packageId}`,
        completenessSummary: {},
        package: {
          version: 1,
          packageId,
          producer: "hermes",
          generatedAt: observedAt,
          scopeId: jsa.id,
          sources: [
            {
              sourceType: "contextDoc",
              sourceRef: "Weekly delivery sync",
              registrationId: null,
              role: "transcript",
              status: "included",
              observedAt,
              succeeded: true,
              detail: "Transcript pushed by Hermes",
            },
          ],
          evidence: [
            {
              id: "ev-kickoff",
              sourceRef: "Weekly delivery sync",
              kind: "note",
              excerpt: "Construct Electric kicked off on site Monday — crew mobilised, first pour done.",
              // The ONLY thing that may supply a date: structured metadata.
              data: { occurredOn: new Date(now - 11 * DAY).toISOString() },
            },
            {
              id: "ev-handover",
              sourceRef: "Weekly delivery sync",
              kind: "note",
              excerpt: "We should get the iTrack handover milestone on the board at some point soon.",
            },
          ],
          derivedClaims: [
            {
              id: "claim-kickoff",
              kind: "kickoff",
              statement: "KIT Construct Electric kicked off",
              evidenceRefs: ["ev-kickoff"],
            },
            {
              id: "claim-handover",
              kind: "milestone",
              statement: "iTrack handover milestone",
              evidenceRefs: ["ev-handover"],
            },
          ],
          completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
          warnings: [],
        },
      },
    });
  }

  // ── EVENT INTAKE, AS IT ACTUALLY ARRIVES ──────────────────────────
  //
  // Two more packages, so the tray holds a believable mixture rather than a
  // pile of one shape. Both go through the real harvester from real
  // ContextSnapshots — nothing is inserted straight into the candidate
  // table — so the provenance on screen is provenance the product produced.
  //
  // The dates come only from structured evidence metadata, using the keys the
  // harvester already recognises. `eventDate` rather than `occurredOn` for
  // anything ahead of us: "occurred on" would be the fixture claiming a
  // future event already happened, which is the exact class of lie this whole
  // boundary exists to prevent.
  const itrack = byName.get("iTrack") ?? scopes[0];
  const packageId2 = "timeline-demo-2";
  if (!(await prisma.contextSnapshot.findFirst({ where: { producer: "hermes", packageId: packageId2 } }))) {
    const observedAt = new Date(now - 5 * DAY).toISOString();
    const kickoffStart = new Date(now + 30 * DAY);
    kickoffStart.setUTCHours(0, 0, 0, 0);
    const kickoffEnd = new Date(kickoffStart.getTime() + 12 * DAY);
    await prisma.contextSnapshot.create({
      data: {
        scopeId: itrack.id,
        packageId: packageId2,
        packageVersion: "1",
        producer: "hermes",
        contextHash: `demo-${packageId2}`,
        completenessSummary: {},
        package: {
          version: 1,
          packageId: packageId2,
          producer: "hermes",
          generatedAt: observedAt,
          scopeId: itrack.id,
          sources: [
            {
              sourceType: "contextDoc",
              sourceRef: "Aug 12 refinement call",
              registrationId: null,
              role: "transcript",
              status: "included",
              observedAt,
              succeeded: true,
              detail: "Transcript pushed by Hermes",
            },
          ],
          evidence: [
            {
              id: "ev-mktg",
              sourceRef: "Aug 12 refinement call",
              kind: "note",
              excerpt:
                "Marketing want their kickoff the week of the 16th and reckon it runs about a fortnight to the launch comms handover.",
              data: { eventDate: kickoffStart.toISOString(), endsOn: kickoffEnd.toISOString() },
            },
            {
              id: "ev-training",
              sourceRef: "Aug 12 refinement call",
              kind: "note",
              excerpt:
                "We still owe the customer a training plan — nobody has said when, and it depends on the pilot landing.",
            },
          ],
          derivedClaims: [
            {
              id: "claim-mktg",
              kind: "phase",
              statement: "Marketing kickoff",
              evidenceRefs: ["ev-mktg"],
            },
            {
              id: "claim-training",
              kind: "milestone",
              statement: "Customer training plan",
              evidenceRefs: ["ev-training"],
            },
          ],
          completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
          warnings: [],
        },
      },
    });
  }

  // A registered Notion source, read by the app itself rather than by
  // Hermes — so the tray shows two different provenances, both real.
  const packageId3 = "timeline-demo-3";
  if (!(await prisma.contextSnapshot.findFirst({ where: { producer: "gap_app", packageId: packageId3 } }))) {
    const observedAt = new Date(now - 2 * DAY).toISOString();
    const reviewOn = new Date(now + 46 * DAY);
    reviewOn.setUTCHours(0, 0, 0, 0);
    await prisma.contextSnapshot.create({
      data: {
        scopeId: platform.id,
        packageId: packageId3,
        packageVersion: "1",
        producer: "gap_app",
        contextHash: `demo-${packageId3}`,
        completenessSummary: {},
        package: {
          version: 1,
          packageId: packageId3,
          producer: "gap_app",
          generatedAt: observedAt,
          scopeId: platform.id,
          sources: [
            {
              sourceType: "notion",
              sourceRef: "Launch readiness",
              registrationId: null,
              role: "plan",
              status: "included",
              observedAt,
              succeeded: true,
              detail: "Registered Notion page",
            },
          ],
          evidence: [
            {
              id: "ev-exec",
              sourceRef: "Launch readiness",
              kind: "note",
              excerpt: "Executive launch review — go/no-go on the store submission.",
              data: { eventDate: reviewOn.toISOString() },
            },
          ],
          derivedClaims: [
            {
              id: "claim-exec",
              kind: "milestone",
              statement: "Executive launch review",
              evidenceRefs: ["ev-exec"],
            },
          ],
          completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
          warnings: [],
        },
      },
    });
  }

  const harvest = await harvestTimelineCandidates({});
  console.log(
    `timeline demo: landmarks=${await prisma.timelineEvent.count()} ` +
      `candidates=${await prisma.timelineEventCandidate.count()} ` +
      `(dated ${harvest.dated}, dateless ${harvest.dateless}, already known ${harvest.alreadyKnown})`
  );
  await prisma.$disconnect();
}

main();
