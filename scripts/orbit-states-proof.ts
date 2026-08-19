// THE FIVE CONDITIONS, BUILT FROM LEGITIMATE INPUTS.
//
// Orbit's claim is that one radial vocabulary can tell five different
// stories about the same project without a new number being invented for
// any of them. This file builds each condition out of nothing but inputs
// the existing models already accept — work items, allocations, gates and
// the Scenario levers that exist today — and shows that the resulting
// graphs are genuinely different objects rather than the same picture with
// different labels.
//
// WHAT IS DELIBERATELY NOT HERE: a score. There is no "project energy",
// no health index, and nothing normalised. The only comparison made below
// is DAYS OF SCHEDULE against DAYS OF SCHEDULE — a gate's sampled delay and
// a capability's remaining load are both days the simulation has to fit,
// which is why they can be held next to each other. Capacity is never
// compared to either; it is read on its own terms (FTE present, FTE lost,
// FTE asked for and absent), because dividing people by days to get a
// single figure would be exactly the fiction §3 forbids.
//
// The reading below is a PROPOSAL for the visual design pass, and lives in
// this script rather than in lib/orbit/graph.ts on purpose: the foundation
// pass ships the vocabulary, not an opinion about it.
//
//   npx tsx scripts/orbit-states-proof.ts
import { buildOrbitGraph } from "../lib/orbit/graph";
import type { OrbitInput, OrbitGraph, OrbitScopeInput, OrbitGateInput } from "../lib/orbit/graph";
import type { SimulationResult } from "../lib/forecast/simulate";
import type { Feature, FeatureComposition } from "../lib/scope/features";
import type { ChannelReading } from "../lib/capacity/workforce";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const START = new Date("2026-01-01T00:00:00.000Z");
const sortedDays = (base: number, spread: number): number[] =>
  Array.from({ length: 200 }, (_, i) => base + Math.round((i / 199) * spread));

const sim = (base: number, spread: number): SimulationResult => {
  const completionDaysSorted = sortedDays(base, spread);
  return {
    likelyDate: new Date(START.getTime() + completionDaysSorted[100] * 86400000),
    earliestDate: new Date(START.getTime() + completionDaysSorted[0] * 86400000),
    latestDate: new Date(START.getTime() + completionDaysSorted[199] * 86400000),
    confidenceAtTarget: null,
    remainingEffortDays: { low: 10, likely: 20, high: 40 },
    decisionDelayDays: { low: 0, likely: 0, high: 0 },
    completionDaysSorted,
    percentiles: { p10: 0, p50: 0, p70: 0, p85: 0, p90: 0 },
  };
};

const feature = (id: string, name: string, loadDays: number): Feature => ({
  id,
  name,
  source: "linear",
  epic: null,
  items: [{ id: `${id}-i1` } as unknown as Feature["items"][number]],
  done: [],
  effortDays: loadDays * 2,
  loadDays,
  range: { low: loadDays, likely: loadDays * 2, high: loadDays * 4 },
  uncertainty: 1.5,
  placeholderCount: 0,
  evidence: null,
  bypassed: false,
  accepted: false,
});

const composition = (engaged: Feature[]): FeatureComposition => ({
  features: engaged,
  engaged,
  bypassed: [],
  loadDays: engaged.reduce((n, f) => n + f.loadDays, 0),
  peakLoadDays: Math.max(0, ...engaged.map((f) => f.loadDays)),
  totalItems: engaged.length,
  unmappedItems: 0,
});

const channel = (scopeId: string, raw: number, effective: number, required = 0): ChannelReading => ({
  scopeId,
  raw,
  effective,
  splitRaw: Math.max(0, raw - effective),
  splitPeople: raw === effective ? 0 : 1,
  people: Math.max(1, Math.round(raw)),
  required,
});

const gate = (id: string, likely: number): OrbitGateInput => ({
  gateId: id,
  decisionId: `d-${id}`,
  decisionTitle: `Open question ${id}`,
  decisionStatus: "open",
  targetScopeId: "jsa",
  low: Math.max(1, Math.round(likely / 4)),
  likely,
  high: likely * 3,
  serial: true,
  dependency: "Delivery cannot proceed until this is settled.",
  evidenceForGate: "Stated on the record.",
  evidenceCount: 1,
});

/** One scope, varied. Everything not named keeps a calm default so the
    difference between two states is exactly the thing being demonstrated. */
function state(over: {
  features?: Feature[];
  channel?: ChannelReading;
  gates?: OrbitGateInput[];
  resolved?: string[];
  sim?: SimulationResult;
  realitySim?: SimulationResult | null;
  scenarioActive?: boolean;
}): OrbitInput {
  const jsa: OrbitScopeInput = {
    scopeId: "jsa",
    name: "JSA",
    targetDate: new Date("2026-05-01T00:00:00.000Z"),
    dependsOnScopeIds: [],
    composition: composition(over.features ?? [feature("f1", "Offline capture", 12), feature("f2", "Forms engine", 10)]),
    channel: over.channel ?? channel("jsa", 4, 3.6),
    sim: over.sim ?? sim(100, 60),
    realitySim: over.realitySim ?? null,
  };
  return {
    focusScopeId: "jsa",
    startDate: START,
    scopes: [jsa],
    gates: over.gates ?? [gate("g1", 3)],
    scenarioActive: over.scenarioActive ?? false,
    resolvedGateIds: new Set(over.resolved ?? []),
  };
}

// ── THE READING ────────────────────────────────────────────────────────
//
// Facts, in their own units, read off the graph. Nothing here is a score
// and nothing is normalised; a caller that wants a headline picks one of
// these sentences, it does not add them up.
interface Reading {
  capabilityDays: number;
  gateDays: number;
  fteDelivered: number;
  fteLost: number;
  fteMissing: number;
  earlierThanReality: number | null;
}

function read(g: OrbitGraph): Reading {
  let capabilityDays = 0;
  let gateDays = 0;
  for (const e of g.edges) {
    if (!e.causal || !e.quantity) continue;
    if (e.kind === "load") capabilityDays += e.quantity.value;
    if (e.kind === "gates") gateDays += e.quantity.value;
  }
  const cap = g.nodes.find((n) => n.kind === "capacity");
  const f = g.nodes.find((n) => n.kind === "forecast");
  return {
    capabilityDays,
    gateDays,
    fteDelivered: cap?.kind === "capacity" ? cap.effective : 0,
    fteLost: cap?.kind === "capacity" ? cap.switchLoss : 0,
    fteMissing: cap?.kind === "capacity" ? cap.required : 0,
    earlierThanReality:
      f?.kind === "forecast" && f.realityP50 !== null ? f.realityP50 - f.p50 : null,
  };
}

// ── THE FIVE ───────────────────────────────────────────────────────────

const STATES: { name: string; input: OrbitInput; expect: (r: Reading, g: OrbitGraph) => boolean; says: (r: Reading) => string }[] = [
  {
    // Work and open questions are both present and neither is running the
    // project. Nothing is missing from the roster.
    name: "BALANCED",
    input: state({}),
    expect: (r) => r.gateDays < r.capabilityDays && r.fteMissing === 0 && r.gateDays > 0,
    says: (r) => `${r.capabilityDays.toFixed(0)}d of work, ${r.gateDays.toFixed(0)}d waiting on answers`,
  },
  {
    // Unanswered questions account for more schedule than the remaining
    // work does. Cutting scope here buys almost nothing.
    name: "DECISION CHOKE",
    input: state({
      features: [feature("f1", "Offline capture", 4)],
      gates: [gate("g1", 14), gate("g2", 9), gate("g3", 6)],
    }),
    expect: (r, g) => r.gateDays > r.capabilityDays && g.nodes.filter((n) => n.kind === "gate").length === 3,
    says: (r) => `${r.gateDays.toFixed(0)}d held by decisions against ${r.capabilityDays.toFixed(0)}d of work`,
  },
  {
    // The people the plan assumes are not on the roster, and some of what
    // IS on the roster is being spent on switching rather than delivery.
    name: "CAPACITY STARVATION",
    input: state({ channel: channel("jsa", 3.5, 2.1, 2) }),
    expect: (r) => r.fteMissing > 0 && r.fteLost > 0,
    says: (r) =>
      `${r.fteDelivered.toFixed(1)} FTE delivered, ${r.fteLost.toFixed(1)} lost to switching, ${r.fteMissing.toFixed(1)} asked for and absent`,
  },
  {
    // The release itself is the constraint: lots of work, one small
    // question. This is the state where cutting scope is the real lever.
    name: "SCOPE HEAVY",
    input: state({
      features: [
        feature("f1", "Offline capture", 40),
        feature("f2", "Forms engine", 26),
        feature("f3", "Compliance export", 18),
        feature("f4", "Review & approval", 15),
      ],
      gates: [gate("g1", 2)],
    }),
    expect: (r, g) =>
      r.capabilityDays > r.gateDays * 10 && g.nodes.filter((n) => n.kind === "capability").length >= 3,
    says: (r) => `${r.capabilityDays.toFixed(0)}d of work against ${r.gateDays.toFixed(0)}d of decision delay`,
  },
  {
    // A hypothetical is running, the gate it assumes answered has stopped
    // acting, and the date it buys is visible against Reality's own.
    name: "SCENARIO RELIEF",
    input: state({
      gates: [gate("g1", 12)],
      resolved: ["g1"],
      scenarioActive: true,
      sim: sim(100, 60),
      realitySim: sim(112, 60),
    }),
    expect: (r, g) => {
      const gateNode = g.nodes.find((n) => n.kind === "gate");
      const gateEdge = g.edges.find((e) => e.kind === "gates");
      return (
        gateNode?.kind === "gate" &&
        gateNode.assumedResolved === true &&
        gateEdge?.causal === false &&
        r.gateDays === 0 &&
        (r.earlierThanReality ?? 0) > 0
      );
    },
    says: (r) => `${r.earlierThanReality}d earlier than Reality with the decision assumed answered`,
  },
];

console.log("── THE FIVE STATES ──────────────────────────────────────────\n");
const graphs = new Map<string, OrbitGraph>();
for (const s of STATES) {
  const g = buildOrbitGraph(s.input);
  graphs.set(s.name, g);
  const r = read(g);
  check(
    `${s.name} is producible from real model inputs alone`,
    s.expect(r, g),
    s.says(r)
  );
}

console.log("");

// Each state must be a genuinely different object, not the same picture
// relabelled — otherwise the radial form is telling one story five times.
const topology = new Map<string, string>();
const shapes = new Map<string, string>();
for (const [name, g] of graphs) {
  const counts = new Map<string, number>();
  for (const n of g.nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const r = read(g);
  const t = [...counts.entries()].sort().map(([k, v]) => `${k}:${v}`).join(",");
  topology.set(name, t);
  shapes.set(name, `${t}|gateDays:${r.gateDays.toFixed(1)}|fte:${r.fteDelivered.toFixed(1)}/${r.fteLost.toFixed(1)}/${r.fteMissing.toFixed(1)}`);
}
check(
  "No two states draw the same graph",
  new Set(shapes.values()).size === STATES.length,
  [...shapes.entries()].map(([n, s]) => `\n        ${n} = ${s}`).join("")
);

// A FINDING FOR THE DESIGN PASS, ASSERTED SO IT CANNOT BE FORGOTTEN.
//
// BALANCED and CAPACITY STARVATION have IDENTICAL topology: same node
// kinds, same counts, same edges. Everything that separates them lives
// inside one node's reading — FTE delivered, FTE lost to switching, FTE
// asked for and absent. So a radial design that encodes state in shape
// alone WILL show a starved project as a healthy one.
//
// The read model is not at fault: the numbers are all there, and they are
// the workforce module's own. This is a statement about what the drawing
// must do — the capacity object needs a visual channel that changes when
// the roster cannot cover the plan, and it cannot be a node count.
check(
  "Starvation is invisible in topology and must be carried by the capacity reading",
  topology.get("BALANCED") === topology.get("CAPACITY STARVATION") &&
    shapes.get("BALANCED") !== shapes.get("CAPACITY STARVATION"),
  `same shape "${topology.get("BALANCED")}", different reading`
);

// The vocabulary has to cover all five without growing. If a state needed a
// sixth node kind or a sixth edge kind, the foundation would be incomplete.
const kinds = new Set<string>();
const edgeKinds = new Set<string>();
for (const g of graphs.values()) {
  for (const n of g.nodes) kinds.add(n.kind);
  for (const e of g.edges) edgeKinds.add(e.kind);
}
check(
  "All five are told with the one vocabulary, unextended",
  kinds.size <= 5 && edgeKinds.size <= 5,
  `${[...kinds].sort().join("/")} · ${[...edgeKinds].sort().join("/")}`
);

// The whole point of the restraint: none of the five turns into a wall.
for (const [name, g] of graphs) {
  check(`${name} rests at a readable number of objects`, g.nodes.length >= 3 && g.nodes.length <= 10, `${g.nodes.length} nodes`);
}

// And no state ever gets there by letting an unaccepted claim push a date.
check(
  "No state moves the forecast with something nobody accepted",
  [...graphs.values()].every((g) => g.edges.every((e) => e.kind !== "candidate" || e.causal === false))
);

console.log(failures === 0 ? "\nALL FIVE STATES PROVEN" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
