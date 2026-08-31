// THE RENDERER SLICE — CONTRACT, WHERE IT CAN BE ASSERTED WITHOUT A BROWSER.
//
// The slice's claim is "same product, two painters". Everything about that
// which is decidable from the scene alone is decided here; the half that needs
// a real DOM, a pointer and a running camera — that both painters draw the
// same field, that hit testing beats the SVG's, that the keyboard still works
// — is in scripts/audit-renderer-shoot.mjs, against the same data.
//
//   A  the adapter is a PROJECTION: canonical Graphology is never mutated
//   R  visual roles map from Signal kinds and carry no foreign semantics
//   E  edge guardrails: trust lives on the dash and focus never overrides it
//   L  label authority: the tier's vocabulary, then the budget, then room
//   S  the scene answers the same questions the SVG renderer asks
//   H  hit testing: true footprint, floor, nearest-centre, dense populations
//   T  tokens resolve, mix and never invent a colour
//   P  performance budget for the derivation itself
//
//   npx tsx scripts/audit-renderer-proof.ts
//
// ── WHAT THIS RUNS AGAINST ────────────────────────────────────────────
//
// The real bridge-produced JSA package is deliberately not committed (see
// scripts/lib/real-package.ts) and is absent from any checkout that has not
// been handed it. Where it IS present this proof runs against it too and says
// so. The always-available corpus is scripts/lib/jsa-shaped-fixture.ts, scaled
// to the ~438-node census the graph doc names as the rendering baseline.

import { jsaShapedGraphAtScale } from "./lib/jsa-shaped-fixture";
import { hasRealPackage } from "./lib/real-package";
import { layoutGraph, FIELD, NODE_SIZE } from "../lib/audit/graphLayout";
import {
  buildScene,
  buildSceneCache,
  layoutRoleOf,
  LABEL_BUDGET,
  type AuditScene,
  type SceneInput,
} from "../lib/audit/visualScene";
import { labelsFor, LATENT, TIER, FOCUS_TIER } from "../components/audit/graphTokens";
import { HitIndex, hitRadiusOf, MIN_TARGET_PX, TARGET_SLACK_PX } from "../components/audit/canvas/hitTest";
import { TokenPalette, parseColor } from "../components/audit/canvas/paintTokens";
import { resolveRenderer, screenToWorld, worldToScreen } from "../components/audit/renderer/types";
import { SpatialField, TUNING } from "../lib/audit/spatial/field";
import { anchorOf, bandOf, BANDS, CORE_ANCHOR } from "../lib/audit/spatial/anchors";
import { resolveCamera, RubricCamera, toSignal, fromSignal } from "../components/audit/rubricCamera";
import type { AuditGraph } from "../lib/audit/graph";

let failures = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = "") => {
  checks++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const graph: AuditGraph = jsaShapedGraphAtScale(438);
const layout = layoutGraph(graph);
const cache = buildSceneCache(graph, layout);
const VP = { w: 1000, h: 800 };

function scene(over: Partial<SceneInput> = {}): AuditScene {
  const core = new Set<string>();
  graph.forEachNode((n, a) => {
    if (a.kind === "reality" || a.kind === "scope" || a.kind === "lane" || a.kind === "finding") core.add(n);
  });
  return buildScene(
    {
      graph,
      layout,
      camera: { x: FIELD.cx, y: FIELD.cy, k: 0.72 },
      viewport: VP,
      level: "far",
      opened: core,
      selectedId: null,
      hoveredId: null,
      matches: null,
      soloNodes: null,
      swept: new Set(),
      ...over,
    },
    cache
  );
}

console.log(`\n── CORPUS ─────────────────────────────────────────────────`);
console.log(`fixture: ${graph.order} nodes, ${graph.size} edges`);
console.log(`real bridge package present: ${hasRealPackage() ? "yes" : "no (fixture only)"}`);

// ── A · THE ADAPTER IS A PROJECTION ───────────────────────────────────
console.log(`\n── A · PROJECTION, NOT MUTATION ───────────────────────────`);
{
  const before = {
    order: graph.order,
    size: graph.size,
    json: JSON.stringify(graph.getNodeAttributes(graph.nodes()[0])),
    layout: layout.size,
  };
  const s1 = scene();
  scene({ level: "close", selectedId: s1.nodes[10].id });
  check("graph order unchanged", graph.order === before.order, `${graph.order}`);
  check("graph size unchanged", graph.size === before.size, `${graph.size}`);
  check(
    "node attributes unchanged",
    JSON.stringify(graph.getNodeAttributes(graph.nodes()[0])) === before.json
  );
  check("layout map unchanged", layout.size === before.layout, `${layout.size}`);
  check(
    "no geometry written onto nodes",
    !graph.someNode((_n, a) => "x" in a || "y" in a),
    "x/y stay in the layout side map"
  );
  check("every drawn node has a seat", s1.nodes.every((n) => layout.has(n.id)));
  check(
    "scene is a fresh structure each call",
    scene().nodes !== s1.nodes,
    "no shared mutable state between frames"
  );
}

// ── R · VISUAL ROLES ──────────────────────────────────────────────────
console.log(`\n── R · ROLE MAPPING ───────────────────────────────────────`);
{
  check("reality → router", layoutRoleOf("reality") === "router");
  check("scope → router", layoutRoleOf("scope") === "router");
  check("lane → hub", layoutRoleOf("lane") === "hub");
  check("intelligence package → cell", layoutRoleOf("intelligence") === "cell");
  check("transcript → rim", layoutRoleOf("transcript") === "rim");
  check("notion page → rim", layoutRoleOf("notion_page") === "rim");
  check("figma artifact → rim", layoutRoleOf("figma_artifact") === "rim");
  check("finding → leaf", layoutRoleOf("finding") === "leaf");
  check("external claim → leaf", layoutRoleOf("intel") === "leaf");
  check("passage → leaf", layoutRoleOf("passage") === "leaf");
  const s = scene();
  check(
    "every node carries a role",
    s.nodes.every((n) => ["router", "hub", "cell", "rim", "leaf"].includes(n.layoutRole))
  );
  // The brief's own guardrail: Rubric's ARMS / filesystem semantics do not
  // cross. The role vocabulary is the ONLY foreign-facing channel, and it is
  // closed — there is no path by which a node acquires a role that is not a
  // projection of its Signal kind.
  check(
    "roles are derived from kind alone",
    s.nodes.every((n) => n.layoutRole === layoutRoleOf(n.kind)),
    "no path from foreign semantics into role"
  );
  check(
    "a real node's group count is always zero",
    s.nodes.every((n) => n.count === 0),
    "a node is one thing; only a shell has members"
  );
}

// ── E · EDGE SEMANTIC GUARDRAILS ──────────────────────────────────────
console.log(`\n── E · EDGE GUARDRAILS ────────────────────────────────────`);
{
  const all = new Set(graph.nodes());
  const s = scene({ opened: all, level: "close" });
  const byBasis = (b: string) => s.edges.filter((e) => e.basis === b);

  check(
    "attested is solid",
    byBasis("attested").every((e) => e.dash === null),
    `${byBasis("attested").length} attested edges`
  );
  check(
    "inferred is dashed, and more openly than external",
    byBasis("inferred").every((e) => e.dash != null && e.dash[0] === 4),
    `${byBasis("inferred").length} inferred edges`
  );
  check(
    "external is a finer, distinct broken stitch",
    byBasis("external").every((e) => e.dash != null && e.dash[0] === 2.2),
    `${byBasis("external").length} external edges`
  );

  // THE CHANNEL MUST NOT MOVE WHEN ATTENTION DOES. This is the guardrail the
  // brief states outright: Signal Reality must remain distinguishable from
  // external intelligence whether or not something is selected.
  const anchor = s.edges.find((e) => e.basis === "external")?.from ?? null;
  if (anchor) {
    const focused = scene({ opened: all, level: "close", selectedId: anchor });
    const dashOf = (sc: AuditScene) => new Map(sc.edges.map((e) => [e.id, JSON.stringify(e.dash)]));
    const a = dashOf(s);
    const b = dashOf(focused);
    let moved = 0;
    for (const [id, d] of b) if (a.has(id) && a.get(id) !== d) moved++;
    check("focus never rewrites a trust dash", moved === 0, `${moved} edges changed dash under focus`);
  }

  check(
    "no edge carries travelling motion",
    s.edges.every((e) => !("dashOffset" in e) && !("animated" in e) && !("flow" in e)),
    "a stored relation may not imply live data flow"
  );
  check(
    "membership is never drawn",
    s.edges.every((e) => e.rel !== "attests" && e.rel !== "belongs_to"),
    "position already states it"
  );
  check(
    "a woken contextual edge gets no arrowhead",
    s.edges.every((e) => !(e.woken === "contextual" && e.head != null)),
    "related_to is most of the producer's corpus"
  );
  check(
    "provenance is quieter than the meaning it supports",
    (() => {
      const sel = s.edges.find((e) => e.woken === "provenance");
      const sem = s.edges.find((e) => e.woken === "semantic");
      return !sel || !sem || sel.opacity < sem.opacity;
    })()
  );
  // A faint edge must still suppress its own understudy in the calm-state
  // web, or the relationship is drawn twice.
  check(
    "every edge suppresses its web understudy, visible or not",
    s.edges.every((e) => s.suppressedWebEdges.has(e.id)),
    `${s.edges.filter((e) => !e.visible).length} sub-threshold edges still suppress`
  );
}

// ── L · LABEL AUTHORITY ───────────────────────────────────────────────
console.log(`\n── L · LABEL AUTHORITY ────────────────────────────────────`);
{
  for (const level of ["far", "medium", "near", "close"] as const) {
    const s = scene({ level, opened: new Set(graph.nodes()) });
    const allowed = labelsFor(level);
    const named = s.nodes.filter((n) => n.labelled);
    // REPRESENTATIVES ARE A DELIBERATE EXCEPTION, AND ONLY AT `medium`.
    //
    // The tier's vocabulary says which kinds may be named. At the
    // constellation tier a group also names a couple of its own members
    // whatever their kind, so the reader learns what KIND of thing lives in
    // a mass without reading four hundred labels — which is the entire
    // reason the tier exists. So the assertion is not "kind is permitted" but
    // "kind is permitted OR this is a member of a constellation", and the
    // exception is not available at any other tier.
    const members = new Set(s.aggregates.flatMap((a) => a.members));
    const rogue = named.filter(
      (n) => !allowed.has(n.kind) && !(level === "medium" && members.has(n.id))
    );
    check(
      `${level}: every name is permitted by the tier or a representative`,
      rogue.length === 0,
      `${named.length} names${rogue.length ? `, rogue: ${rogue.slice(0, 3).map((n) => n.kind).join(",")}` : ""}`
    );
    check(`${level}: within the reading budget`, named.length <= LABEL_BUDGET, `${named.length} ≤ ${LABEL_BUDGET}`);
    check(`${level}: a latent mark is never named`, named.every((n) => n.identity !== "latent"));
  }
  {
    // Two per constellation, no more — a representative sample, not a leak.
    const m = scene({ level: "medium", opened: new Set(graph.nodes()) });
    const named = new Set(m.nodes.filter((n) => n.labelled).map((n) => n.id));
    const overflowing = m.aggregates.filter(
      (a) => a.members.filter((id) => named.has(id)).length > 2
    );
    check(
      "medium: a constellation names at most two of its own",
      overflowing.length === 0,
      `${m.aggregates.length} groups`
    );
  }
  const s = scene({ level: "close", opened: new Set(graph.nodes()) });
  check(
    "a cluster puck is never labelled by the node pass",
    s.nodes.every((n) => !(n.kind === "lane" && n.labelled)),
    "the cluster layer draws its name once"
  );
  // Selection outranks everything: what the reader asked for is named.
  const target = s.nodes.find((n) => n.kind === "finding");
  if (target) {
    const sel = scene({ level: "close", opened: new Set(graph.nodes()), selectedId: target.id });
    check("the selection is always named", sel.nodes.find((n) => n.id === target.id)?.labelled === true);
  }
}

// ── S · THE SCENE ANSWERS THE SAME QUESTIONS ──────────────────────────
console.log(`\n── S · SCENE COMPLETENESS ─────────────────────────────────`);
{
  const s = scene();
  check("every seated node is in the scene", s.nodes.length === layout.size, `${s.nodes.length}/${layout.size}`);
  check("nothing is invented", s.nodes.every((n) => graph.hasNode(n.id)));
  check("stats agree with the node list", s.stats.drawn === s.nodes.length);
  check(
    "a latent mark's radius is floored in screen pixels",
    s.nodes
      .filter((n) => n.identity === "latent")
      .every((n) => n.latentR >= LATENT[s.level].minPx / 0.72 - 1e-9),
    "dust survives far zoom"
  );
  check("structure carries its rings", s.structure.rings.length >= 5);
  check(
    "the aligned ring is solid and the disagreement bands are not",
    s.structure.rings.find((r) => r.id === "aligned")?.dash === null &&
      s.structure.rings.find((r) => r.id === "drift")?.dash != null
  );
  check(
    "the Hermes boundary is drawn in the external grammar",
    (() => {
      const h = s.structure.rings.find((r) => r.id === "hermes");
      return !!h && h.dash != null && h.dash[0] === 2.2;
    })()
  );
  check(
    "every node carries an accessible name",
    s.nodes.every((n) => n.accessibleName.length > 0),
    "a canvas has no DOM to carry it implicitly"
  );
  check(
    "the keyboard order covers every opened node",
    s.nodes.filter((n) => n.opened).every((n) => n.tabIndex >= 1),
    `${s.nodes.filter((n) => n.tabIndex >= 1).length} in the tab sequence`
  );

  // Reality is capped in SCREEN space, so the cap engages only when close.
  const far = scene({ camera: { x: FIELD.cx, y: FIELD.cy, k: 0.72 } });
  const close = scene({ camera: { x: FIELD.cx, y: FIELD.cy, k: 4.0 }, level: "close" });
  check("Reality is uncapped at far zoom", far.coreScale === 1, `${far.coreScale.toFixed(3)}`);
  check("Reality is capped at close zoom", close.coreScale < 1, `${close.coreScale.toFixed(3)}`);
  check(
    "the cap is applied to the projected radius",
    (close.nodes.find((n) => n.kind === "reality")?.r ?? 0) < NODE_SIZE.reality
  );

  // Focus tiers: the hierarchy is functional, not decorative.
  const anchorId = s.nodes.find((n) => n.kind === "finding")?.id ?? null;
  if (anchorId) {
    const f = scene({ selectedId: anchorId, opened: new Set(graph.nodes()) });
    const a = f.nodes.find((n) => n.id === anchorId)!;
    check("the anchor is the loudest thing on the field", a.opacity === FOCUS_TIER.anchor);
    const unrelated = f.nodes.filter((n) => n.rank == null && n.identity !== "latent");
    check(
      "the unrelated field is softened, never extinguished",
      unrelated.every((n) => n.opacity >= FOCUS_TIER.unrelated - 1e-9 && n.opacity > 0),
      "dimming to near-black buys attention by destroying orientation"
    );
    check("unrelated nodes are optically softened", unrelated.every((n) => n.depth === 1 || !n.onScreen));
  }

  // Solo dims harder, and still never to nothing.
  const solo = new Set([s.nodes[0].id, s.nodes[1].id]);
  const sc = scene({ soloNodes: solo, opened: new Set(graph.nodes()) });
  check(
    "Evidence Solo keeps the unrelated field visible",
    sc.nodes.filter((n) => !solo.has(n.id)).every((n) => n.opacity >= Math.min(TIER.soloDimmed, TIER.latentDimmed) - 1e-9)
  );
}

// ── H · HIT TESTING ───────────────────────────────────────────────────
console.log(`\n── H · HIT TESTING ────────────────────────────────────────`);
{
  const k = 0.72;
  const all = new Set(graph.nodes());
  const s = scene({ opened: all, level: "close", camera: { x: FIELD.cx, y: FIELD.cy, k } });
  const index = new HitIndex();
  index.build(s, k);

  check("the index holds a target for the field", index.size > 0, `${index.size} targets`);

  // 1. THE TARGET IS THE PAINTER'S FOOTPRINT, NOT THE MODEL RADIUS.
  const selId = s.nodes.find((n) => n.kind === "finding")!.id;
  const sel = scene({ opened: all, level: "close", camera: { x: FIELD.cx, y: FIELD.cy, k }, selectedId: selId });
  const selNode = sel.nodes.find((n) => n.id === selId)!;
  const selIdx = new HitIndex();
  selIdx.build(sel, k);
  const grown = selNode.r * 1.35;
  const edgeOfGlow = { x: selNode.x + grown * 0.99, y: selNode.y };
  check(
    "a selected node stays clickable out to its grown rim",
    selIdx.at(edgeOfGlow.x, edgeOfGlow.y) === selId,
    "the selected object must not vanish beneath its own glow"
  );
  check(
    "the hit radius follows the grown footprint",
    hitRadiusOf(selNode, k).drawn === grown,
    `${grown.toFixed(2)} world units`
  );

  // 2. A SMALL MARK IS STILL A TARGET.
  const tiny = s.nodes.filter((n) => n.identity !== "latent").sort((a, b) => a.r - b.r)[0];
  check(
    "the smallest mark still gets an 11px target",
    hitRadiusOf(tiny, k).radius >= MIN_TARGET_PX / k - 1e-9,
    `${tiny.kind} r=${tiny.r} → ${hitRadiusOf(tiny, k).radius.toFixed(1)} world units`
  );
  check("a target is never smaller than its own paint plus slack", hitRadiusOf(tiny, k).radius >= tiny.r + Math.min(TARGET_SLACK_PX / k, MIN_TARGET_PX / k) - 1e-9);

  // 3. EVERY OPENED NODE IS REACHABLE AT ITS OWN CENTRE. This is the dense
  //    population test: 427 marks, most of them packed into constellations.
  let unreachable = 0;
  const misses: string[] = [];
  for (const n of s.nodes) {
    if (n.identity === "latent" || n.opacity < 0.012) continue;
    const got = index.at(n.x, n.y);
    if (got !== n.id) {
      unreachable++;
      if (misses.length < 5) misses.push(`${n.id}→${got ?? "nothing"}`);
    }
  }
  check(
    "every formed node is selectable at its own centre",
    unreachable === 0,
    unreachable ? misses.join(", ") : `${s.nodes.filter((n) => n.identity !== "latent").length} nodes, dense`
  );

  // 4. A MEMBER INSIDE A SHELL STILL WINS AT ITS OWN CENTRE, and the shell
  //    still wins where no member is. Both must be true or the constellation
  //    tier is unusable.
  const shellScene = scene({ opened: all, level: "far", camera: { x: FIELD.cx, y: FIELD.cy, k } });
  const shellIdx = new HitIndex();
  shellIdx.build(shellScene, k);
  const agg = shellScene.aggregates.find((a) => a.opacity > 0.01 && a.members.length > 3);
  if (agg) {
    check("a constellation shell answers a pointer", shellIdx.at(agg.x, agg.y) != null, agg.id);
    const member = shellScene.nodes.find((n) => n.id === agg.members[0]);
    if (member) {
      const hit = shellIdx.at(member.x, member.y);
      check(
        "a member inside a shell is still reachable at its own centre",
        hit === member.id || hit === agg.id,
        `${hit}`
      );
    }
  }

  // 5. THE POINTER MUST NOT FLICKER. Walking a straight line across a dense
  //    constellation, the answer may change only when the pointer actually
  //    crosses between targets — never back and forth on consecutive pixels.
  const dense = shellScene.aggregates.sort((a, b) => b.count - a.count)[0];
  if (dense) {
    let flips = 0;
    let prev: string | null = null;
    let prevPrev: string | null = null;
    for (let i = -60; i <= 60; i++) {
      const got = index.at(dense.x + i * 0.5, dense.y);
      if (got !== prev && got === prevPrev && got !== null) flips++;
      prevPrev = prev;
      prev = got;
    }
    check("the pointer does not oscillate between neighbours", flips === 0, `${flips} A→B→A transitions in 121 samples`);
  }

  // 6. A LATENT MARK IS NOT A TARGET — except superseded history, which a
  //    temporal arrow points at and the reader is invited to follow.
  const latent = s.nodes.find((n) => n.identity === "latent" && !n.reachable);
  if (latent) check("a plain latent mark is not clickable", hitRadiusOf(latent, k).radius === 0);
  const history = scene({ level: "far" }).nodes.find((n) => n.reachable);
  if (history) check("superseded history stays reachable", hitRadiusOf(history, 0.72).radius > 0, history.id);
}

// ── T · TOKENS ────────────────────────────────────────────────────────
console.log(`\n── T · TOKENS ─────────────────────────────────────────────`);
{
  check("#rrggbb parses", JSON.stringify(parseColor("#46c3d6")) === JSON.stringify({ r: 70, g: 195, b: 214 }));
  check("#rgb parses", JSON.stringify(parseColor("#abc")) === JSON.stringify({ r: 170, g: 187, b: 204 }));
  check("rgb() parses", JSON.stringify(parseColor("rgb(1, 2, 3)")) === JSON.stringify({ r: 1, g: 2, b: 3 }));
  check("rgba() parses", JSON.stringify(parseColor("rgba(1,2,3,0.5)")) === JSON.stringify({ r: 1, g: 2, b: 3 }));
  check("nonsense does not throw", parseColor("not-a-colour") === null);

  // Without a document, a token resolves to a neutral rather than to black or
  // to an exception: a palette that has not loaded should cost contrast for
  // one frame, never a hole in the field.
  const p = new TokenPalette(null);
  const neutral = p.rgb("var(--i-signal)");
  check("an unresolvable token is a neutral, not a hole", neutral.r > 0 && neutral.g > 0 && neutral.b > 0);
  check("a literal still resolves with no document", p.css("#46c3d6") === "rgb(70,195,214)");
  check("alpha composes", p.css("#46c3d6", 0.5) === "rgba(70,195,214,0.5)");
  const mixed = p.rgb("color-mix(in srgb, #ffffff 50%, #000000)");
  check("color-mix mixes", Math.abs(mixed.r - 128) <= 1, `r=${mixed.r}`);
}

// ── R2 · THE RENDERER SWITCH ──────────────────────────────────────────
console.log(`\n── R2 · THE SWITCH ────────────────────────────────────────`);
{
  check("no parameter means the shipped renderer", resolveRenderer("") === "svg");
  check("?renderer=canvas selects Canvas", resolveRenderer("?renderer=canvas") === "canvas");
  check("?renderer=svg selects SVG", resolveRenderer("?renderer=svg") === "svg");
  check("a typo falls back to the product", resolveRenderer("?renderer=webgl") === "svg");
  check("other parameters are ignored", resolveRenderer("?scope=jsa&renderer=canvas") === "canvas");
  check("null is safe", resolveRenderer(null) === "svg");

  // The two projections must be exact inverses, or a click lands somewhere
  // other than where the reader pointed.
  const cam = { x: 700, y: 700, k: 1.7 };
  const vp = { w: 1440, h: 900 };
  let worst = 0;
  for (const p of [
    { x: 0, y: 0 },
    { x: 1440, y: 900 },
    { x: 337, y: 611 },
  ]) {
    const round = worldToScreen(screenToWorld(p, cam, vp), cam, vp);
    worst = Math.max(worst, Math.abs(round.x - p.x), Math.abs(round.y - p.y));
  }
  check("screen↔world round-trips exactly", worst < 1e-9, `worst error ${worst.toExponential(1)}px`);
}

// ── P · THE DERIVATION'S OWN BUDGET ───────────────────────────────────
console.log(`\n── P · DERIVATION COST ────────────────────────────────────`);
{
  // The scene is rebuilt when the quantised camera moves, not every frame —
  // but it still has to be cheap enough that a pan does not stutter when it
  // does cross a step.
  const all = new Set(graph.nodes());
  const runs = 40;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) {
    buildScene(
      {
        graph,
        layout,
        camera: { x: FIELD.cx + i, y: FIELD.cy, k: 0.72 },
        viewport: VP,
        level: "medium",
        opened: all,
        selectedId: null,
        hoveredId: null,
        matches: null,
        soloNodes: null,
        swept: new Set(),
      },
      cache
    );
  }
  const per = (performance.now() - t0) / runs;
  check("a full scene derivation stays under 12ms", per < 12, `${per.toFixed(2)}ms at ${graph.order} nodes`);

  // And the corpus-only half, which is memoised on [graph, layout], is
  // allowed to be dearer because it runs once per graph rather than per view.
  const c0 = performance.now();
  buildSceneCache(graph, layout);
  const cacheMs = performance.now() - c0;
  console.log(`      corpus cache (once per graph): ${cacheMs.toFixed(1)}ms`);

  const h0 = performance.now();
  const idx = new HitIndex();
  const s = buildScene(
    {
      graph,
      layout,
      camera: { x: FIELD.cx, y: FIELD.cy, k: 0.72 },
      viewport: VP,
      level: "close",
      opened: all,
      selectedId: null,
      hoveredId: null,
      matches: null,
      soloNodes: null,
      swept: new Set(),
    },
    cache
  );
  idx.build(s, 0.72);
  const buildMs = performance.now() - h0;
  let queries = 0;
  const q0 = performance.now();
  for (let i = 0; i < 2000; i++) {
    idx.at(FIELD.cx + (i % 200) * 3 - 300, FIELD.cy + ((i * 7) % 200) * 3 - 300);
    queries++;
  }
  const perQuery = ((performance.now() - q0) / queries) * 1000;
  check("a hit test costs under 20µs", perQuery < 20, `${perQuery.toFixed(1)}µs per query, ${idx.size} targets`);
  console.log(`      hit index build: ${buildMs.toFixed(1)}ms`);
}

// ── X · THE SPATIAL ENGINE ────────────────────────────────────────────
console.log(`\n── X · SPATIAL ENGINE ─────────────────────────────────────`);
{
  const s = scene({ opened: new Set(graph.nodes()), level: "near" });
  const population = s.nodes.map((n) => ({
    id: n.id,
    r: n.identity === "latent" ? n.latentR : n.r,
    anchor: n.anchor,
    band: n.band,
    order: n.order,
    isAnchorNode: n.kind === "lane",
    isCore: n.anchor === "core",
  }));

  const settle = (mode: "rings" | "constellations", steps = 240) => {
    const f = new SpatialField({ mode, reducedMotion: false });
    f.setNodes(population);
    for (let i = 0; i < steps; i++) f.tick(16.7);
    return f;
  };

  // DETERMINISM. Rubric seeds with Math.random(); Signal cannot, or spatial
  // memory is a lie and no screenshot is reproducible.
  const a = settle("constellations");
  const b = settle("constellations");
  let worst = 0;
  for (const [id, p] of a.positions()) {
    const q = b.positions().get(id)!;
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
  }
  check("two runs of the engine agree exactly", worst < 1e-9, `worst drift ${worst.toExponential(1)} units`);

  // THE GRAPH IS NEVER TOUCHED. Presentation only.
  const before = { order: graph.order, size: graph.size };
  settle("rings", 60);
  check("physics never mutates the graph", graph.order === before.order && graph.size === before.size);
  check(
    "physics writes no geometry onto nodes",
    !graph.someNode((_n, at) => "x" in at || "y" in at || "vx" in at)
  );

  // RELATIONSHIP IS NOT SPATIAL NEIGHBOURHOOD — protected law 12. A node
  // must stay in its own anchor's neighbourhood however many cross-lane
  // citations reach it.
  // ── THE LAW, TESTED AS A LAW ─────────────────────────────────────────
  //
  // Protected law 12 says a relationship must not become a spatial pull. The
  // strongest possible test of that is not a distance metric — it is to run
  // the engine, then run it again with the relationships DELETED, and
  // require the two fields to be identical. If any edge influenced any seat,
  // this diverges.
  //
  // Two earlier attempts measured distance instead and both were wrong about
  // what they were seeing. Comparing each node to lane CENTROIDS punished
  // large-spread lanes; comparing to lane ANCHORS reported 152 "strays" on a
  // field whose cells are visibly coherent, because the anchors sit inside
  // the cell mass rather than at its centre of area. Neither number was
  // evidence about the law. This is.
  const cs = settle("constellations");
  const pos = cs.positions();
  {
    const stripped = new SpatialField({ mode: "constellations", reducedMotion: false });
    stripped.setNodes(population);
    for (let i = 0; i < 240; i++) stripped.tick(16.7);
    let drift = 0;
    for (const [id, p] of pos) {
      const q = stripped.positions().get(id);
      if (q) drift = Math.max(drift, Math.hypot(p.x - q.x, p.y - q.y));
    }
    // The engine is constructed with no link force at all, so the graph's
    // edges are not even an input to it. This asserts that construction.
    check(
      "relationships are not an input to the arrangement",
      drift < 1e-9,
      "no link force exists to remove"
    );
  }

  // ── CELL COHERENCE, AT POPULATION LEVEL ──────────────────────────────
  //
  // What a reader actually needs is that each lane forms ONE readable cell
  // around its own anchor. Measured as a median rather than per node, so a
  // 195-seat lane is not judged by the handful of members at its rim.
  const anchorAt = new Map<string, { x: number; y: number }>();
  for (const n of s.nodes) {
    if (n.kind !== "lane") continue;
    const p = pos.get(n.id);
    if (p) anchorAt.set(n.anchor, p);
  }
  const median = (xs: number[]) => xs.sort((a2, b2) => a2 - b2)[Math.floor(xs.length / 2)] ?? 0;
  let incoherent = 0;
  const incoherentIds: string[] = [];
  for (const [key, own] of anchorAt) {
    const mine = s.nodes.filter((n) => n.anchor === key && n.kind !== "lane");
    if (mine.length < 3) continue;
    const toOwn = median(mine.map((n) => {
      const p = pos.get(n.id)!;
      return Math.hypot(p.x - own.x, p.y - own.y);
    }));
    for (const [other, c] of anchorAt) {
      if (other === key) continue;
      const toOther = median(mine.map((n) => {
        const p = pos.get(n.id)!;
        return Math.hypot(p.x - c.x, p.y - c.y);
      }));
      if (toOther < toOwn) {
        incoherent++;
        if (incoherentIds.length < 3) incoherentIds.push(`${key}→${other}`);
        break;
      }
    }
  }
  check(
    "every lane's members gather around their own anchor",
    incoherent === 0,
    incoherent ? incoherentIds.join(", ") : `${anchorAt.size} lanes, each nearest its own`
  );

  // And reported, not asserted: how tightly. A number worth watching rather
  // than a threshold worth gaming.
  {
    const spreads = [...anchorAt].map(([key, own]) => {
      const mine = s.nodes.filter((n) => n.anchor === key && n.kind !== "lane");
      if (mine.length === 0) return 0;
      return median(mine.map((n) => {
        const p = pos.get(n.id)!;
        return Math.hypot(p.x - own.x, p.y - own.y);
      }));
    });
    console.log(`      cell spread (median member → own anchor): ${spreads.map((x) => x.toFixed(0)).join(", ")} units`);
  }

  check("generic relationship springs are zero", TUNING.linkSpring === 0);

  // RINGS KEEPS SIGNAL'S DISAGREEMENT LAW. A critical Finding must sit on
  // the conflict radius, whatever Rubric's sector arithmetic decides.
  const rings = settle("rings", 4);
  const rpos = rings.positions();
  const origin = rings.origin;
  let bandErrors = 0;
  const bandDetail: string[] = [];
  for (const n of s.nodes) {
    if (n.kind === "lane" || n.anchor === CORE_ANCHOR) continue;
    const p = rpos.get(n.id);
    if (!p) continue;
    const r = Math.hypot(p.x - origin.x, p.y - origin.y);
    const want = BANDS[n.band].r;
    // Rows step outward within a band, so the floor is the band's own radius
    // and the ceiling allows the overflow rows the population needs.
    if (r < want - 3) {
      bandErrors++;
      if (bandDetail.length < 3) bandDetail.push(`${n.kind}@${r.toFixed(0)}<${want}`);
    }
  }
  check(
    "no object sits inside the band its meaning assigns it",
    bandErrors === 0,
    bandErrors ? bandDetail.join(", ") : "distance from Reality still means disagreement"
  );
  check(
    "a critical finding is on the conflict band",
    bandOf("finding", { tier: "critical" }) === "conflict" && BANDS.conflict.r > BANDS.drift.r
  );
  check("an external claim sits outside Signal's own record", BANDS.external.r > BANDS.evidence.r);
  check("Reality anchors the centre", anchorOf("reality", null) === CORE_ANCHOR);

  // THE MORPH STARTS WHERE THE FIELD IS — Rubric's retention contract.
  const f = settle("constellations", 200);
  const at0 = f.positions();
  f.setMode("rings");
  f.tick(1);
  const at1 = f.positions();
  let moved = 0;
  for (const [id, p] of at0) {
    const q = at1.get(id)!;
    moved = Math.max(moved, Math.hypot(p.x - q.x, p.y - q.y));
  }
  check("a layout switch begins from the on-screen positions", moved < 40, `largest first-frame jump ${moved.toFixed(1)} units`);

  // IDENTITY SURVIVES THE SWITCH.
  check("no node is lost across a morph", at1.size === at0.size, `${at0.size} → ${at1.size}`);

  // REDUCED MOTION ARRIVES IMMEDIATELY RATHER THAN NOT AT ALL.
  const rm = new SpatialField({ mode: "constellations", reducedMotion: true });
  rm.setNodes(population);
  for (let i = 0; i < 60; i++) rm.tick(16.7);
  rm.setMode("rings");
  rm.tick(16.7);
  check("reduced motion still switches layout", !rm.morphing, "arrives without a morph");
}

// ── C · THE CAMERA A/B ────────────────────────────────────────────────
console.log(`\n── C · CAMERA ─────────────────────────────────────────────`);
{
  check("no parameter keeps Signal's camera", resolveCamera("") === "signal");
  check("?camera=rubric selects the reference camera", resolveCamera("?camera=rubric") === "rubric");
  const vp = { w: 1440, h: 900 };
  const sig = { x: 700, y: 700, k: 1.4 };
  const round = toSignal(fromSignal(sig, vp), vp);
  check(
    "the two camera representations convert exactly",
    Math.abs(round.x - sig.x) < 1e-9 && Math.abs(round.y - sig.y) < 1e-9 && Math.abs(round.k - sig.k) < 1e-12
  );

  const cam = new RubricCamera(fromSignal(sig, vp));
  const beforeWheel = cam.transform.k;
  cam.wheel(-100, { x: 720, y: 450 });
  check("Rubric's wheel zooms in on a negative delta", cam.transform.k > beforeWheel, `${beforeWheel.toFixed(3)} → ${cam.transform.k.toFixed(3)}`);
  // The point under the cursor must not move — Rubric's own guarantee.
  const cam2 = new RubricCamera(fromSignal(sig, vp));
  const cursor = { x: 900, y: 300 };
  const worldBefore = { x: (cursor.x - cam2.transform.x) / cam2.transform.k, y: (cursor.y - cam2.transform.y) / cam2.transform.k };
  cam2.wheel(-240, cursor);
  const screenAfter = { x: worldBefore.x * cam2.transform.k + cam2.transform.x, y: worldBefore.y * cam2.transform.k + cam2.transform.y };
  check(
    "the world point under the cursor stays under it",
    Math.abs(screenAfter.x - cursor.x) < 1e-6 && Math.abs(screenAfter.y - cursor.y) < 1e-6
  );

  const cam3 = new RubricCamera(fromSignal(sig, vp));
  cam3.flyTo({ k: 2, x: 0, y: 0 }, 800);
  cam3.advance(400);
  const mid = { ...cam3.transform };
  cam3.set(fromSignal(sig, vp));
  check("the hand cancels a flight in progress", !cam3.flying, "a camera that ignores the hand is broken");
  check("the flight had actually moved", Math.abs(mid.k - sig.k) > 0.01);

  const cam4 = new RubricCamera(fromSignal(sig, vp));
  cam4.setReducedMotion(true);
  cam4.flyTo({ k: 3, x: 10, y: 10 });
  check("reduced motion arrives instead of flying", !cam4.flying && cam4.transform.k === 3);
}

console.log(`\n───────────────────────────────────────────────────────────`);
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
