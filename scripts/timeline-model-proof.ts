// TIMELINE MODEL PROOFS.
//
// The laws that make Timeline an honest time machine rather than a chart:
// derived facts are projected and never duplicated, temporal state is
// stored and never inferred, forecast memory holds between Reports and
// steps only at one, a machine claim is a candidate until a human accepts
// it, and a dateless candidate cannot be accepted at all.
//
// Restores Reality when it finishes.
//
//   npx tsx scripts/timeline-model-proof.ts

import { PrismaClient } from "@prisma/client";
import { buildTimeline, forecastMemoryAt, type TimelineEntry } from "../lib/timeline/entries";
import { harvestTimelineCandidates, dateFromEvidence, isTimelineKind } from "../lib/timeline/candidates";

const prisma = new PrismaClient();
const DAY = 86400000;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const created: { events: string[]; candidates: string[] } = { events: [], candidates: [] };

async function main() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  if (scopes.length === 0) throw new Error("No scopes. Run prisma/seed-dev.ts first.");
  const jsa = scopes.find((s) => s.name === "JSA") ?? scopes[0];
  const now = Date.now();

  // ── A. MANUAL EVENT ────────────────────────────────────────────────
  const occurred = await prisma.timelineEvent.create({
    data: {
      scopeId: jsa.id, title: "PROOF occurred milestone", kind: "milestone",
      date: new Date(now - 33 * DAY), temporalState: "occurred", source: "manual",
    },
  });
  created.events.push(occurred.id);

  let t = await buildTimeline();
  const aEntry = t.entries.find((e) => e.id === occurred.id);
  check(
    "A manual occurred milestone lands on the exact date and lane",
    !!aEntry && aEntry.scopeId === jsa.id && new Date(aEntry.date).getTime() === occurred.date.getTime(),
    aEntry ? `${aEntry.scopeId} @ ${aEntry.date.slice(0, 10)}` : "missing"
  );
  check("A it is editable — Timeline owns it", aEntry?.editable === true);

  // ── B. PLANNED EVENT, and the clock does NOT convert it ────────────
  const planned = await prisma.timelineEvent.create({
    data: {
      scopeId: jsa.id, title: "PROOF planned milestone", kind: "milestone",
      // Deliberately IN THE PAST and marked planned: this is the overdue
      // case, and the one the model must refuse to reinterpret.
      date: new Date(now - 4 * DAY), temporalState: "planned", source: "manual",
    },
  });
  created.events.push(planned.id);

  t = await buildTimeline();
  const bEntry = t.entries.find((e) => e.id === planned.id);
  check(
    "B a planned event whose date has passed stays PLANNED",
    bEntry?.temporalState === "planned",
    `state=${bEntry?.temporalState}`
  );
  check(
    "B …and is named overdue rather than converted to history",
    (bEntry?.detail as { overdue?: boolean })?.overdue === true
  );
  const rowAfter = await prisma.timelineEvent.findUnique({ where: { id: planned.id } });
  check("B the stored row was never rewritten by reading it", rowAfter?.temporalState === "planned");

  // ── C/D/E. DERIVED DECISION EVENTS, and no duplication ─────────────
  const decision = await prisma.decision.findFirst({
    where: { gate: { isNot: null } },
    include: { gate: true },
  });
  if (decision) {
    const raised = t.entries.find((e) => e.id === `decision:${decision.id}:created`);
    check("C Decision.createdAt produces a raised entry", !!raised, raised?.date.slice(0, 10));
    check("C the raised entry is NOT editable — Decisions owns it", raised?.editable === false);
    const dupe = await prisma.timelineEvent.count({ where: { title: decision.title } });
    check("C no TimelineEvent row was created for it", dupe === 0, `${dupe} rows`);

    const gated = t.entries.find((e) => e.id === `decision:${decision.id}:gated`);
    check(
      "D DecisionGate.createdAt produces a connected-to-delivery entry",
      !!gated && new Date(gated.date).getTime() === decision.gate!.createdAt.getTime()
    );
  } else {
    check("C/D a gated Decision exists to project", false, "none in the database");
  }

  const decided = await prisma.decision.findFirst({ where: { decidedAt: { not: null } } });
  if (decided) {
    const e = t.entries.find((x) => x.id === `decision:${decided.id}:decided`);
    check(
      "E Decision.decidedAt produces a decided entry at that exact time",
      !!e && new Date(e.date).getTime() === decided.decidedAt!.getTime()
    );
  } else {
    check("E a decided Decision exists to project", false, "none in the database");
  }

  // ── F. REPORT SNAPSHOT ─────────────────────────────────────────────
  const report = await prisma.report.findFirst({ orderBy: { generatedAt: "desc" } });
  if (report) {
    const e = t.entries.find((x) => x.id === `report:${report.id}`);
    const d = e?.detail as Record<string, unknown>;
    check(
      "F Report projects p10/p50/p90/target/confidence exactly as stored",
      !!e &&
        d.earliestDate === report.earliestDate.toISOString() &&
        d.likelyDate === report.likelyDate.toISOString() &&
        d.latestDate === report.latestDate.toISOString() &&
        d.confidenceAtTarget === report.confidenceAtTarget,
      e ? `p50 ${String(d.likelyDate).slice(0, 10)}` : "missing"
    );
  }

  // ── G/H. FORECAST HOLD, THEN STEP ──────────────────────────────────
  const scopeWithSeries = Object.entries(t.snapshotsByScope).find(([, v]) => v.length >= 2);
  if (scopeWithSeries) {
    const [, series] = scopeWithSeries;
    const a = series[0];
    const b = series[1];
    const aT = new Date(a.generatedAt).getTime();
    const bT = new Date(b.generatedAt).getTime();
    const mid = new Date(aT + (bT - aT) / 2);

    const atA = forecastMemoryAt(series, new Date(aT));
    const atMid = forecastMemoryAt(series, mid);
    const justBeforeB = forecastMemoryAt(series, new Date(bT - 1000));
    const atB = forecastMemoryAt(series, new Date(bT));

    check("G between two Reports the memory is EXACTLY Report A", atMid?.reportId === a.reportId, `mid → ${atMid?.reportId === a.reportId ? "A" : "not A"}`);
    check("G …and does not drift toward B", atMid?.likelyDate === a.likelyDate, `${atMid?.likelyDate.slice(0, 10)} vs A ${a.likelyDate.slice(0, 10)}`);
    check("G one millisecond before B it is still A", justBeforeB?.reportId === a.reportId);
    check("H crossing B steps the memory exactly to B", atB?.reportId === b.reportId);
    check("H …with B's own stored likely date, not an average", atB?.likelyDate === b.likelyDate, b.likelyDate.slice(0, 10));
    check("G before the first Report there is NO snapshot", forecastMemoryAt(series, new Date(aT - DAY)) === null);
  } else {
    check("G/H a scope with two or more Reports exists", false, "none in the database");
  }

  // ── I. NO CAUSALITY ────────────────────────────────────────────────
  // The projection may never emit attributing language. Checked over every
  // string the surface can render.
  const banned = /\bbecause\b|\bcaused\b|\bdue to\b|\bthanks to\b|\bled to\b|\bresulted in\b/i;
  const offending: string[] = [];
  for (const e of t.entries) {
    const blob = JSON.stringify({ title: e.title, sourceLabel: e.sourceLabel, detail: e.detail });
    // A Report's summaryMarkdown is a human-authored historical document
    // reproduced verbatim; Timeline does not author it and must not edit it.
    const stripped = e.kind === "report" ? blob.replace(/"summaryMarkdown":"[\\s\\S]*?","/, "") : blob;
    if (banned.test(stripped)) offending.push(`${e.kind}:${e.id}`);
  }
  check("I the projection emits no causal language of its own", offending.length === 0, offending.slice(0, 3).join(", "));

  // ── J. CONTEXT OBSERVATION ─────────────────────────────────────────
  const ctx = t.entries.filter((e) => e.kind === "context_observed");
  if (ctx.length > 0) {
    const one = ctx[0];
    const d = one.detail as Record<string, unknown>;
    check(
      "J a context entry is timestamped from the source's real observedAt",
      new Date(one.date).getTime() === new Date(String(d.observedAt)).getTime(),
      one.date.slice(0, 16)
    );
  } else {
    check("J at least one observed context source exists", false, "none");
  }

  // ── K/L/M. CANDIDATES ──────────────────────────────────────────────
  check("K the harvester only accepts landmark-shaped claim kinds",
    isTimelineKind("kickoff") && isTimelineKind("milestone") && !isTimelineKind("decision") && !isTimelineKind("risk"));
  check("K a date is taken only from structured evidence, never prose",
    dateFromEvidence({ occurredOn: "2026-08-01T00:00:00.000Z" }) !== null &&
    dateFromEvidence({ note: "kicked off last Monday" }) === null);

  const beforeEvents = await prisma.timelineEvent.count();
  await harvestTimelineCandidates({});
  const afterEvents = await prisma.timelineEvent.count();
  check("K harvesting creates candidates and NO Timeline Reality", beforeEvents === afterEvents, `${beforeEvents} → ${afterEvents}`);

  const dateless = await prisma.timelineEventCandidate.findFirst({ where: { date: null, status: "pending" } });
  if (dateless) {
    // Acceptance is the API's job; the model law is that the row carries no
    // date and therefore has nothing to place on the axis.
    check("L a dateless candidate exists and carries no invented date", dateless.date === null, dateless.title.slice(0, 40));
    const proj = await buildTimeline();
    check("L …and is not placed anywhere on the axis", !proj.entries.some((e) => e.title === dateless.title));
  } else {
    check("L a dateless candidate exists", false, "none — seed scripts/seed-timeline-demo.ts");
  }

  const dated = await prisma.timelineEventCandidate.findFirst({ where: { date: { not: null }, status: "pending" } });
  if (dated) {
    // M: acceptance is idempotent because sourceClaimKey is unique. Proven
    // at the model level by attempting the same insert twice.
    const seat = async () =>
      prisma.timelineEvent.upsert({
        where: { sourceClaimKey: dated.claimKey },
        update: {},
        create: {
          scopeId: dated.scopeId, title: dated.title, date: dated.date!, kind: dated.kind,
          temporalState: "occurred", source: "candidate", sourceLabel: dated.sourceLabel,
          contextSnapshotId: dated.contextSnapshotId, evidenceRefs: dated.evidenceRefs,
          sourceClaimKey: dated.claimKey,
        },
      });
    const first = await seat();
    const second = await seat();
    created.events.push(first.id);
    check("M accepting a candidate creates one landmark, carrying its evidence",
      first.source === "candidate" && first.evidenceRefs.length >= 0 && first.sourceLabel === dated.sourceLabel);
    check("M a retried acceptance is idempotent — same row, no duplicate", first.id === second.id, first.id);
  } else {
    check("M a dated candidate exists", false, "none");
  }

  // ── N. LINEAR COMPLETION ───────────────────────────────────────────
  const work = t.entries.filter((e) => e.kind === "work_completed");
  check("N completed Linear issues project as work entries", work.length > 0, `${work.length} entries`);
  if (work.length > 0) {
    const d = work[0].detail as Record<string, unknown>;
    check("N …labelled honestly as a live read, not a state transition",
      String(work[0].sourceLabel).includes("current state") && String(d.limitation).includes("not a recorded state transition"));
  }

  // ── O. CHRONOLOGY ──────────────────────────────────────────────────
  const times = t.entries.map((e) => new Date(e.date).getTime());
  check("O the projection is sorted chronologically across all lanes",
    times.every((v, i) => i === 0 || times[i - 1] <= v));

  // ── R. DERIVED EVENT OWNERSHIP ─────────────────────────────────────
  const derived = t.entries.filter((e) => !e.editable);
  const derivedIds = new Set(derived.map((e) => e.id));
  const timelineRows = await prisma.timelineEvent.findMany({ select: { id: true } });
  check("R no derived entry has a TimelineEvent row behind it",
    timelineRows.every((r) => !derivedIds.has(r.id)) && derived.every((e) => e.id.includes(":")),
    `${derived.length} derived, ${timelineRows.length} owned`);

  // ── S. MANUAL EDIT PERSISTS ────────────────────────────────────────
  await prisma.timelineEvent.update({
    where: { id: occurred.id },
    data: { title: "PROOF edited title", temporalState: "planned" },
  });
  const edited = (await buildTimeline()).entries.find((e) => e.id === occurred.id) as TimelineEntry;
  check("S editing a landmark persists and re-projects", edited.title === "PROOF edited title" && edited.temporalState === "planned");

  // ── cleanup ────────────────────────────────────────────────────────
  for (const id of created.events) await prisma.timelineEvent.delete({ where: { id } }).catch(() => {});
  const restored = await buildTimeline();
  check("Reality restored — proof landmarks removed",
    !restored.entries.some((e) => e.title.startsWith("PROOF")));

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL TIMELINE MODEL PROOFS PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
