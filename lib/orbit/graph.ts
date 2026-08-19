// ORBIT — THE READ MODEL.
//
// Orbit does not know anything. It re-states, in one structure, what the
// existing models already assert, so a radial surface can be drawn without
// inventing a second truth to draw from.
//
// Three rules hold this file honest:
//
//   1. NOTHING IS COMPUTED THAT AN EXISTING MODULE ALREADY COMPUTES.
//      The distribution comes from the simulation the browser already ran.
//      Capabilities come from composeFeatures. Capacity comes from the
//      workforce readings. Gates come from DecisionGate rows. This module
//      selects and relates; it does not calculate delivery.
//
//   2. EVERY EDGE CARRIES A SENTENCE. An edge that cannot say what
//      relationship it claims, and which stored field says so, is not
//      drawn. There is no force-directed decoration here and no inferred
//      adjacency.
//
//   3. NO ENERGY NUMBER. There is no "project energy". Weight on an edge is
//      always a real quantity already in the model — days of load, FTE of
//      effective capacity, days of gate delay — and it is labelled as that
//      quantity, never normalised into a fictional currency.
//
// Layout is NOT here. Angles and radii are presentation and belong to the
// renderer; persisting them would make a drawing into a fact.

import type { SimulationResult } from "@/lib/forecast/simulate";
import { percentileDay, confidenceAtDay } from "@/lib/forecast/simulate";
import type { Feature, FeatureComposition } from "@/lib/scope/features";
import type { ChannelReading } from "@/lib/capacity/workforce";

// ── WHAT ORBIT IS GIVEN ────────────────────────────────────────────────
//
// Deliberately plain data. Every field names the module that owns it, so
// the direction of dependency is one-way and this stays testable without a
// browser, a database or a clock.

/** A DecisionGate row joined to its Decision. `/api/decisions` already
    returns exactly this shape (decision + `gate: true`); the portfolio
    payload's gate list drops `decisionId`, which is why the linkage is
    read from the Decisions read rather than re-derived. */
export interface OrbitGateInput {
  gateId: string;
  decisionId: string;
  decisionTitle: string;
  decisionStatus: string;
  /** The Scope the gate says delivery is waiting on. Scope-level is the
      whole of V1's gate model — see prisma/schema.prisma. */
  targetScopeId: string;
  low: number;
  likely: number;
  high: number;
  serial: boolean;
  /** Required prose on the row: what waits, and what supports the claim. */
  dependency: string;
  evidenceForGate: string;
  evidenceCount: number;
}

export interface OrbitScopeInput {
  scopeId: string;
  name: string;
  targetDate: Date | null;
  dependsOnScopeIds: string[];
  /** From composeFeatures — the capability layer, already derived. */
  composition: FeatureComposition;
  /** From readChannel — raw vs effective, and why they differ. */
  channel: ChannelReading;
  /** What the browser's own run of runPortfolioSimulation produced. */
  sim: SimulationResult;
  /** The same, under Reality, when a Scenario is active. Null otherwise. */
  realitySim: SimulationResult | null;
  /** An aggregate capacity override the Scenario is running for this scope,
      already clamped exactly as the engine clamps it. Null when none. */
  simulatedTotal: number | null;
  /** WHERE THIS SCOPE'S CAPACITY ACTUALLY COMES FROM. Not every project has
      Allocation rows; the engine falls back to an explicit number on the
      Scope, or infers one from distinct assignees on remaining work. Orbit
      must draw capacity in all three cases, because in all three cases it
      is a causal input to the date — and must say which it is, because
      "four named people" and "four assignees we counted" are not the same
      claim. */
  capacityBasis: "allocations" | "explicit" | "inferred";
  /** The capacity the simulation was actually handed. Used when the basis
      is not `allocations`, where readChannel has nothing to read. */
  teamCapacity: number;
}

export interface OrbitInput {
  focusScopeId: string;
  startDate: Date;
  scopes: OrbitScopeInput[];
  gates: OrbitGateInput[];
  scenarioActive: boolean;
  /** Gate ids the Scenario is treating as resolved — the EXISTING
      SuiteScenario lever, not a new one. */
  resolvedGateIds: ReadonlySet<string>;
}

// ── WHAT ORBIT PRODUCES ────────────────────────────────────────────────

export type OrbitNodeKind = "forecast" | "capability" | "dependency" | "gate" | "capacity";

/** Where a node's claim comes from, so any node can be traced back without
    the renderer knowing anything about the models. */
export interface OrbitProvenance {
  /** The module or table that owns this fact. */
  source: string;
  /** Stable identifier IN that source. */
  ref: string;
}

export interface OrbitNodeBase {
  /** Stable across reloads and across Scenario changes, so a node keeps its
      identity while the system around it moves. Never a layout index. */
  id: string;
  kind: OrbitNodeKind;
  label: string;
  provenance: OrbitProvenance;
  /** True when this node is a machine's suggestion rather than accepted
      Reality. Inert by construction: nothing candidate reaches the
      simulation, and the renderer must draw it as not-yet-real. */
  candidate: boolean;
  /** Whether a Scenario lever exists for this node TODAY. Not a wish. */
  scenarioLever: OrbitLever | null;
}

/** The existing SuiteScenario fields, named. Orbit adds no lever of its
    own; if a lever is not listed here it does not exist yet. */
export type OrbitLever =
  | { kind: "resolve-gate"; gateId: string }
  | { kind: "bypass-capability"; featureId: string; itemIds: string[] }
  | { kind: "capacity-override"; scopeId: string };

export interface OrbitForecastNode extends OrbitNodeBase {
  kind: "forecast";
  scopeId: string;
  /** The real sorted trial outcomes. The renderer reads density from this
      and from nothing else. */
  completionDaysSorted: number[];
  p10: number;
  p50: number;
  p90: number;
  /** Days from startDate to the target, or null when none is set. */
  targetDay: number | null;
  confidenceAtTarget: number | null;
  /** Reality's own array while a Scenario is active — the ghost. */
  realityCompletionDaysSorted: number[] | null;
  realityP50: number | null;
}

export interface OrbitCapabilityNode extends OrbitNodeBase {
  kind: "capability";
  scopeId: string;
  /** Expected days of schedule this capability contributes — the quantity
      the edge weight states. Never normalised into a score. */
  loadDays: number;
  effortDays: number;
  range: { low: number; likely: number; high: number };
  /** (high − low) ÷ expected. Real dispersion, from the same estimates. */
  uncertainty: number;
  itemIds: string[];
  placeholderCount: number;
  /** Present only for a Hermes-sourced capability: what was said. */
  evidence: { quote: string | null; rationale: string | null } | null;
}

export interface OrbitDependencyNode extends OrbitNodeBase {
  kind: "dependency";
  scopeId: string;
  /** The upstream scope's own P50, in days from the shared startDate. */
  p50: number;
}

export interface OrbitGateNode extends OrbitNodeBase {
  kind: "gate";
  decisionId: string;
  targetScopeId: string;
  /** The gate's own three-point delay, sampled serially by the engine. */
  low: number;
  likely: number;
  high: number;
  /** True while the Scenario is treating this gate as answered. */
  assumedResolved: boolean;
  dependency: string;
  evidenceForGate: string;
  evidenceCount: number;
}

export interface OrbitCapacityNode extends OrbitNodeBase {
  kind: "capacity";
  scopeId: string;
  /** Physical human allocation. Conserved; only hiring changes the total. */
  raw: number;
  /** What the forecast actually receives, after context-switch friction. */
  effective: number;
  /** raw − effective. The loss has a cause and the cause is named below. */
  switchLoss: number;
  people: number;
  splitPeople: number;
  /** Asked for by a Scenario but not present in the workforce. Never
      silently manufactured. */
  required: number;
  /** Where this reading comes from. `allocations` is named people;
      anything else is a number standing in for them, and the surface must
      not draw it as though it knows who. */
  basis: "allocations" | "explicit" | "inferred";
  /** THE AGGREGATE OVERRIDE, WHEN ONE IS RUNNING. Portfolio's fader can ask
      the engine to simulate a specific total FTE for a scope, which
      short-circuits the roster entirely (see applyScenarioInputDelta). When
      that is set, THIS is the number the simulation actually receives — and
      `effective` above is still the roster's own reading, unchanged.
      Both are shown, because "the roster gives 2.9 and we are simulating
      1.0" is a different sentence from either half of it. Null when no
      override is running, which is the normal case. */
  simulatedTotal: number | null;
}

export type OrbitNode =
  | OrbitForecastNode
  | OrbitCapabilityNode
  | OrbitDependencyNode
  | OrbitGateNode
  | OrbitCapacityNode;

/**
 * EDGE VOCABULARY. Five kinds, and each one is a sentence.
 *
 *   load      "this capability's remaining work is part of what the
 *              simulation has to fit"                     — FORECAST-CAUSAL
 *   feeds     "these people divide that scope's effort"   — FORECAST-CAUSAL
 *   gates     "this decision is a serial delay added to
 *              that scope before any of its work counts"  — FORECAST-CAUSAL
 *   waits_on  "this scope cannot finish before that one"  — FORECAST-CAUSAL
 *   candidate "a machine believes this capability exists" — EXPLANATORY ONLY
 *
 * `causal` is not a label the renderer chooses; it is a property of which
 * stored field the edge reads, and it is stated here so a drawing can never
 * imply the engine listens to something it does not.
 */
export type OrbitEdgeKind = "load" | "feeds" | "gates" | "waits_on" | "candidate";

export interface OrbitEdge {
  id: string;
  kind: OrbitEdgeKind;
  from: string;
  to: string;
  /** True when changing this relationship changes the simulation. */
  causal: boolean;
  /** Accepted structural truth, or a machine's unaccepted suggestion. */
  structural: boolean;
  /** The real quantity this edge carries, with its unit named. There is no
      unitless weight anywhere in Orbit. */
  quantity: { value: number; unit: "days" | "fte" } | null;
  /** One sentence, for the inspector and for anyone reading this file. */
  meaning: string;
  provenance: OrbitProvenance;
}

export interface OrbitGraph {
  focusScopeId: string;
  startDate: Date;
  scenarioActive: boolean;
  nodes: OrbitNode[];
  edges: OrbitEdge[];
  /** Everything the resting view deliberately did not draw, counted rather
      than hidden — so the surface can admit its own restraint. */
  omitted: { capabilities: number; capabilityLoadDays: number };
}

// ── HOW MUCH IS SHOWN AT REST ──────────────────────────────────────────
//
// Not a hard cap on node count, and not a ranking model. Capabilities are
// taken in descending real load until the shown set accounts for most of
// the scope's engaged load; the tail is counted instead of drawn. A project
// carried by two capabilities shows two, and one spread evenly across nine
// shows more — the number emerges from the shape of the work.
const LOAD_COVERAGE = 0.85;
const MAX_CAPABILITIES = 6;

function significantCapabilities(engaged: Feature[]): { shown: Feature[]; omitted: Feature[] } {
  const sorted = [...engaged].sort((a, b) => b.loadDays - a.loadDays || a.id.localeCompare(b.id));
  const total = sorted.reduce((n, f) => n + f.loadDays, 0);
  if (total <= 0) return { shown: sorted.slice(0, MAX_CAPABILITIES), omitted: sorted.slice(MAX_CAPABILITIES) };

  const shown: Feature[] = [];
  let covered = 0;
  for (const f of sorted) {
    if (shown.length >= MAX_CAPABILITIES) break;
    shown.push(f);
    covered += f.loadDays;
    if (covered / total >= LOAD_COVERAGE) break;
  }
  return { shown, omitted: sorted.slice(shown.length) };
}

const dayOf = (startDate: Date, d: Date | null): number | null =>
  d === null ? null : Math.round((d.getTime() - startDate.getTime()) / 86400000);

/**
 * Reality (and the Scenario over it) as one graph.
 *
 * PURE. Same input, same output — no clock, no randomness, no fetch, no
 * ordering that depends on object iteration. Node and edge arrays are
 * sorted by stable ids so two builds of the same truth are byte-identical.
 */
export function buildOrbitGraph(input: OrbitInput): OrbitGraph {
  const { focusScopeId, startDate, scopes, gates, scenarioActive, resolvedGateIds } = input;
  const focus = scopes.find((s) => s.scopeId === focusScopeId);
  if (!focus) {
    return {
      focusScopeId,
      startDate,
      scenarioActive,
      nodes: [],
      edges: [],
      omitted: { capabilities: 0, capabilityLoadDays: 0 },
    };
  }

  const nodes: OrbitNode[] = [];
  const edges: OrbitEdge[] = [];

  // ── CENTRE: the consequence ──────────────────────────────────────────
  const targetDay = dayOf(startDate, focus.targetDate);
  const forecastId = `forecast:${focus.scopeId}`;
  nodes.push({
    id: forecastId,
    kind: "forecast",
    label: focus.name,
    candidate: false,
    scenarioLever: null,
    provenance: { source: "lib/forecast/simulate.ts:runSimulation", ref: focus.scopeId },
    scopeId: focus.scopeId,
    completionDaysSorted: focus.sim.completionDaysSorted,
    p10: percentileDay(focus.sim.completionDaysSorted, 10),
    p50: percentileDay(focus.sim.completionDaysSorted, 50),
    p90: percentileDay(focus.sim.completionDaysSorted, 90),
    targetDay,
    // TARGET IS EVALUATION, NOT INPUT. Confidence is recomputed by counting
    // the SAME trials against a different day — the distribution is never
    // re-run because a target moved.
    confidenceAtTarget: targetDay === null ? null : confidenceAtDay(focus.sim.completionDaysSorted, targetDay),
    realityCompletionDaysSorted: focus.realitySim?.completionDaysSorted ?? null,
    realityP50: focus.realitySim ? percentileDay(focus.realitySim.completionDaysSorted, 50) : null,
  });

  // ── FIRST ORBIT: what ships ──────────────────────────────────────────
  const { shown, omitted } = significantCapabilities(focus.composition.engaged);
  for (const f of shown) {
    const id = `capability:${focus.scopeId}:${f.id}`;
    const isCandidate = f.source === "hermes" && !f.accepted;
    nodes.push({
      id,
      kind: "capability",
      label: f.name,
      candidate: isCandidate,
      // BYPASS IS THE EXISTING LEVER. SuiteScenario.bypassedFeatureIds plus
      // the item exclusions Scope already writes alongside it.
      scenarioLever: { kind: "bypass-capability", featureId: f.id, itemIds: f.items.map((i) => i.id) },
      provenance: { source: "lib/scope/features.ts:composeFeatures", ref: f.id },
      scopeId: focus.scopeId,
      loadDays: f.loadDays,
      effortDays: f.effortDays,
      range: f.range,
      uncertainty: f.uncertainty,
      itemIds: f.items.map((i) => i.id),
      placeholderCount: f.placeholderCount,
      evidence: f.evidence,
    });
    edges.push({
      id: `load:${id}`,
      kind: isCandidate ? "candidate" : "load",
      from: id,
      to: forecastId,
      causal: !isCandidate,
      structural: !isCandidate,
      quantity: { value: f.loadDays, unit: "days" },
      meaning: isCandidate
        ? "A machine believes this capability is part of the release. It is not accepted, and the simulation does not treat it as one."
        : "This capability's remaining work is part of what the simulation has to fit.",
      provenance: { source: "lib/scope/features.ts:composeFeatures", ref: f.id },
    });
  }

  // ── FIRST ORBIT: what this scope waits on ────────────────────────────
  for (const depId of [...focus.dependsOnScopeIds].sort()) {
    const dep = scopes.find((s) => s.scopeId === depId);
    if (!dep) continue;
    const id = `dependency:${depId}`;
    nodes.push({
      id,
      kind: "dependency",
      label: dep.name,
      candidate: false,
      scenarioLever: null,
      provenance: { source: "prisma:Scope.dependsOnScopeIds", ref: depId },
      scopeId: depId,
      p50: percentileDay(dep.sim.completionDaysSorted, 50),
    });
    edges.push({
      id: `waits_on:${focus.scopeId}:${depId}`,
      kind: "waits_on",
      from: forecastId,
      to: id,
      causal: true,
      structural: true,
      quantity: { value: percentileDay(dep.sim.completionDaysSorted, 50), unit: "days" },
      meaning:
        "This scope cannot finish before that one. Every trial takes the later of the two, so the upstream scope's own spread is part of this outcome.",
      provenance: { source: "lib/forecast/portfolio.ts:runPortfolioTrials", ref: `${focus.scopeId}<-${depId}` },
    });
  }

  // ── SECOND ORBIT: what controls movement ─────────────────────────────
  //
  // A Decision is only here if a DecisionGate row exists saying delivery
  // waits on it. An open Decision with no gate has no presence in Orbit,
  // for the same reason it has none in the forecast.
  const inView = new Set([focus.scopeId, ...focus.dependsOnScopeIds]);
  const relevantGates = gates
    .filter((g) => inView.has(g.targetScopeId) && g.serial && g.decisionStatus === "open")
    .sort((a, b) => a.gateId.localeCompare(b.gateId));

  for (const g of relevantGates) {
    const id = `gate:${g.gateId}`;
    const assumed = resolvedGateIds.has(g.gateId);
    nodes.push({
      id,
      kind: "gate",
      label: g.decisionTitle,
      candidate: false,
      scenarioLever: { kind: "resolve-gate", gateId: g.gateId },
      provenance: { source: "prisma:DecisionGate", ref: g.gateId },
      decisionId: g.decisionId,
      targetScopeId: g.targetScopeId,
      low: g.low,
      likely: g.likely,
      high: g.high,
      assumedResolved: assumed,
      dependency: g.dependency,
      evidenceForGate: g.evidenceForGate,
      evidenceCount: g.evidenceCount,
    });
    const target =
      g.targetScopeId === focus.scopeId ? forecastId : `dependency:${g.targetScopeId}`;
    edges.push({
      id: `gates:${g.gateId}`,
      kind: "gates",
      from: id,
      to: target,
      // An assumed-resolved gate is still drawn — you need to see what you
      // switched off — but it is no longer acting on the simulation.
      causal: !assumed,
      structural: true,
      quantity: { value: assumed ? 0 : g.likely, unit: "days" },
      meaning:
        "This decision is a serial delay added to that scope: until it is answered, the engine adds its sampled days before any of that scope's work counts.",
      provenance: { source: "prisma:DecisionGate.targetScopeId", ref: g.gateId },
    });
  }

  // ── SECOND ORBIT: the people ─────────────────────────────────────────
  for (const s of [focus, ...focus.dependsOnScopeIds.map((d) => scopes.find((x) => x.scopeId === d)).filter(Boolean) as OrbitScopeInput[]]) {
    const named = s.capacityBasis === "allocations";
    // What the simulation was handed, whichever rung of the fallback chain
    // it came from. A project with no Allocation rows still has capacity in
    // the forecast, and leaving it off the picture would hide a cause.
    const raw = named ? s.channel.raw : s.teamCapacity;
    const effective = named ? s.channel.effective : s.teamCapacity;
    if (raw <= 0 && effective <= 0 && s.channel.required <= 0) continue;
    const id = `capacity:${s.scopeId}`;
    nodes.push({
      id,
      kind: "capacity",
      label: s.name,
      candidate: false,
      scenarioLever: { kind: "capacity-override", scopeId: s.scopeId },
      provenance: { source: "lib/capacity/workforce.ts:readChannel", ref: s.scopeId },
      scopeId: s.scopeId,
      raw,
      effective,
      // Switch loss is a property of named people being split. Where there
      // are no named people there is no switch loss to claim.
      switchLoss: named ? Math.max(0, s.channel.raw - s.channel.effective) : 0,
      people: named ? s.channel.people : 0,
      splitPeople: named ? s.channel.splitPeople : 0,
      required: s.channel.required,
      simulatedTotal: s.simulatedTotal,
      basis: s.capacityBasis,
    });
    edges.push({
      id: `feeds:${s.scopeId}`,
      kind: "feeds",
      from: id,
      to: s.scopeId === focus.scopeId ? forecastId : `dependency:${s.scopeId}`,
      causal: true,
      structural: true,
      // EFFECTIVE, not raw — the forecast divides effort by what actually
      // arrives, and the difference between the two is the switch loss the
      // node carries separately.
      quantity: { value: s.simulatedTotal ?? effective, unit: "fte" },
      meaning:
        s.simulatedTotal !== null
          ? "This scenario is simulating a total instead of the roster. The figure is that total, because it is what the simulation receives; the roster's own contribution is unchanged and still stated on the node."
          : named
            ? "These people divide that scope's remaining effort. The figure is effective capacity — physical allocation after context-switch friction — because that is what the simulation receives."
            : "Nobody is allocated to this project on the roster, so the forecast is using a stand-in figure for how many people are on it. It is a real input to the date, and it is a weaker claim than a named team.",
      provenance: { source: "lib/capacity/resolve.ts:resolveCapacity", ref: s.scopeId },
    });
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  return {
    focusScopeId,
    startDate,
    scenarioActive,
    nodes,
    edges,
    omitted: {
      capabilities: omitted.length,
      capabilityLoadDays: omitted.reduce((n, f) => n + f.loadDays, 0),
    },
  };
}

/** Everything one node touches, for the focus interaction. Pure, and a
    function of the graph alone — the renderer never walks the models. */
export function relatedTo(graph: OrbitGraph, nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  for (const e of graph.edges) {
    if (e.from === nodeId || e.to === nodeId) {
      edges.add(e.id);
      nodes.add(e.from);
      nodes.add(e.to);
    }
  }
  // One more hop toward the centre, so touching a gate shows the path to
  // the consequence rather than stopping at the scope it blocks.
  for (const e of graph.edges) {
    if (nodes.has(e.from) && e.to.startsWith("forecast:")) {
      edges.add(e.id);
      nodes.add(e.to);
    }
  }
  return { nodes, edges };
}
