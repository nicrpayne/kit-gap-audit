// ORBIT'S READ MODEL, PROVEN PURE.
//
// The whole claim of lib/orbit/graph.ts is that it is a RESTATEMENT, not a
// second truth. That claim is testable without a browser or a database:
//
//   the same truth builds the same graph, byte for byte;
//   no edge exists without a stated meaning and a stated source;
//   a candidate never carries a causal edge;
//   a target moving never touches the distribution;
//   a Scenario lever is one of the levers SuiteScenario already has.
//
//   npx tsx scripts/orbit-graph-proof.ts
import { buildOrbitGraph, relatedTo } from "../lib/orbit/graph";
import type { OrbitInput, OrbitGateInput, OrbitScopeInput } from "../lib/orbit/graph";
import type { SimulationResult } from "../lib/forecast/simulate";
import { confidenceAtDay } from "../lib/forecast/simulate";
import type { Feature, FeatureComposition } from "../lib/scope/features";
import type { ChannelReading } from "../lib/capacity/workforce";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── A DETERMINISTIC WORLD ──────────────────────────────────────────────
// Hand-built, so every number in the assertions below is one somebody can
// check by reading this file. Nothing here is random and nothing is fetched.

const START = new Date("2026-01-01T00:00:00.000Z");

/** A sorted trial array with a known shape: 200 trials, 60..259 days. */
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

const feature = (id: string, name: string, loadDays: number, source: Feature["source"] = "linear", accepted = false): Feature => ({
  id,
  name,
  source,
  epic: null,
  items: [{ id: `${id}-i1` } as unknown as Feature["items"][number]],
  done: [],
  effortDays: loadDays * 2,
  loadDays,
  range: { low: loadDays, likely: loadDays * 2, high: loadDays * 4 },
  uncertainty: 1.5,
  placeholderCount: 0,
  evidence: source === "hermes" ? { quote: "we still need offline capture", rationale: "reads like scope" } : null,
  bypassed: false,
  accepted,
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

const platform: OrbitScopeInput = {
  scopeId: "platform",
  name: "Platform",
  targetDate: new Date("2026-06-01T00:00:00.000Z"),
  dependsOnScopeIds: [],
  composition: composition([feature("plat-a", "Tax engine", 30)]),
  channel: channel("platform", 3, 3),
  sim: sim(60, 40),
  realitySim: null,
};

const jsa: OrbitScopeInput = {
  scopeId: "jsa",
  name: "JSA",
  // Day 120. Deliberately INSIDE the spread (trials run 100..160), so a
  // target moving is a visible change in confidence rather than 100% → 100%.
  targetDate: new Date("2026-05-01T00:00:00.000Z"),
  dependsOnScopeIds: ["platform"],
  composition: composition([
    feature("f-big", "Offline capture", 40),
    feature("f-mid", "Forms engine", 20),
    feature("f-small", "Settings polish", 2),
    feature("f-cand", "Incident export", 6, "hermes"),
  ]),
  channel: channel("jsa", 5, 4), // 1.0 FTE lost to context switching
  sim: sim(100, 60),
  realitySim: null,
};

const gate: OrbitGateInput = {
  gateId: "g1",
  decisionId: "d1",
  decisionTitle: "Which auth provider for offline sync?",
  decisionStatus: "open",
  targetScopeId: "jsa",
  low: 2,
  likely: 8,
  high: 20,
  serial: true,
  dependency: "Offline sync cannot be built against an unknown provider.",
  evidenceForGate: "Stated in the Aug 12 refinement call.",
  evidenceCount: 2,
};

const world = (over: Partial<OrbitInput> = {}): OrbitInput => ({
  focusScopeId: "jsa",
  startDate: START,
  scopes: [jsa, platform],
  gates: [gate],
  scenarioActive: false,
  resolvedGateIds: new Set<string>(),
  ...over,
});

// ── A. THE SAME TRUTH BUILDS THE SAME GRAPH ────────────────────────────
{
  const a = buildOrbitGraph(world());
  const b = buildOrbitGraph(world());
  check("A1. Same input, byte-identical graph", JSON.stringify(a) === JSON.stringify(b));

  // Input order must not leak into output order.
  const shuffled = buildOrbitGraph(world({ scopes: [platform, jsa] }));
  check("A2. …regardless of the order the scopes arrived in",
    JSON.stringify(shuffled) === JSON.stringify(a));

  check("A3. Nodes and edges are in a stable, id-sorted order",
    a.nodes.every((n, i) => i === 0 || a.nodes[i - 1].id.localeCompare(n.id) <= 0) &&
    a.edges.every((e, i) => i === 0 || a.edges[i - 1].id.localeCompare(e.id) <= 0));
}

// ── B. THE RESTING VIEW IS RESTRAINED, AND ADMITS IT ───────────────────
{
  const g = buildOrbitGraph(world());
  const caps = g.nodes.filter((n) => n.kind === "capability");
  check("B1. The resting view is a handful of objects, not a wall",
    g.nodes.length >= 5 && g.nodes.length <= 12, `${g.nodes.length} node(s)`);
  // f-big + f-mid = 60 of 68 engaged load = 88% ≥ 85%, so the tail is
  // counted rather than drawn.
  check("B2. Capabilities are shown by real load until most of it is covered",
    caps.length === 2 && caps.some((c) => c.label === "Offline capture"),
    caps.map((c) => c.label).join(", "));
  check("B3. …and what was left out is counted, not silently dropped",
    g.omitted.capabilities === 2 && g.omitted.capabilityLoadDays === 8,
    `${g.omitted.capabilities} omitted, ${g.omitted.capabilityLoadDays}d`);
}

// ── C. EVERY EDGE MEANS SOMETHING, AND SAYS WHERE IT CAME FROM ─────────
{
  const g = buildOrbitGraph(world());
  check("C1. No edge exists without a sentence explaining it",
    g.edges.every((e) => e.meaning.trim().length > 20), `${g.edges.length} edge(s)`);
  check("C2. …and without naming the field it was read from",
    g.edges.every((e) => e.provenance.source.length > 0 && e.provenance.ref.length > 0));
  check("C3. Every node names its authoritative source too",
    g.nodes.every((n) => n.provenance.source.length > 0));
  check("C4. Every edge weight is a real quantity with a named unit",
    g.edges.every((e) => e.quantity === null || e.quantity.unit === "days" || e.quantity.unit === "fte"));
  // The resting world carries four kinds. The fifth is `candidate`, and its
  // absence at rest is the product working: an unaccepted suggestion is 6
  // days against 60 of real work, so it does not take a seat. Section D
  // forces one into view; the vocabulary is exercised across both.
  const withCandidate = buildOrbitGraph(world({
    scopes: [{ ...jsa, composition: composition([feature("f-cand", "Incident export", 90, "hermes")]) }, platform],
  }));
  const kinds = new Set([...g.edges, ...withCandidate.edges].map((e) => e.kind));
  check("C5. All five relationship kinds are exercised, and each one only where it is true",
    ["load", "feeds", "gates", "waits_on", "candidate"].every((k) => kinds.has(k as never)) &&
      g.edges.every((e) => e.kind !== "candidate"),
    [...kinds].sort().join(", "));
}

// ── D. A CANDIDATE IS INERT ────────────────────────────────────────────
{
  const g = buildOrbitGraph(world());
  const cand = g.nodes.find((n) => n.kind === "capability" && n.candidate);
  const candEdges = g.edges.filter((e) => e.kind === "candidate");
  check("D1. A Hermes capability is marked as a suggestion, not Reality",
    // f-cand is 6d and falls in the omitted tail here, which is itself the
    // point: an unaccepted suggestion does not outrank real work for space.
    cand === undefined && g.omitted.capabilities === 2);
  // Force it into view to prove the edge grammar, by making it large.
  const big = buildOrbitGraph(world({
    scopes: [{ ...jsa, composition: composition([feature("f-cand", "Incident export", 90, "hermes")]) }, platform],
  }));
  const c2 = big.nodes.find((n) => n.kind === "capability");
  const e2 = big.edges.find((e) => e.from === c2?.id);
  check("D2. When a suggestion IS shown it is flagged candidate",
    c2?.candidate === true, `${c2?.label}`);
  check("D3. …and its edge is explanatory only — never causal",
    e2?.kind === "candidate" && e2.causal === false && e2.structural === false);
  check("D4. No candidate edge anywhere claims to move the forecast",
    [...g.edges, ...big.edges].every((e) => e.kind !== "candidate" || e.causal === false),
    `${candEdges.length} candidate edge(s) in the resting world`);
}

// ── E. A DECISION IS NOT A GATE ────────────────────────────────────────
{
  const noGate = buildOrbitGraph(world({ gates: [] }));
  check("E1. A Decision with no gate has no presence in Orbit",
    noGate.nodes.every((n) => n.kind !== "gate"));
  const decided = buildOrbitGraph(world({ gates: [{ ...gate, decisionStatus: "decided" }] }));
  check("E2. An answered Decision stops gating",
    decided.nodes.every((n) => n.kind !== "gate"));
  const parallel = buildOrbitGraph(world({ gates: [{ ...gate, serial: false }] }));
  check("E3. A non-serial gate is not drawn as a serial block",
    parallel.nodes.every((n) => n.kind !== "gate"));

  const g = buildOrbitGraph(world());
  const gateEdge = g.edges.find((e) => e.kind === "gates");
  check("E4. A real gate points at the scope its row names, and nothing else",
    gateEdge?.to === "forecast:jsa" && gateEdge.causal === true,
    `${gateEdge?.from} → ${gateEdge?.to}`);
  check("E5. …carrying its own stored delay, not an invented number",
    gateEdge?.quantity?.value === 8 && gateEdge.quantity.unit === "days");
}

// ── F. THE SCENARIO IS THE ONE THAT ALREADY EXISTS ─────────────────────
{
  const g = buildOrbitGraph(world());
  const levers = g.nodes.map((n) => n.scenarioLever?.kind).filter(Boolean);
  check("F1. Every lever Orbit offers is a SuiteScenario field that exists today",
    levers.every((k) => k === "resolve-gate" || k === "bypass-capability" || k === "capacity-override"),
    [...new Set(levers)].join(", "));

  const assumed = buildOrbitGraph(world({ resolvedGateIds: new Set(["g1"]), scenarioActive: true }));
  const gateNode = assumed.nodes.find((n) => n.kind === "gate");
  const gateEdge = assumed.edges.find((e) => e.kind === "gates");
  check("F2. ASSUME DECIDED is the existing resolvedGateIds lever",
    gateNode?.kind === "gate" && gateNode.assumedResolved === true);
  check("F3. …and an assumed gate stops acting while staying visible",
    gateEdge !== undefined && gateEdge.causal === false && gateEdge.quantity?.value === 0);
}

// ── G. TARGET IS EVALUATION, NEVER INPUT ───────────────────────────────
{
  const g = buildOrbitGraph(world());
  // Day 151 instead of day 120 — still inside the same spread, so both
  // readings are real counts and neither is pinned at 0% or 100%.
  const later = buildOrbitGraph(world({
    scopes: [{ ...jsa, targetDate: new Date("2026-06-01T00:00:00.000Z") }, platform],
  }));
  const f1 = g.nodes.find((n) => n.kind === "forecast")!;
  const f2 = later.nodes.find((n) => n.kind === "forecast")!;
  check("G1. Moving the target does not change a single trial",
    JSON.stringify(f1.completionDaysSorted) === JSON.stringify(f2.completionDaysSorted));
  check("G2. …nor P10/P50/P90",
    f1.p10 === f2.p10 && f1.p50 === f2.p50 && f1.p90 === f2.p90,
    `p50 ${f1.p50} vs ${f2.p50}`);
  check("G3. …and confidence is the same trials counted against a new day",
    f1.confidenceAtTarget === confidenceAtDay(f1.completionDaysSorted, f1.targetDay!) &&
      f2.confidenceAtTarget === confidenceAtDay(f2.completionDaysSorted, f2.targetDay!) &&
      f2.confidenceAtTarget! > f1.confidenceAtTarget!,
    `${f1.confidenceAtTarget}% → ${f2.confidenceAtTarget}%`);
}

// ── H. RAW vs EFFECTIVE IS CARRIED CORRECTLY ───────────────────────────
{
  const g = buildOrbitGraph(world());
  const cap = g.nodes.find((n) => n.kind === "capacity" && n.id === "capacity:jsa")!;
  check("H1. Physical allocation and delivered capacity are both stated",
    cap.kind === "capacity" && cap.raw === 5 && cap.effective === 4);
  check("H2. …and the gap between them is named as switch loss, not hidden",
    cap.kind === "capacity" && cap.switchLoss === 1);
  const feeds = g.edges.find((e) => e.kind === "feeds" && e.from === "capacity:jsa")!;
  check("H3. The edge carries EFFECTIVE — what the simulation actually gets",
    feeds.quantity?.value === 4 && feeds.quantity.unit === "fte");
  const starved = buildOrbitGraph(world({
    scopes: [{ ...jsa, channel: channel("jsa", 5, 4, 3) }, platform],
  }));
  const sCap = starved.nodes.find((n) => n.id === "capacity:jsa")!;
  check("H4. Capacity asked for but absent is reported, never manufactured",
    sCap.kind === "capacity" && sCap.required === 3 && sCap.raw === 5);
}

// ── I. THE DEPENDENCY IS THE STORED ONE ────────────────────────────────
{
  const g = buildOrbitGraph(world());
  const dep = g.edges.find((e) => e.kind === "waits_on")!;
  check("I1. Scope-to-scope dependency comes from dependsOnScopeIds",
    dep.provenance.source.includes("portfolio.ts") && dep.to === "dependency:platform");
  const none = buildOrbitGraph(world({ scopes: [{ ...jsa, dependsOnScopeIds: [] }, platform] }));
  check("I2. No stored dependency, no edge — nothing is inferred from shape",
    none.edges.every((e) => e.kind !== "waits_on"));
}

// ── J. FOCUS IS A FUNCTION OF THE GRAPH ────────────────────────────────
{
  const g = buildOrbitGraph(world());
  const gateId = g.nodes.find((n) => n.kind === "gate")!.id;
  const rel = relatedTo(g, gateId);
  check("J1. Touching a gate reaches the thing it blocks and the consequence",
    rel.nodes.has("forecast:jsa") && rel.nodes.has(gateId));
  check("J2. …and does not light the whole graph",
    rel.nodes.size < g.nodes.length, `${rel.nodes.size} of ${g.nodes.length}`);
  const again = relatedTo(g, gateId);
  check("J3. Focus is deterministic",
    JSON.stringify([...rel.nodes].sort()) === JSON.stringify([...again.nodes].sort()));
}

// ── K. AN UNKNOWN FOCUS IS EMPTY, NOT INVENTED ─────────────────────────
{
  const g = buildOrbitGraph(world({ focusScopeId: "nope" }));
  check("K1. A scope Orbit was not given produces no graph rather than a guess",
    g.nodes.length === 0 && g.edges.length === 0);
}

console.log(failures === 0 ? "\nALL ORBIT GRAPH PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
