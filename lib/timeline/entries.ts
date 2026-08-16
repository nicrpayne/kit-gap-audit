// THE TIMELINE PROJECTION.
//
// Timeline does not own project history. A Report, a Decision, a gate, a
// Finding, a context observation and a completed Linear issue are all
// timestamped facts that already exist, each owned by the instrument that
// created it. This module READS them and arranges them in time. It writes
// nothing.
//
// That is the whole architectural position, and it is why there is no
// event ledger: copying Decision.createdAt into a TimelineEvent row would
// create a second source of truth that could drift from the first. Derived
// entries therefore carry stable SYNTHETIC ids -- `decision:<id>:created`,
// `report:<id>` -- which are reproducible on every request without being
// stored anywhere.
//
// The only rows Timeline owns are TimelineEvent: kickoffs, launches,
// deliveries, phases -- landmarks with no home anywhere else in the schema.
//
// What this module deliberately does NOT do:
//   - reconstruct historical state (we cannot honestly; see buildForecastMemory)
//   - re-run a simulation for a past date (Report IS the historical belief)
//   - infer temporalState from the clock (stored explicitly, always)
//   - claim causality between adjacent entries

import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";

/** What KIND of moment this is. Not a colour -- a semantic class; the
    surface derives material from `family` + `temporalState`. */
export type TimelineEntryKind =
  | "report"
  | "decision_raised"
  | "decision_gated"
  | "decision_decided"
  | "decision_needed_by"
  | "finding_raised"
  | "finding_resolved"
  | "context_observed"
  | "work_completed"
  | "landmark";

/** The material family. One family per source of truth, so the score reads
    as a small vocabulary rather than a rainbow. */
export type TimelineFamily =
  | "forecast"
  | "decision"
  | "finding"
  | "context"
  | "work"
  | "landmark";

export type TemporalState = "occurred" | "planned";

export interface ForecastSnapshot {
  reportId: string;
  scopeId: string;
  generatedAt: string;
  /** p10 / p50 / p90 as stored. Never interpolated, never recomputed. */
  earliestDate: string;
  likelyDate: string;
  latestDate: string;
  /** The target AS IT WAS when this Report was generated -- not today's. */
  targetDate: string | null;
  confidenceAtTarget: number | null;
  likelyDateDeltaDays: number | null;
  shippedCount: number;
  blockingCount: number;
  resolvedSinceLastCount: number;
  summaryMarkdown: string;
}

export interface TimelineEntry {
  /** Stable and reproducible. Derived entries are synthetic; landmarks use
      their real row id so the client can edit them. */
  id: string;
  scopeId: string;
  kind: TimelineEntryKind;
  family: TimelineFamily;
  title: string;
  date: string;
  endDate: string | null;
  temporalState: TemporalState;
  /** Only a TimelineEvent row may be edited here. Everything else belongs
      to another instrument and opens there instead. */
  editable: boolean;
  sourceLabel: string | null;
  /** Where the owning instrument lives, for the inspector's door. */
  door: "forecast" | "decisions" | "scope" | null;
  /** The id to hand that door, when it needs one. */
  doorId: string | null;
  detail: Record<string, unknown>;
}

export interface TimelineLane {
  scopeId: string;
  name: string;
  targetDate: string | null;
  dependsOnScopeIds: string[];
}

export interface TimelineCandidate {
  id: string;
  scopeId: string;
  title: string;
  date: string | null;
  kind: string;
  sourceLabel: string;
  excerpts: string[];
  evidenceRefs: string[];
  contextSnapshotId: string | null;
  status: string;
}

export interface TimelineProjection {
  lanes: TimelineLane[];
  entries: TimelineEntry[];
  /** Per scope, ascending by generatedAt. The forecast MEMORY series. */
  snapshotsByScope: Record<string, ForecastSnapshot[]>;
  candidates: TimelineCandidate[];
  now: string;
  rangeStart: string;
  rangeEnd: string;
}

const iso = (d: Date) => d.toISOString();

/**
 * WHAT WE BELIEVED AT TIME T.
 *
 * The only honest answer is the last Report generated at or before T --
 * not an interpolation between Reports, and never a fresh simulation. A
 * simulation run today with today's inputs is what we believe NOW; running
 * it for a past date would invent a belief nobody ever held.
 *
 * Returns null before the scope's first Report: "no forecast snapshot yet"
 * is the truth, and substituting the current forecast would be a lie.
 */
export function forecastMemoryAt(
  snapshots: ForecastSnapshot[],
  at: Date
): ForecastSnapshot | null {
  let found: ForecastSnapshot | null = null;
  for (const s of snapshots) {
    if (new Date(s.generatedAt).getTime() <= at.getTime()) found = s;
    else break; // ascending, so the first future one ends it
  }
  return found;
}

export async function buildTimeline(): Promise<TimelineProjection> {
  const now = new Date();

  const scopes = await prisma.scope.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      targetDate: true,
      dependsOnScopeIds: true,
      teamKey: true,
      projectNames: true,
      labelFilter: true,
    },
  });
  const scopeIds = scopes.map((s) => s.id);
  const nameById = new Map(scopes.map((s) => [s.id, s.name]));

  const entries: TimelineEntry[] = [];

  // ── FORECAST MEMORY ────────────────────────────────────────────────
  // Every Report is a moment the app committed to a belief, in writing.
  const reports = await prisma.report.findMany({
    where: { scopeId: { in: scopeIds } },
    orderBy: { generatedAt: "asc" },
  });
  const snapshotsByScope: Record<string, ForecastSnapshot[]> = {};
  for (const id of scopeIds) snapshotsByScope[id] = [];
  for (const r of reports) {
    const snap: ForecastSnapshot = {
      reportId: r.id,
      scopeId: r.scopeId,
      generatedAt: iso(r.generatedAt),
      earliestDate: iso(r.earliestDate),
      likelyDate: iso(r.likelyDate),
      latestDate: iso(r.latestDate),
      targetDate: r.targetDate ? iso(r.targetDate) : null,
      confidenceAtTarget: r.confidenceAtTarget,
      likelyDateDeltaDays: r.likelyDateDeltaDays,
      shippedCount: r.shippedCount,
      blockingCount: r.blockingCount,
      resolvedSinceLastCount: r.resolvedSinceLastCount,
      summaryMarkdown: r.summaryMarkdown,
    };
    snapshotsByScope[r.scopeId]?.push(snap);
    entries.push({
      id: `report:${r.id}`,
      scopeId: r.scopeId,
      kind: "report",
      family: "forecast",
      title: "Forecast report",
      date: snap.generatedAt,
      endDate: null,
      temporalState: "occurred",
      editable: false,
      sourceLabel: "Forecast",
      door: "forecast",
      doorId: r.scopeId,
      detail: snap as unknown as Record<string, unknown>,
    });
  }

  // ── DECISIONS ──────────────────────────────────────────────────────
  // Three distinct moments in one Decision's life, each a real timestamp.
  // They are separate entries because they are separate events -- raising
  // a question, discovering delivery waits on it, and answering it are not
  // the same moment and must not collapse into one marker.
  const decisions = await prisma.decision.findMany({
    where: { scopeId: { in: scopeIds } },
    include: { gate: true, evidence: true },
    orderBy: { createdAt: "asc" },
  });
  for (const d of decisions) {
    const base = {
      scopeId: d.scopeId,
      family: "decision" as const,
      editable: false,
      door: "decisions" as const,
      doorId: d.id,
      endDate: null,
      temporalState: "occurred" as const,
    };
    const evidence = d.evidence.map((e) => ({ excerpt: e.excerpt, sourceLabel: e.sourceLabel }));
    entries.push({
      ...base,
      id: `decision:${d.id}:created`,
      kind: "decision_raised",
      title: d.title,
      date: iso(d.createdAt),
      sourceLabel: d.sourceClaimKey ? "Accepted candidate" : "Decisions",
      detail: { decisionId: d.id, status: d.status, owner: d.owner, neededBy: d.neededBy ? iso(d.neededBy) : null, evidence },
    });
    if (d.gate) {
      entries.push({
        ...base,
        id: `decision:${d.id}:gated`,
        kind: "decision_gated",
        title: d.title,
        date: iso(d.gate.createdAt),
        sourceLabel: "Connected to delivery",
        detail: {
          decisionId: d.id,
          dependency: d.gate.dependency,
          evidenceForGate: d.gate.evidenceForGate,
          targetScope: nameById.get(d.gate.targetScopeId) ?? d.gate.targetScopeId,
          low: d.gate.low, likely: d.gate.likely, high: d.gate.high,
          provenance: d.gate.provenance,
          owner: d.owner,
        },
      });
    }
    if (d.decidedAt) {
      entries.push({
        ...base,
        id: `decision:${d.id}:decided`,
        kind: "decision_decided",
        title: d.title,
        date: iso(d.decidedAt),
        sourceLabel: "Decided",
        detail: {
          decisionId: d.id,
          resolution: d.resolution,
          chosenOption: d.chosenOption,
          owner: d.owner,
          neededBy: d.neededBy ? iso(d.neededBy) : null,
          // Truthful comparison, stated as a fact about two dates. No claim
          // that one caused anything.
          metNeededBy: d.neededBy ? d.decidedAt.getTime() <= d.neededBy.getTime() : null,
        },
      });
    }
    // ADVISORY, and future-facing. neededBy feeds no simulation -- it is a
    // date someone wanted an answer by, nothing more.
    if (d.neededBy && d.status === "open") {
      entries.push({
        ...base,
        id: `decision:${d.id}:neededBy`,
        kind: "decision_needed_by",
        title: d.title,
        date: iso(d.neededBy),
        temporalState: "planned",
        sourceLabel: "Needed by",
        detail: {
          decisionId: d.id,
          owner: d.owner,
          advisory: true,
          overdue: d.neededBy.getTime() < now.getTime(),
        },
      });
    }
  }

  // ── FINDINGS ───────────────────────────────────────────────────────
  // A Finding carries no scopeId of its own -- it reaches a Scope through
  // its Source or its ContextSnapshot (see the Finding model's own note on
  // why sourceId is nullable). Both maps are loaded once and joined in
  // memory; resolving per row would be one query per Finding.
  const findings = await prisma.finding.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, sourceId: true, contextSnapshotId: true, title: true, type: true, status: true, blocking: true, createdAt: true, resolvedAt: true },
  });
  const sourceScope = new Map(
    (await prisma.source.findMany({ select: { id: true, scopeId: true } })).map((s) => [s.id, s.scopeId])
  );
  const snapshotScope = new Map(
    (await prisma.contextSnapshot.findMany({ select: { id: true, scopeId: true } })).map((s) => [s.id, s.scopeId])
  );
  const scopeIdSet = new Set(scopeIds);
  for (const f of findings) {
    const scopeId =
      (f.sourceId ? sourceScope.get(f.sourceId) : undefined) ??
      (f.contextSnapshotId ? snapshotScope.get(f.contextSnapshotId) : undefined);
    // A Finding that reaches no Scope has no lane to sit in. Dropping it is
    // the honest outcome -- guessing one would put a real event on the
    // wrong project's story.
    if (!scopeId || !scopeIdSet.has(scopeId)) continue;
    entries.push({
      id: `finding:${f.id}:created`,
      scopeId,
      kind: "finding_raised",
      family: "finding",
      title: f.title,
      date: iso(f.createdAt),
      endDate: null,
      temporalState: "occurred",
      editable: false,
      sourceLabel: `Audit · ${f.type}`,
      door: null,
      doorId: null,
      detail: { findingId: f.id, type: f.type, status: f.status, blocking: f.blocking },
    });
    if (f.resolvedAt) {
      entries.push({
        id: `finding:${f.id}:resolved`,
        scopeId,
        kind: "finding_resolved",
        family: "finding",
        title: f.title,
        date: iso(f.resolvedAt),
        endDate: null,
        temporalState: "occurred",
        editable: false,
        sourceLabel: "Resolved",
        door: null,
        doorId: null,
        detail: { findingId: f.id, type: f.type },
      });
    }
  }

  // ── CONTEXT OBSERVATIONS ───────────────────────────────────────────
  // The honest timestamp here is the source manifest's observedAt: when
  // the source was ACTUALLY read. Not the snapshot's createdAt, which is
  // when we happened to persist it. One entry per successfully observed
  // source, because that is the real observation event.
  const snapshots = await prisma.contextSnapshot.findMany({
    where: { scopeId: { in: scopeIds } },
    orderBy: { createdAt: "asc" },
    select: { id: true, scopeId: true, producer: true, package: true, createdAt: true },
  });
  for (const snap of snapshots) {
    const pkg = snap.package as unknown as {
      sources?: { sourceType: string; sourceRef: string; observedAt: string; succeeded: boolean; detail: string | null }[];
      evidence?: { id: string; sourceRef: string; excerpt: string }[];
    };
    const excerptsBySource = new Map<string, string[]>();
    for (const e of pkg.evidence ?? []) {
      const list = excerptsBySource.get(e.sourceRef) ?? [];
      if (list.length < 3) list.push(e.excerpt);
      excerptsBySource.set(e.sourceRef, list);
    }
    for (const src of pkg.sources ?? []) {
      if (!src.succeeded || !src.observedAt) continue;
      entries.push({
        id: `context:${snap.id}:${src.sourceRef}`,
        scopeId: snap.scopeId,
        kind: "context_observed",
        family: "context",
        title: src.sourceRef,
        date: new Date(src.observedAt).toISOString(),
        endDate: null,
        temporalState: "occurred",
        editable: false,
        sourceLabel: `${snap.producer} · ${src.sourceType}`,
        door: null,
        doorId: null,
        detail: {
          snapshotId: snap.id,
          sourceType: src.sourceType,
          sourceRef: src.sourceRef,
          producer: snap.producer,
          observedAt: src.observedAt,
          detailNote: src.detail,
          excerpts: excerptsBySource.get(src.sourceRef) ?? [],
        },
      });
    }
  }

  // ── WORK COMPLETION ────────────────────────────────────────────────
  // HONEST LIMITATION, stated in the data: Linear is a live read. We hold
  // no issue-state history, so this is not "the issue moved to Done on
  // this date" reconstructed from a transition log -- it is the
  // completedAt currently reported for an issue currently in this Scope.
  // One query per scope (the existing cached bundle), never per issue.
  for (const scope of scopes) {
    let issues: Awaited<ReturnType<typeof getScopedIssues>> = [];
    try {
      issues = await getScopedIssues({
        teamKey: scope.teamKey,
        projectNames: scope.projectNames,
        labelFilter: scope.labelFilter,
      });
    } catch {
      // Linear unreachable: the rest of the timeline is still true.
      continue;
    }
    for (const i of issues) {
      if (!i.completedAt) continue;
      entries.push({
        id: `linear:${i.identifier}:completed`,
        scopeId: scope.id,
        kind: "work_completed",
        family: "work",
        title: `${i.identifier} ${i.title}`,
        date: new Date(i.completedAt).toISOString(),
        endDate: null,
        temporalState: "occurred",
        editable: false,
        sourceLabel: "Linear · current state",
        door: null,
        doorId: null,
        detail: {
          identifier: i.identifier,
          title: i.title,
          completedAt: i.completedAt,
          limitation:
            "Linear is read live. This is the completion date currently reported for an issue currently in this Scope -- not a recorded state transition.",
        },
      });
    }
  }

  // ── LANDMARKS (the rows Timeline owns) ─────────────────────────────
  const landmarks = await prisma.timelineEvent.findMany({
    where: { scopeId: { in: scopeIds } },
    orderBy: { date: "asc" },
  });
  for (const e of landmarks) {
    entries.push({
      id: e.id,
      scopeId: e.scopeId,
      kind: "landmark",
      family: "landmark",
      title: e.title,
      date: iso(e.date),
      endDate: e.endDate ? iso(e.endDate) : null,
      // STORED. Never `date < now`.
      temporalState: e.temporalState === "planned" ? "planned" : "occurred",
      editable: true,
      sourceLabel: e.sourceLabel ?? (e.source === "manual" ? "Added by hand" : e.source),
      door: null,
      doorId: null,
      detail: {
        eventId: e.id,
        landmarkKind: e.kind,
        note: e.note,
        source: e.source,
        evidenceRefs: e.evidenceRefs,
        contextSnapshotId: e.contextSnapshotId,
        externalRef: e.externalRef,
        // A planned landmark whose date has passed. Not converted -- named.
        overdue: e.temporalState === "planned" && e.date.getTime() < now.getTime(),
      },
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const candidateRows = await prisma.timelineEventCandidate.findMany({
    where: { scopeId: { in: scopeIds }, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  // ── RANGE ──────────────────────────────────────────────────────────
  // Enough past to hold the story, enough future to see intent. NOW sits
  // left of centre because there is more ahead than behind.
  const times = entries.map((e) => new Date(e.date).getTime());
  for (const s of scopes) if (s.targetDate) times.push(s.targetDate.getTime());
  for (const list of Object.values(snapshotsByScope)) {
    const last = list[list.length - 1];
    if (last) times.push(new Date(last.latestDate).getTime());
  }
  const DAY = 86400000;
  const earliest = times.length ? Math.min(...times) : now.getTime() - 60 * DAY;
  const latest = times.length ? Math.max(...times) : now.getTime() + 120 * DAY;
  const rangeStart = new Date(Math.min(earliest, now.getTime() - 14 * DAY) - 7 * DAY);
  const rangeEnd = new Date(Math.max(latest, now.getTime() + 60 * DAY) + 14 * DAY);

  return {
    lanes: scopes.map((s) => ({
      scopeId: s.id,
      name: s.name,
      targetDate: s.targetDate ? iso(s.targetDate) : null,
      dependsOnScopeIds: s.dependsOnScopeIds,
    })),
    entries,
    snapshotsByScope,
    candidates: candidateRows.map((c) => ({
      id: c.id,
      scopeId: c.scopeId,
      title: c.title,
      date: c.date ? iso(c.date) : null,
      kind: c.kind,
      sourceLabel: c.sourceLabel,
      excerpts: c.excerpts,
      evidenceRefs: c.evidenceRefs,
      contextSnapshotId: c.contextSnapshotId,
      status: c.status,
    })),
    now: iso(now),
    rangeStart: iso(rangeStart),
    rangeEnd: iso(rangeEnd),
  };
}
