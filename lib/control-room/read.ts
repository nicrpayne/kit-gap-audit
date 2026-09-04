// THE CONTROL ROOM'S READING.
//
// A composition, not a source of truth. Every value below is either copied
// verbatim from an owner instrument's payload or produced by calling the
// SAME function that instrument calls. If a number here ever disagrees with
// the instrument it links to, that is a bug in this file — not a difference
// of opinion — and that property is the whole reason the Control Room is
// allowed to exist.
//
// WHAT IS DELIBERATELY ABSENT: health, utilization, buffer, severity, risk
// score, criticality, alignment. None of those exist in the model, so none
// of them exist here. Where the concept image asked for one, this file
// carries the real reading it was standing in for, and the audit
// (docs/CONTROL-ROOM-TRUTH-AUDIT.md) says which was rejected and why.
//
// PURE. No fetch, no clock beyond the `now` it is handed, no store — so the
// whole surface is provable without a browser.

import { percentileDay } from "@/lib/forecast/simulate";
import type { SimulationResult } from "@/lib/forecast/simulate";
import { readMaster, readChannel } from "@/lib/capacity/workforce";
import { readDominance } from "@/lib/scope/constraint";
import { composeFeatures } from "@/lib/scope/features";
import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";
import type { DecisionRow } from "@/lib/decisions/model";
import type { TimelineEntry, TimelineCandidate, TimelineLane } from "@/lib/timeline/entries";

const DAY = 86400000;
const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;

export interface ControlRoomInput {
  now: Date;
  data: ProjectPayload;
  /** When this browser last received `data`. The only honest answer to "how
      current is the project data?" — the payload carries no fetch stamp of
      its own, and there is nothing on the server that knows when a
      particular client last asked. */
  dataReceivedAt: Date;
  scenario: SuiteScenario;
  scenarioActive: boolean;
  /** The Scenario's simulations, or Reality's when none is set. */
  preview: Map<string, SimulationResult>;
  /** Reality's own, always. */
  baseline: Map<string, SimulationResult>;
  /** Per scope: where it lands with its whole backlog cut — what survives an
      empty release. Already computed by useProject; the honest way to ask
      "is the backlog still what decides this date?". */
  floorByScope: Map<string, SimulationResult> | null;
  decisions: DecisionRow[];
  entries: TimelineEntry[];
  lanes: TimelineLane[];
  timelineCandidates: TimelineCandidate[];
  timelineRangeEnd: Date | null;
}

/** A point somebody actually recorded. Never interpolated, never
    back-filled, and never synthesised from a current value — a series of
    length 1 is drawn as a dot, not as a flat line asserting stability. */
export interface Point {
  at: Date;
  value: number;
}

export interface Series {
  id: string;
  label: string;
  points: Point[];
}

// ── 1. WHAT IS REAL RIGHT NOW ──────────────────────────────────────────

export interface RealitySummary {
  openSignals: number;
  blockingSignals: number;
  /** Linear items finished in the last fortnight, from the live read. */
  completedRecently: number;
  sources: number;
  /** Age in days of the newest piece of observed context, or null if none. */
  evidenceAgeDays: number | null;
  newestEvidenceLabel: string | null;
  /** Work each report recorded as completed since the previous one. Real
      stored counts at real report times. */
  shippedSeries: Point[];
}

// ── 2. WHAT CHOICES ARE OPEN ───────────────────────────────────────────

export interface ChoicesSummary {
  open: number;
  /** Open decisions with a serial gate — the ONLY ones that reach the date. */
  gating: number;
  /** Σ of those gates' stored `likely` delay. A sum of real numbers, not an
      estimate of one. */
  modelledDelayDays: number;
  dueSoon: number;
  overdue: number;
  decidedRecently: number;
  /** Decisions answered per week, counted from stored `decision_decided`
      events. A direct count, not a reconstructed backlog level. */
  answeredSeries: Point[];
}

// ── 3. DO WE HAVE ENOUGH EFFECTIVE CAPACITY ────────────────────────────

export interface CapacityChannel {
  /** FALSE when the number is a floor, not a reading. `inferCapacityFromAssignees`
      returns 1 for a scope with nobody on it — a divide-by-zero guard the
      simulation needs, NOT a measurement. A surface that prints it as "1.0"
      is asserting a staffing level nobody stated, so the Control Room shows
      "—" instead. The simulation is untouched; only the claim is. */
  known: boolean;
  scopeId: string;
  name: string;
  raw: number;
  effective: number;
  /** Where the roster is silent and the engine used a stand-in head count. */
  basis: "allocations" | "explicit" | "inferred";
}

export interface CapacitySummary {
  workforce: number;
  raw: number;
  effective: number;
  free: number;
  required: number;
  /** raw − effective. Real, and its cause is the switch cost below. */
  switchLoss: number;
  switchCostPct: number;
  people: number;
  splitPeople: number;
  byScope: CapacityChannel[];
  /** Projects whose capacity is a stand-in rather than named people. */
  inferredScopes: number;
  /** ARRIVING: effective ÷ allocated. Of the time we committed, how much
      lands on the work rather than being lost crossing between projects.
      Its complement is exactly context-switch loss. Null when nothing is
      allocated, because a ratio of nothing is not 100%.
      DELIBERATELY NOT "utilization" — see the truth audit. */
  arrivingPct: number | null;
}

// ── 4. WHERE ARE WE LIKELY TO LAND ─────────────────────────────────────

export interface OutcomeSummary {
  /** The latest scope P50 — the project is done when the last part is. */
  likely: Date | null;
  /** Which project's completion sets that date. */
  gatedBy: string | null;
  gatedByScopeId: string | null;
  /** That project's confidence against ITS OWN target. Confidence is only
      meaningful against a reference, and the reference is per-scope. */
  confidence: number | null;
  target: Date | null;
  /** P50 − target for the gating project, in days. Positive = late. */
  gapDays: number | null;
  p10: Date | null;
  p90: Date | null;
  spreadDays: number | null;
  /** Reality's own likely date while a Scenario is running. */
  realityLikely: Date | null;
  scopesPastTarget: number;
  /** Per project, the confidence each report stored at the time it ran.
      Projects that have never been reported on are ABSENT, not flat at
      zero. Points with no target at the time are skipped. */
  confidenceHistory: Series[];
  /** Which way the gating project's confidence has moved since its
      previous report, in percentage points. Null with fewer than two. */
  confidenceTrendPts: number | null;
}

// ── 5. WHERE ARE WE IN TIME ────────────────────────────────────────────

export interface TimeSummary {
  now: Date;
  horizonDays: number | null;
  lastForecastAt: Date | null;
  nextLandmark: { title: string; date: Date; scopeId: string; inDays: number } | null;
  nextTarget: { name: string; date: Date; scopeId: string; inDays: number } | null;
}

// ── 5b. WHAT DEPENDENCIES COULD SURPRISE US ────────────────────────────

export type DependencyRowKind = "waits_on" | "shared_upstream" | "shared_gate" | "needs_review";

export interface DependencyRow {
  id: string;
  kind: DependencyRowKind;
  /** The thing under watch. */
  subject: string;
  /** One sentence, in a person's words. */
  detail: string;
  /** The real quantity this row was ordered by, already worded. Never a
      score — always a count or a number of days, in its own unit. */
  quantity: string | null;
  /** True only for accepted structural truth that the engine acts on. */
  causal: boolean;
  /** Where Orbit should open. */
  focusScopeId: string | null;
  /** Orbit's own stable node id, so it opens already selected. */
  selectNodeId: string | null;
}

// ── 5c. CAN I TRUST WHAT I AM LOOKING AT ───────────────────────────────
//
// Only rows we can actually know. No overall verdict, because "healthy"
// would need thresholds nobody has set; the panel states its OLDEST
// reading as a fact and lets a person judge.

export interface SystemRow {
  id: string;
  label: string;
  /** What is true, in a few words. */
  state: string;
  /** How old the reading is, in days. Null where age is not the point. */
  ageDays: number | null;
  href: string;
}

// ── 6. WHAT IS HOLDING US ──────────────────────────────────────────────

export interface ConstraintRow {
  id: string;
  /** What kind of constraint, in the product's own words. */
  label: string;
  detail: string;
  /** The real quantity, worded with its unit. Rows are ordered by this
      value's magnitude within its own kind — there is no severity model in
      this product and none is invented here. */
  quantity: string;
  /** For ordering only. Never rendered as a number on its own. */
  magnitude: number;
  href: string;
}

// ── 7. WHAT CHANGED ────────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  title: string;
  at: Date;
  kind: TimelineEntry["kind"];
  family: TimelineEntry["family"];
  sourceLabel: string | null;
  scopeId: string;
  href: string;
  /** Set only where the change had a stated consequence. */
  note: string | null;
  /** How many separate rows this line stands for. >1 when the same thing
      happened to several near-identical subjects at once. */
  count: number;
}

export interface ControlRoomReading {
  reality: RealitySummary;
  choices: ChoicesSummary;
  capacity: CapacitySummary;
  outcome: OutcomeSummary;
  time: TimeSummary;
  dependencies: DependencyRow[];
  /** Unreviewed external claims. NOT dependencies — see the audit. */
  needsReview: number;
  constraints: ConstraintRow[];
  activity: ActivityRow[];
  system: SystemRow[];
  /** The oldest reading on the System Status panel, so the header can state
      a fact instead of grading itself. */
  oldestReading: SystemRow | null;
  scenarioActive: boolean;
}

/** Everything a scope transitively waits on, from declared edges only. */
function upstreamOf(scopeId: string, byId: Map<string, TimelineLane>, seen = new Set<string>()): Set<string> {
  const lane = byId.get(scopeId);
  if (!lane) return seen;
  for (const up of lane.dependsOnScopeIds) {
    if (seen.has(up)) continue;
    seen.add(up);
    upstreamOf(up, byId, seen);
  }
  return seen;
}


/** A date a person can act on. The year is printed whenever it is not the
    current one, because "Jan 1" silently means "the next one" to a reader and
    a stale target is exactly the case where that is wrong. */
function dateWithYear(d: Date, now: Date = new Date()): string {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function readControlRoom(i: ControlRoomInput): ControlRoomReading {
  const { now, data, scenario, preview, baseline, floorByScope, decisions, entries, lanes } = i;
  const startDate = new Date(data.startDate);
  const laneById = new Map(lanes.map((l) => [l.scopeId, l]));
  const scopeName = new Map(data.scopes.map((s) => [s.scopeId, s.name]));
  const dayToDate = (d: number) => new Date(startDate.getTime() + d * DAY);

  // ── REALITY ──────────────────────────────────────────────────────────
  const openFindings = data.findings.filter((f) => f.status === "open");
  const contextEntries = entries
    .filter((e) => e.kind === "context_observed" && new Date(e.date) <= now)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const newestContext = contextEntries[0] ?? null;

  // WHAT EACH ROUND OF REPORTING RECORDED AS SHIPPED.
  //
  // Reports run per project and land minutes apart, so one round of reporting
  // is bucketed to the day it ran on and the counts are summed. Nothing is
  // interpolated between rounds and no bucket is invented for a day nobody
  // reported on: a gap in the series is a gap in the reporting.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const shippedByDay = new Map<string, Point>();
  for (const s of data.scopes) {
    for (const r of s.reportHistory) {
      const at = new Date(r.generatedAt);
      if (at > now) continue;
      const hit = shippedByDay.get(dayKey(at));
      if (hit) {
        hit.value += r.shippedCount;
        if (at < hit.at) hit.at = at;
      } else shippedByDay.set(dayKey(at), { at, value: r.shippedCount });
    }
  }
  const shippedSeries = [...shippedByDay.values()].sort((a, b) => +a.at - +b.at);

  const reality: RealitySummary = {
    openSignals: openFindings.length,
    blockingSignals: openFindings.filter((f) => f.blocking).length,
    completedRecently: entries.filter(
      (e) => e.kind === "work_completed" && +now - +new Date(e.date) <= 14 * DAY && new Date(e.date) <= now
    ).length,
    sources: data.sources.length,
    evidenceAgeDays: newestContext ? Math.max(0, days(now, new Date(newestContext.date))) : null,
    newestEvidenceLabel: newestContext?.sourceLabel ?? null,
    shippedSeries,
  };

  // ── CHOICES ──────────────────────────────────────────────────────────
  //
  // A DECISION IS NOT A GATE. Both numbers are carried because "30 open"
  // without "2 actually holding delivery" is the exact misreading this
  // product exists to prevent.
  const open = decisions.filter((d) => d.status === "open");
  const gating = open.filter((d) => d.gate?.serial && !scenario.resolvedGateIds.has(d.gate.id));

  // ANSWERED PER WEEK, counted — not a reconstructed backlog level.
  //
  // A zero here is a real count over a real seven-day window, so the weeks
  // between the first answer and now are all present. The series does not
  // extend back before the first stored answer, because we have no evidence
  // about weeks the event stream never covered.
  const WEEK = 7 * DAY;
  const decidedAt = entries
    .filter((e) => e.kind === "decision_decided" && new Date(e.date) <= now)
    .map((e) => +new Date(e.date))
    .sort((a, b) => a - b);
  const weekSpan = decidedAt.length ? Math.min(12, Math.ceil((+now - decidedAt[0]) / WEEK)) : 0;
  const answeredSeries: Point[] = [];
  for (let w = weekSpan - 1; w >= 0; w--) {
    const end = +now - w * WEEK;
    const start = end - WEEK;
    answeredSeries.push({ at: new Date(end), value: decidedAt.filter((t) => t > start && t <= end).length });
  }

  const choices: ChoicesSummary = {
    open: open.length,
    gating: gating.length,
    modelledDelayDays: gating.reduce((n, d) => n + (d.gate?.likely ?? 0), 0),
    dueSoon: open.filter((d) => d.neededBy && new Date(d.neededBy) >= now && +new Date(d.neededBy) - +now <= 14 * DAY)
      .length,
    overdue: open.filter((d) => d.neededBy && new Date(d.neededBy) < now).length,
    decidedRecently: entries.filter(
      (e) => e.kind === "decision_decided" && +now - +new Date(e.date) <= 14 * DAY && new Date(e.date) <= now
    ).length,
    answeredSeries,
  };

  // ── CAPACITY ─────────────────────────────────────────────────────────
  //
  // Portfolio's own calls, argument for argument. RAW is physical allocation
  // and EFFECTIVE is what survives context switching; nobody is manufactured.
  const switchCostPct = scenario.contextSwitchCostPct ?? data.contextSwitchCostPct;
  const workforce = {
    people: data.people,
    allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
  };
  const scopeIds = data.scopes.map((s) => s.scopeId);
  const master = readMaster(workforce, scopeIds, switchCostPct);
  const byScope: CapacityChannel[] = data.scopes.map((s) => {
    const ch = readChannel(workforce, s.scopeId, switchCostPct);
    const named = s.capacitySource === "allocations";
    return {
      scopeId: s.scopeId,
      name: s.name,
      raw: named ? ch.raw : s.teamCapacity,
      effective: named ? ch.effective : s.teamCapacity,
      basis: s.capacitySource,
      // Real allocations are always known. An inferred figure is only known
      // if there was something to infer it FROM.
      known: named || s.items.length > 0,
    };
  });
  const capacity: CapacitySummary = {
    workforce: master.workforce,
    raw: master.allocated,
    effective: master.effective,
    free: master.free,
    required: master.required,
    switchLoss: Math.max(0, master.allocated - master.effective),
    switchCostPct,
    people: data.people.filter((p) => p.active).length,
    splitPeople: byScope.reduce((n, c) => n + (readChannel(workforce, c.scopeId, switchCostPct).splitPeople > 0 ? 1 : 0), 0),
    byScope,
    inferredScopes: data.scopes.filter((s) => s.capacitySource !== "allocations").length,
    // Both terms come from the SAME readMaster call, in the same unit, over
    // the same people — so the ratio hides no third quantity. Null rather
    // than 100% when nothing is allocated: a ratio of nothing is not "all of
    // it arriving".
    arrivingPct: master.allocated > 0 ? (master.effective / master.allocated) * 100 : null,
  };

  // ── OUTCOME ──────────────────────────────────────────────────────────
  //
  // The project lands when its last part does. Confidence belongs to that
  // part, measured against ITS OWN target, and is named as such.
  let likelyMs = -Infinity;
  let gatedByScopeId: string | null = null;
  let scopesPastTarget = 0;
  for (const s of data.scopes) {
    const r = preview.get(s.scopeId);
    if (!r) continue;
    if (r.likelyDate.getTime() > likelyMs) {
      likelyMs = r.likelyDate.getTime();
      gatedByScopeId = s.scopeId;
    }
    if (s.targetDate && r.likelyDate > new Date(s.targetDate)) scopesPastTarget += 1;
  }
  const gatingScope = data.scopes.find((s) => s.scopeId === gatedByScopeId) ?? null;
  const gatingSim = gatedByScopeId ? preview.get(gatedByScopeId) ?? null : null;
  const gatingReality = gatedByScopeId ? baseline.get(gatedByScopeId) ?? null : null;
  const target = gatingScope?.targetDate ? new Date(gatingScope.targetDate) : null;

  // WHAT EACH REPORT BELIEVED AT THE TIME IT RAN.
  //
  // The stored integer, plotted at its own generatedAt. Never recomputed
  // against today's model, never interpolated, never back-filled. A project
  // that has never been reported on is ABSENT — drawing it flat at zero
  // would assert a measured 0% confidence nobody ever measured. Reports with
  // no target at the time carry a null and are skipped for the same reason.
  const confidenceHistory: Series[] = data.scopes
    .map((s) => ({
      id: s.scopeId,
      label: s.name,
      points: s.reportHistory
        .filter((r) => r.confidenceAtTarget !== null && new Date(r.generatedAt) <= now)
        .map((r) => ({ at: new Date(r.generatedAt), value: r.confidenceAtTarget as number }))
        .sort((a, b) => +a.at - +b.at),
    }))
    .filter((s) => s.points.length > 0);
  const gatingSeries = confidenceHistory.find((s) => s.id === gatedByScopeId) ?? null;
  const gatingPts = gatingSeries?.points ?? [];
  const confidenceTrendPts =
    gatingPts.length >= 2 ? gatingPts[gatingPts.length - 1].value - gatingPts[gatingPts.length - 2].value : null;

  const outcome: OutcomeSummary = {
    likely: likelyMs === -Infinity ? null : new Date(likelyMs),
    gatedBy: gatingScope?.name ?? null,
    gatedByScopeId,
    confidence: gatingSim?.confidenceAtTarget ?? null,
    target,
    gapDays: gatingSim && target ? Math.round(days(gatingSim.likelyDate, target)) : null,
    p10: gatingSim ? dayToDate(percentileDay(gatingSim.completionDaysSorted, 10)) : null,
    p90: gatingSim ? dayToDate(percentileDay(gatingSim.completionDaysSorted, 90)) : null,
    spreadDays: gatingSim
      ? Math.round(
          percentileDay(gatingSim.completionDaysSorted, 90) - percentileDay(gatingSim.completionDaysSorted, 10)
        )
      : null,
    realityLikely: i.scenarioActive && gatingReality ? gatingReality.likelyDate : null,
    scopesPastTarget,
    confidenceHistory,
    confidenceTrendPts,
  };

  // ── TIME ─────────────────────────────────────────────────────────────
  const reportDates = data.scopes
    .map((s) => s.lastReport?.generatedAt)
    .filter((x): x is string => !!x)
    .map((x) => new Date(x));
  const landmarks = entries
    .filter((e) => e.kind === "landmark" && e.temporalState === "planned" && new Date(e.date) > now)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const futureTargets = data.scopes
    .filter((s) => s.targetDate && new Date(s.targetDate) > now)
    .sort((a, b) => +new Date(a.targetDate!) - +new Date(b.targetDate!));
  const time: TimeSummary = {
    now,
    horizonDays: i.timelineRangeEnd ? Math.round(days(i.timelineRangeEnd, now)) : null,
    lastForecastAt: reportDates.length ? new Date(Math.max(...reportDates.map((d) => +d))) : null,
    nextLandmark: landmarks[0]
      ? {
          title: landmarks[0].title,
          date: new Date(landmarks[0].date),
          scopeId: landmarks[0].scopeId,
          inDays: Math.round(days(new Date(landmarks[0].date), now)),
        }
      : null,
    nextTarget: futureTargets[0]
      ? {
          name: futureTargets[0].name,
          date: new Date(futureTargets[0].targetDate!),
          scopeId: futureTargets[0].scopeId,
          inDays: Math.round(days(new Date(futureTargets[0].targetDate!), now)),
        }
      : null,
  };

  // ── DEPENDENCY WATCH ─────────────────────────────────────────────────
  //
  // Every row is a declared edge or a count of declared edges. Ordering is
  // by a real quantity that the row itself states; there is no composite
  // score, and no dependency is ever inferred from anything.
  const dependencies: DependencyRow[] = [];

  // Who waits on whom, and how many projects each upstream carries.
  const dependents = new Map<string, string[]>();
  for (const lane of lanes) {
    for (const up of lane.dependsOnScopeIds) {
      dependents.set(up, [...(dependents.get(up) ?? []), lane.scopeId]);
    }
  }

  for (const lane of lanes) {
    const downSim = preview.get(lane.scopeId);
    for (const upId of lane.dependsOnScopeIds) {
      const upSim = preview.get(upId);
      if (!upSim || !downSim) continue;
      const upName = scopeName.get(upId) ?? upId;
      // Does the thing it waits on land after its own target? That is the
      // surprise this surface exists to prevent, and it is exact.
      const downTarget = lane.targetDate ? new Date(lane.targetDate) : null;
      const overrun = downTarget ? Math.round(days(upSim.likelyDate, downTarget)) : null;
      // Has the backlog stopped being what decides this date? Scope's own
      // reading, reused rather than re-derived.
      const scope = data.scopes.find((s) => s.scopeId === lane.scopeId);
      const dom =
        scope && floorByScope
          ? readDominance(
              downSim,
              floorByScope.get(lane.scopeId),
              startDate,
              scope.gates,
              scenario.resolvedGateIds,
              lane.dependsOnScopeIds.map((d) => scopeName.get(d) ?? d)
            )
          : null;
      dependencies.push({
        id: `waits:${lane.scopeId}:${upId}`,
        kind: "waits_on",
        subject: `${lane.name} waits on ${upName}`,
        // PROSE ONLY WHERE THERE IS NEWS. A dependency that is simply
        // declared and behaving needs one line and a word; one that is
        // pushing something past its target, or has taken the date away
        // from the backlog, gets the sentence explaining it.
        detail:
          overrun !== null && overrun > 0
            ? `${upName} is not expected until ${upSim.likelyDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — after ${lane.name}'s own target.`
            : dom?.dominated
              ? `${lane.name}'s backlog has stopped deciding its date. What it waits on decides it.`
              : "",
        quantity:
          overrun !== null && overrun > 0
            ? `${overrun}d past ${lane.name}'s target`
            : dom?.dominated
              ? "backlog no longer decides"
              // DECLARED, NOT ACCEPTED. `dependsOnScopeIds` is a modelling
              // input somebody typed; there is no review step and no
              // provenance behind it. "Accepted" implied a ratification that
              // never happened, and sat one row above genuinely unreviewed
              // claims where the contrast made the overstatement worse.
              : "declared",
        causal: true,
        focusScopeId: lane.scopeId,
        selectNodeId: `dependency:${upId}`,
      });
    }
  }

  // A SINGLE POINT OF FAILURE, COUNTED. Not scored — an upstream carrying
  // more than one project is a fact about declared edges.
  for (const [upId, downs] of dependents) {
    if (downs.length < 2) continue;
    dependencies.push({
      id: `shared:${upId}`,
      kind: "shared_upstream",
      subject: `${scopeName.get(upId) ?? upId} carries ${downs.length} projects`,
      detail: `${downs.map((d) => scopeName.get(d) ?? d).join(" and ")} both wait on it. If it slips, they both slip.`.slice(0, 200),
      quantity: `${downs.length} downstream`,
      causal: true,
      focusScopeId: downs[0],
      selectNodeId: `dependency:${upId}`,
    });
  }

  // A GATE THAT RELEASES MORE THAN ONE PROJECT. Absent when there isn't one,
  // rather than faked.
  for (const d of gating) {
    if (!d.gate) continue;
    const downs = [...upstreamOf(d.gate.targetScopeId, laneById)].length;
    const releases = (dependents.get(d.gate.targetScopeId) ?? []).length;
    if (releases < 2) continue;
    dependencies.push({
      id: `sharedgate:${d.gate.id}`,
      kind: "shared_gate",
      subject: d.title,
      detail: `Answering this releases ${releases} projects at once.`,
      quantity: `${d.gate.likely}d modelled · ${releases} downstream`,
      causal: true,
      focusScopeId: d.gate.targetScopeId,
      selectNodeId: `gate:${d.gate.id}`,
    });
    void downs;
  }

  // UNREVIEWED EXTERNAL CLAIMS. Deliberately last, deliberately not causal,
  // and deliberately NOT called suspected dependencies — the product has no
  // model for one. See docs/CONTROL-ROOM-TRUTH-AUDIT.md.
  const hermesSuggestions = data.scopes.reduce((n, s) => {
    const comp = composeFeatures(s.items, s.completedWork, s.teamCapacity, new Set(), {}, []);
    return n + comp.features.filter((f) => f.source === "hermes" && !f.accepted).length;
  }, 0);
  const needsReview = i.timelineCandidates.length + hermesSuggestions;
  if (needsReview > 0) {
    dependencies.push({
      id: "needs-review",
      kind: "needs_review",
      subject: `${needsReview} external ${needsReview === 1 ? "claim" : "claims"} nobody has reviewed`,
      detail:
        "Suggested from transcripts and Linear. None of it counts towards any date until a person accepts it.",
      quantity: null,
      causal: false,
      focusScopeId: null,
      selectNodeId: null,
    });
  }

  const KIND_ORDER: Record<DependencyRowKind, number> = {
    waits_on: 0,
    shared_upstream: 1,
    shared_gate: 2,
    needs_review: 3,
  };
  const overrunOf = (r: DependencyRow) => Number(/^(\d+)d past/.exec(r.quantity ?? "")?.[1] ?? 0);
  dependencies.sort(
    (a, b) =>
      // A dependency that already pushes something past its target comes
      // first, by how many days it does so. Then everything else in its
      // own class. Every value here is one the row itself displays.
      overrunOf(b) - overrunOf(a) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.id.localeCompare(b.id)
  );

  // ── CURRENT CONSTRAINTS ──────────────────────────────────────────────
  const constraints: ConstraintRow[] = [];
  // A CONSTRAINT ROW HAS TO NAME ITS CONSEQUENCE. "Unanswered decision" is
  // a category; "holding JSA" is the thing a person can act on. The scope a
  // gate blocks is stored (`DecisionGate.targetScopeId`), so the row says
  // it rather than making the reader go and look.
  for (const d of gating) {
    if (!d.gate) continue;
    const blocked = scopeName.get(d.gate.targetScopeId) ?? d.scope?.name ?? null;
    constraints.push({
      id: `gate:${d.gate.id}`,
      label: blocked ? `Holding ${blocked} — unanswered decision` : "Unanswered decision",
      detail: d.title,
      // The quantity slot carries BOTH facts, because a rail row has one
      // line: how long the model holds for it, and which project it holds.
      quantity: blocked ? `${d.gate.likely}d modelled · ${blocked}` : `${d.gate.likely}d modelled`,
      magnitude: d.gate.likely,
      href: "/decisions",
    });
  }
  if (capacity.required > 0.01) {
    constraints.push({
      id: "capacity-required",
      label: "Asked for and not on the roster",
      detail: "The plan assumes people we do not have. Nobody was invented to cover it.",
      quantity: `${capacity.required.toFixed(1)} FTE`,
      magnitude: capacity.required * 10,
      href: "/portfolio",
    });
  }
  if (capacity.switchLoss > 0.05) {
    constraints.push({
      id: "switch-loss",
      label: `Lost to switching at ${capacity.switchCostPct}%, across people on more than one project`,
      detail: "Committed time that never reaches the work",
      quantity: `${capacity.switchLoss.toFixed(1)} FTE`,
      magnitude: capacity.switchLoss * 10,
      href: "/portfolio",
    });
  }
  for (const s of data.scopes) {
    const r = preview.get(s.scopeId);
    if (!r || !s.targetDate) continue;
    const targetDate = new Date(s.targetDate);
    const over = Math.round(days(r.likelyDate, targetDate));
    if (over <= 0) continue;

    // A TARGET IN THE PAST IS NOT A DELIVERY OVERRUN, it is a stale record.
    // A 1999 target produced "10104d over" and sorted itself to the top of
    // the constraint list, above every real one, because the list orders by
    // magnitude. It is now its own kind of problem, sized as the small
    // data-hygiene task it is rather than as the largest risk on the page.
    if (targetDate < now) {
      const stale = Math.round(days(now, targetDate));
      constraints.push({
        id: `stale-target:${s.scopeId}`,
        label: `${s.name}'s target date is in the past`,
        detail: `${s.name}'s target was ${dateWithYear(targetDate)}. Set a current one.`,
        quantity: `${stale}d stale`,
        magnitude: 0,
        href: "/forecast",
      });
      continue;
    }

    constraints.push({
      id: `late:${s.scopeId}`,
      label: `${s.name} lands after its target`,
      // ALWAYS NAME THE YEAR when it is not the current one. "target Jan 1"
      // reads as NEXT January whatever year it actually is.
      detail: `Likely ${dateWithYear(r.likelyDate)}, target ${dateWithYear(targetDate)}.`,
      quantity: `${over}d over`,
      magnitude: over,
      href: "/forecast",
    });
  }
  if (reality.evidenceAgeDays !== null && reality.evidenceAgeDays > 7) {
    constraints.push({
      id: "stale-context",
      label: `Newest evidence is ${reality.newestEvidenceLabel ?? "context"}`,
      detail: "Nothing newer has been recorded about this project",
      quantity: `${Math.round(reality.evidenceAgeDays)}d ago`,
      magnitude: reality.evidenceAgeDays,
      href: "/audit",
    });
  }
  if (outcome.spreadDays !== null && outcome.spreadDays > 14) {
    constraints.push({
      id: "spread",
      label: `${outcome.gatedBy} could land across a wide range`,
      detail: "Eight runs in ten land inside that span. The rest land outside it.",
      quantity: `${outcome.spreadDays}d spread`,
      magnitude: outcome.spreadDays,
      href: "/forecast",
    });
  }
  constraints.sort((a, b) => b.magnitude - a.magnitude || a.id.localeCompare(b.id));

  // ── RECENT ACTIVITY ──────────────────────────────────────────────────
  //
  // The Timeline's own typed event stream, read — not a new event table. A
  // forecast report only counts as news when the forecast actually moved.
  const reportById = new Map(data.reports.map((r) => [r.id, r]));
  const rawActivity = entries
    .filter((e) => new Date(e.date) <= now && e.temporalState === "occurred")
    .filter((e) => {
      if (e.kind !== "report") return true;
      const rid = (e.detail as { reportId?: string }).reportId;
      const rep = rid ? reportById.get(rid) : undefined;
      return !!rep && rep.likelyDateDeltaDays !== null && rep.likelyDateDeltaDays !== 0;
    })
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // ONE LINE PER THING THAT HAPPENED, NOT PER ROW WRITTEN.
  //
  // The same question asked four times in four separate decisions is one
  // thing worth knowing, not four. Rows are grouped by what they are about
  // — same project, same kind of event, same title — the newest survives,
  // and the rest are COUNTED rather than dropped, so nothing is hidden.
  // This is de-duplication, not ranking: no row is scored, reordered or
  // suppressed, and the order is still strictly by date.
  const subjectOf = (e: TimelineEntry) => {
    const d = e.detail as { decisionId?: string; findingId?: string; eventId?: string; reportId?: string };
    return d.decisionId ?? d.findingId ?? d.eventId ?? d.reportId ?? e.id;
  };
  const grouped = new Map<string, { entry: TimelineEntry; subjects: Set<string> }>();
  for (const e of rawActivity) {
    // Grouped by what it is about, NOT by which row was written — so a
    // decision that was raised, gated and then answered appears once, in the
    // state it is in now, rather than three times.
    const key = `${e.scopeId}|${e.title}`;
    const hit = grouped.get(key);
    if (hit) hit.subjects.add(subjectOf(e));
    else grouped.set(key, { entry: e, subjects: new Set([subjectOf(e)]) });
  }

  const activity: ActivityRow[] = [...grouped.entries()]
    .slice(0, 9)
    .map(([key, { entry: e, subjects }]) => {
      const count = subjects.size;
      const rid = (e.detail as { reportId?: string }).reportId;
      const rep = e.kind === "report" && rid ? reportById.get(rid) : undefined;
      const delta = rep?.likelyDateDeltaDays ?? null;
      return {
        // THE ROW'S IDENTITY IS ITS GROUP, not the representative entry's
        // id. The projection can mint one id for two entries that differ in
        // title or scope — the seed carries `linear:SOF-100:completed`
        // twice — which put the same id on two distinct rows and made React
        // collapse them. The group key is unique by construction.
        id: key,
        title: e.title,
        at: new Date(e.date),
        kind: e.kind,
        family: e.family,
        sourceLabel: e.sourceLabel,
        scopeId: e.scopeId,
        href: e.door === "decisions" ? "/decisions" : e.door === "scope" ? "/scope" : e.door === "forecast" ? "/forecast" : "/timeline",
        note: delta !== null && delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}d` : null,
        count,
      };
    });

  // ── SYSTEM STATUS ────────────────────────────────────────────────────
  //
  // HOW OLD IS WHAT I AM LOOKING AT — one row per feed, each one a
  // timestamp somebody actually stored, and NOTHING ELSE. There is no
  // green/amber/red verdict here and no "integration health": grading a
  // feed would require a threshold nobody has set. A feed we cannot date is
  // OMITTED rather than shown as unknown, per the brief.
  //
  // Deliberately absent: Hermes availability. There is no health endpoint,
  // so "Hermes: OK" would be a guess wearing a status light.
  const newestWork = entries
    .filter((e) => e.kind === "work_completed" && new Date(e.date) <= now)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];
  const newestSource = data.sources
    .map((s) => new Date(s.createdAt))
    .filter((d) => d <= now)
    .sort((a, b) => +b - +a)[0];
  const age = (d: Date | null | undefined) => (d ? Math.max(0, days(now, d)) : null);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

  const system: SystemRow[] = [
    {
      id: "project",
      label: "Project data",
      state: `${plural(data.scopes.length, "project")} · ${data.people.filter((p) => p.active).length} on the roster`,
      ageDays: age(i.dataReceivedAt),
      href: "/portfolio",
    },
    {
      id: "forecast",
      label: "Forecast",
      state: plural(data.scopes.filter((s) => s.lastReport).length, "project") + " reported",
      ageDays: age(time.lastForecastAt),
      href: "/forecast",
    },
    newestContext
      ? {
          id: "context",
          label: "Context",
          state: newestContext.sourceLabel ?? newestContext.title,
          ageDays: age(new Date(newestContext.date)),
          href: "/timeline",
        }
      : null,
    newestWork
      ? {
          id: "work",
          label: "Work items",
          // Linear is read live on every request, so the freshest thing we
          // can date is the newest completion that read returned.
          state: "read live · newest completion",
          ageDays: age(new Date(newestWork.date)),
          href: "/scope",
        }
      : null,
    newestSource
      ? {
          id: "evidence",
          label: "Evidence",
          state: plural(data.sources.length, "document"),
          ageDays: age(newestSource),
          href: "/audit",
        }
      : null,
  ].filter((r): r is SystemRow => r !== null);

  // A FACT, NOT A GRADE. The header says how stale the stalest feed is and
  // names it, which a person can act on; "System: Good" is not something
  // this model can say.
  const dated = system.filter((r) => r.ageDays !== null);
  const oldestReading = dated.length
    ? dated.reduce((worst, r) => (r.ageDays! > worst.ageDays! ? r : worst))
    : null;

  return {
    reality,
    choices,
    capacity,
    outcome,
    time,
    dependencies,
    needsReview,
    constraints,
    activity,
    system,
    oldestReading,
    scenarioActive: i.scenarioActive,
  };
}
