// THE PROJECT AS AN OBJECT, NOT AS A LIST OF FACTS.
//
// V1 and V2 answered "what is true?" a card at a time. This module answers
// a different question — "why is the project shaped like this?" — and the
// answer is structural, so it has to be composed structurally:
//
//   · which project waits on which, and how deep that chain runs
//   · who is downstream of a change, transitively
//   · where each project actually lands, against where it was aimed
//   · what is clamped onto a lane, and what that clamp is holding up
//   · how much of the committed time is reaching each lane
//
// EVERYTHING HERE IS DERIVED FROM TRUTH THAT ALREADY EXISTS. Dependency
// edges are declared (`Scope.dependsOnScopeIds`) and honoured by the
// engine; landings are the simulation's own percentiles; gates are stored
// `DecisionGate` rows with their stored `likely`; capacity is Portfolio's
// own readChannel. No schema was added, no relationship inferred, and no
// score invented — there is no "pressure", no "risk", no "criticality"
// anywhere in this file, because none of those exist in the model.
//
// PURE. Same contract as lib/control-room/read.ts: a `now` is handed in,
// nothing is fetched, nothing is stored.

import { percentileDay } from "@/lib/forecast/simulate";
import type { SimulationResult, DecisionGate } from "@/lib/forecast/simulate";
import { readChannel } from "@/lib/capacity/workforce";
import { readDominance } from "@/lib/scope/constraint";
import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";
import type { DecisionRow } from "@/lib/decisions/model";

const DAY = 86400000;

export interface FieldInput {
  now: Date;
  data: ProjectPayload;
  scenario: SuiteScenario;
  scenarioActive: boolean;
  /** The Scenario's simulations, or Reality's when none is set. */
  preview: Map<string, SimulationResult>;
  /** Reality's own, always — so a Scenario can be drawn AGAINST reality. */
  baseline: Map<string, SimulationResult>;
  /** Per scope, where it lands with its whole backlog cut. The honest floor. */
  floorByScope: Map<string, SimulationResult> | null;
  decisions: DecisionRow[];
}

// ── A LANE ─────────────────────────────────────────────────────────────

export interface FieldGate {
  id: string;
  label: string;
  /** The scope this gate blocks. Gates are SCOPE-level; there is no
      feature-level gate in the model and none is drawn. */
  scopeId: string;
  /** The stored `likely` delay, in days. Not an estimate of one. */
  likelyDays: number;
  /** Assumed answered in the current Scenario. */
  released: boolean;
  /** Scopes that transitively wait on the one this gate blocks — the
      lanes that move if this single question gets answered. */
  downstreamScopeIds: string[];
  /** Where the clamp sits on the time axis: the blocked lane's landing.
      A gate has no date of its own; it is drawn where its consequence is. */
  atDays: number;
}

export interface FieldLane {
  scopeId: string;
  name: string;
  /** How many declared edges deep this lane sits. 0 = waits on nothing. */
  depth: number;
  dependsOnScopeIds: string[];
  /** Everything that transitively waits on this lane. */
  downstreamScopeIds: string[];
  /** Everything this lane transitively waits on. */
  upstreamScopeIds: string[];

  // WHERE IT LANDS, in days from the project's start date.
  p10: number | null;
  p50: number | null;
  p90: number | null;
  /** Reality's own P50 while a Scenario is running, so the drawing can show
      the move rather than just the destination. */
  realityP50: number | null;
  targetDays: number | null;
  /** P50 − target. Positive = late. Null without a target. */
  gapDays: number | null;
  confidence: number | null;

  // WHY IT LANDS THERE.
  /** Where it would still land with EVERY work item cut. */
  floorDays: number | null;
  /** landing − floor. Zero means the backlog has stopped deciding the date. */
  headroomDays: number | null;
  dominated: boolean;
  /** One sentence naming what is holding it, from readDominance. */
  dominancePhrase: string;

  gates: FieldGate[];

  // HOW MUCH ABILITY IS REACHING IT.
  capacityRaw: number;
  capacityEffective: number;
  /** Where the roster is silent and the engine used a stand-in head count. */
  capacityBasis: "allocations" | "explicit" | "inferred";
  /** People on this lane who are also on another one. */
  splitPeople: number;
  /** Capacity asked for and absent. Never manufactured. */
  capacityRequired: number;
}

export interface FieldEdge {
  id: string;
  fromScopeId: string;
  toScopeId: string;
  /** Days between the upstream landing and the downstream landing. Both are
      real P50s; this is a distance, not a claim about causation strength. */
  slackDays: number | null;
  /** True when the upstream carries more than one downstream lane — the
      single point whose slip moves several launches at once. */
  shared: boolean;
}

export interface ProjectField {
  lanes: FieldLane[];
  edges: FieldEdge[];
  gates: FieldGate[];
  /** Time axis, in days from the project's start date. */
  startDay: number;
  endDay: number;
  nowDay: number;
  startDate: Date;
  /** The lane that lands last — the one that sets the project's date. */
  gatingScopeId: string | null;
  /** Upstreams carrying more than one downstream lane, worst first. */
  sharedUpstreamIds: string[];
}

// ── SELECTION: WHAT DOES THIS THING CAUSE? ─────────────────────────────

export type SelectionKind = "lane" | "edge" | "gate" | "capacity";

export interface Selection {
  kind: SelectionKind;
  id: string;
}

/** Every lane a selection reaches, INCLUDING the one it is on. Empty when
    nothing is selected. This is the whole causality model: highlight is a
    graph walk over declared edges, never a guess. */
export function reachOf(field: ProjectField, sel: Selection | null): Set<string> {
  if (!sel) return new Set();
  const laneById = new Map(field.lanes.map((l) => [l.scopeId, l]));
  const out = new Set<string>();
  const add = (scopeId: string) => {
    const lane = laneById.get(scopeId);
    if (!lane) return;
    out.add(scopeId);
    for (const d of lane.downstreamScopeIds) out.add(d);
  };
  if (sel.kind === "lane" || sel.kind === "capacity") add(sel.id);
  if (sel.kind === "gate") {
    const g = field.gates.find((x) => x.id === sel.id);
    if (g) add(g.scopeId);
  }
  if (sel.kind === "edge") {
    const e = field.edges.find((x) => x.id === sel.id);
    // An edge's consequence starts at its UPSTREAM: that is the thing whose
    // movement travels. Highlighting only the waiting end would show the
    // victim and hide the cause.
    if (e) add(e.fromScopeId);
  }
  return out;
}

// ── COMPOSITION ────────────────────────────────────────────────────────

/** Transitive closure over declared edges, in one direction. Cycles are
    tolerated (a `seen` set), because a declared graph is human-entered and
    the drawing must not hang on a mistake. */
function closure(seed: string, next: (id: string) => string[], seen = new Set<string>()): Set<string> {
  for (const n of next(seed)) {
    if (seen.has(n)) continue;
    seen.add(n);
    closure(n, next, seen);
  }
  return seen;
}

export function readProjectField(i: FieldInput): ProjectField {
  const { now, data, scenario, preview, baseline, floorByScope, decisions } = i;
  const startDate = new Date(data.startDate);
  const toDays = (d: Date) => (d.getTime() - startDate.getTime()) / DAY;
  const nowDay = toDays(now);

  const scopes = data.scopes;
  const nameById = new Map(scopes.map((s) => [s.scopeId, s.name]));
  const upById = new Map(scopes.map((s) => [s.scopeId, s.dependsOnScopeIds.filter((x) => nameById.has(x))]));

  // WHO WAITS ON ME. The declared graph, inverted once so every lane can be
  // asked its downstream reach in constant time.
  const downById = new Map<string, string[]>(scopes.map((s) => [s.scopeId, []]));
  for (const s of scopes) {
    for (const up of upById.get(s.scopeId) ?? []) downById.get(up)?.push(s.scopeId);
  }

  const upstreamOf = (id: string) => closure(id, (x) => upById.get(x) ?? []);
  const downstreamOf = (id: string) => closure(id, (x) => downById.get(x) ?? []);

  // DEPTH is the longest declared chain above a lane. It is the ordering
  // that makes the drawing readable: upstream at the top, and a lane never
  // sits above something it waits on.
  const depthCache = new Map<string, number>();
  const depthOf = (id: string, guard = new Set<string>()): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (guard.has(id)) return 0;
    guard.add(id);
    const ups = upById.get(id) ?? [];
    const d = ups.length === 0 ? 0 : 1 + Math.max(...ups.map((u) => depthOf(u, guard)));
    depthCache.set(id, d);
    return d;
  };

  const switchCostPct = scenario.contextSwitchCostPct ?? data.contextSwitchCostPct;
  const workforce = {
    people: data.people,
    allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
  };

  // Gate rows come from Decisions, which is the owner. The scope payload's
  // `gates` array is what the ENGINE was handed; joining the two gives the
  // human label alongside the modelled delay without either being invented.
  const decisionByGateId = new Map(
    decisions.filter((d) => d.gate).map((d) => [d.gate!.id, d])
  );

  const lanes: FieldLane[] = scopes.map((s) => {
    const sim = preview.get(s.scopeId) ?? null;
    const real = baseline.get(s.scopeId) ?? null;
    const floor = floorByScope?.get(s.scopeId) ?? null;
    const target = s.targetDate ? toDays(new Date(s.targetDate)) : null;
    const ch = readChannel(workforce, s.scopeId, switchCostPct);
    const named = s.capacitySource === "allocations";
    const ups = upById.get(s.scopeId) ?? [];
    const dom = sim
      ? readDominance(
          sim,
          floor,
          startDate,
          s.gates,
          scenario.resolvedGateIds,
          ups.map((u) => nameById.get(u) ?? u)
        )
      : null;

    const gates: FieldGate[] = s.gates.map((g: DecisionGate) => ({
      id: g.id,
      label: decisionByGateId.get(g.id)?.title ?? g.label,
      scopeId: s.scopeId,
      likelyDays: g.likely,
      released: scenario.resolvedGateIds.has(g.id),
      downstreamScopeIds: [...downstreamOf(s.scopeId)],
      atDays: sim ? toDays(sim.likelyDate) : (target ?? nowDay),
    }));

    return {
      scopeId: s.scopeId,
      name: s.name,
      depth: depthOf(s.scopeId),
      dependsOnScopeIds: ups,
      downstreamScopeIds: [...downstreamOf(s.scopeId)],
      upstreamScopeIds: [...upstreamOf(s.scopeId)],
      p10: sim ? percentileDay(sim.completionDaysSorted, 10) : null,
      p50: sim ? toDays(sim.likelyDate) : null,
      p90: sim ? percentileDay(sim.completionDaysSorted, 90) : null,
      realityP50: i.scenarioActive && real ? toDays(real.likelyDate) : null,
      targetDays: target,
      gapDays: sim && target !== null ? toDays(sim.likelyDate) - target : null,
      confidence: sim?.confidenceAtTarget ?? null,
      floorDays: dom ? dom.floorDays : null,
      headroomDays: dom ? dom.headroomDays : null,
      dominated: dom?.dominated ?? false,
      dominancePhrase: dom?.phrase ?? "",
      gates,
      capacityRaw: named ? ch.raw : s.teamCapacity,
      capacityEffective: named ? ch.effective : s.teamCapacity,
      capacityBasis: s.capacitySource,
      splitPeople: ch.splitPeople,
      capacityRequired: ch.required,
    };
  });

  // READING ORDER: BY DEPENDENCY TREE, not by depth alone.
  //
  // Depth alone puts every root at the top, which drops a release spine
  // straight through lanes that are not on the chain — and a line crossing
  // a lane it has nothing to do with is a false statement, however
  // decorative. So the order is a walk: each root, then its own
  // descendants immediately underneath it, siblings in landing order.
  // A spine therefore always covers CONTIGUOUS rows, and "everything
  // between these two points moves when this one does" is true by
  // construction rather than by luck.
  const byId = new Map(lanes.map((l) => [l.scopeId, l]));
  const land = (id: string) => byId.get(id)?.p50 ?? Infinity;
  const kidsOf = (id: string) => [...(downById.get(id) ?? [])].sort((a, b) => land(a) - land(b) || a.localeCompare(b));
  const ordered: FieldLane[] = [];
  const placed = new Set<string>();
  const walk = (id: string) => {
    if (placed.has(id)) return;
    const lane = byId.get(id);
    if (!lane) return;
    placed.add(id);
    ordered.push(lane);
    for (const k of kidsOf(id)) {
      // A lane with two upstreams belongs under the one that lands last —
      // placing it under the earlier one would draw a spine that overshoots.
      const ups = upById.get(k) ?? [];
      if (ups.length > 1 && ups.some((u) => !placed.has(u))) continue;
      walk(k);
    }
  };
  const roots = lanes
    .filter((l) => l.dependsOnScopeIds.length === 0)
    // Carriers first: a root that other lanes wait on is the head of a
    // chain and earns the top of the field. Then by where it lands.
    .sort(
      (a, b) =>
        (b.downstreamScopeIds.length > 0 ? 1 : 0) - (a.downstreamScopeIds.length > 0 ? 1 : 0) ||
        (a.p50 ?? Infinity) - (b.p50 ?? Infinity) ||
        a.scopeId.localeCompare(b.scopeId)
    );
  for (const r of roots) walk(r.scopeId);
  // Anything left is inside a declared cycle; it still gets drawn.
  for (const l of lanes) walk(l.scopeId);
  lanes.length = 0;
  lanes.push(...ordered);

  const laneById = byId;

  const edges: FieldEdge[] = [];
  for (const l of lanes) {
    for (const up of l.dependsOnScopeIds) {
      const from = laneById.get(up);
      if (!from) continue;
      edges.push({
        id: `${up}->${l.scopeId}`,
        fromScopeId: up,
        toScopeId: l.scopeId,
        slackDays: from.p50 !== null && l.p50 !== null ? l.p50 - from.p50 : null,
        shared: (downById.get(up) ?? []).length > 1,
      });
    }
  }

  const gates = lanes.flatMap((l) => l.gates);

  // THE TIME AXIS. Wide enough for every drawn thing — the latest P90, the
  // furthest target, and NOW — with a small margin so nothing sits on the
  // frame. Never wider than the data justifies.
  const marks = [
    nowDay,
    ...lanes.flatMap((l) => [l.p10, l.p50, l.p90, l.targetDays, l.realityP50].filter((x): x is number => x !== null)),
  ];
  const lo = Math.min(0, ...marks);
  const hi = Math.max(nowDay + 1, ...marks);
  const pad = Math.max(2, (hi - lo) * 0.04);

  let gatingScopeId: string | null = null;
  let latest = -Infinity;
  for (const l of lanes) {
    if (l.p50 !== null && l.p50 > latest) {
      latest = l.p50;
      gatingScopeId = l.scopeId;
    }
  }

  const sharedUpstreamIds = [...downById.entries()]
    .filter(([, d]) => d.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([id]) => id);

  return {
    lanes,
    edges,
    gates,
    startDay: lo - pad,
    endDay: hi + pad,
    nowDay,
    startDate,
    gatingScopeId,
    sharedUpstreamIds,
  };
}
