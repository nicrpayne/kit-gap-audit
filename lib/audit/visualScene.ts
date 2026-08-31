// THE SIGNAL → VISUAL ADAPTER.
//
// One scene description, two painters. This module answers "what is on the
// field, and what does each thing look like right now" — and it answers it
// ONCE, for whichever renderer is mounted.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// The renderer slice introduces a second painter (Canvas) beside the SVG one
// that production ships. The obvious way to do that is to write a Canvas
// component that re-derives what to draw, and it is the wrong way: the
// derivation IS the product. Which nodes are latent, how loud a woken edge
// is, which sixty names fit, what a dashed stroke means — those are Signal
// semantics, and a second copy of them is a second product that drifts from
// the first. The brief's own rule is "no forked product behavior".
//
// So the derivation moves here, both renderers consume it, and an A/B
// between them compares PAINTERS rather than two different graphs.
//
// ── WHAT CROSSES, AND WHAT DOES NOT ────────────────────────────────────
//
// Canonical Graphology is READ, never mutated. Nothing here writes to the
// graph, and the projection is a fresh structure every call — the semantic
// layer stays free of geometry and of visual state, exactly as the layout
// already keeps positions in a side map rather than on the nodes.
//
// Coordinates are the CURRENT SIGNAL COORDINATES, untouched. This slice
// deliberately changes the painter and nothing else, so that "how much of the
// feel is the renderer" is a question the comparison can actually answer.
// There is no physics here, no retargeting, no morph.
//
// ── PURE ───────────────────────────────────────────────────────────────
//
// No React, no DOM, no canvas, no CSS. It returns numbers and token NAMES
// (`var(--i-signal)`), never resolved colours — resolving a token is a
// property of the document the painter is mounted in, so it belongs to the
// painter. That is what lets a proof assert the scene without a browser.

import type { AuditGraph, AuditNodeAttributes, NodeKind } from "./graph";
import {
  FIELD,
  CLUSTER_ORDER,
  edgePath,
  edgeLabelAnchor,
  edgeEndTangent,
  layoutAggregates,
  clusterLabelPoint,
  type GraphLayout,
  type SeatedAggregate,
} from "./graphLayout";
import {
  NODE_SHAPE,
  nodeColor,
  TIER,
  FOCUS_TIER,
  FOCUS_EDGE,
  intelColor,
  LATENT,
  latentRadius,
  identityOf,
  atLeast,
  RESOLVE_AT,
  intelIsHollow,
  KIND_LABEL,
  WEB,
  fieldLabel,
  labelsFor,
  type Depth,
  type ZoomLevel,
  type Identity,
  type NodeShape,
} from "@/components/audit/graphTokens";
import { structuralWeb, aggregateBundles, type StructuralWeb, type WebBundle } from "./structuralWeb";
import {
  semanticFocus,
  edgeFocusClass,
  edgeVerb,
  verbIsDirectional,
  type FocusClass,
  type FocusModel,
  type FocusRank,
} from "./focus";

export interface SceneCamera {
  x: number;
  y: number;
  k: number;
}

export interface SceneViewport {
  w: number;
  h: number;
}

/**
 * WHERE A THING SITS IN THE FIELD'S STRUCTURE, as a renderer-facing role.
 *
 * The brief asks for a visual role channel so that a painter can treat "the
 * thing everything hangs off" differently from "one of four hundred leaves"
 * without knowing what a Finding is. This is that channel, and it is a
 * PROJECTION of Signal's kinds — the kinds themselves are unchanged and no
 * foreign filesystem or agent semantics cross into them.
 *
 *   router   Reality and the Scope. The field routes through these.
 *   hub      a lane. A cluster's own puck.
 *   cell     a typed aggregate or a source family — a group, not an object.
 *   rim      an integration or source artifact: where knowledge came from.
 *   leaf     every object the project is actually made of.
 */
export type LayoutRole = "router" | "hub" | "cell" | "rim" | "leaf";

const ROLE_BY_KIND: Partial<Record<NodeKind, LayoutRole>> = {
  reality: "router",
  scope: "router",
  lane: "hub",
  intelligence: "cell",
  source: "rim",
  transcript: "rim",
  notion_page: "rim",
  figma_artifact: "rim",
};

export function layoutRoleOf(kind: NodeKind): LayoutRole {
  return ROLE_BY_KIND[kind] ?? "leaf";
}

/**
 * ONE NODE, AS THE PAINTER NEEDS IT.
 *
 * The first block is canonical Signal fact, carried verbatim so a painter
 * never reaches back into Graphology mid-frame. The second is this frame's
 * visual answer. Nothing here is stored; it is recomputed from the graph and
 * the reader's state every time either changes.
 */
export interface AuditVisualNode {
  // ── canonical ────────────────────────────────────────────────────────
  id: string;
  /** The humanised name — `fieldLabel`, so a passage reads as its quote and
      a source ref reads as a meeting. Never the raw accession id. */
  label: string;
  kind: NodeKind;
  /** The producer's own type for an external object, the truth state for a
      Signal one, or null. Never invented. */
  semanticSubtype: string | null;
  cluster: string | null;
  /** attested / inferred / external, for kinds that carry a basis. */
  basis: string | null;
  /** Members, for a group. Always 0 for a real node — a node is one thing. */
  count: number;
  /** Non-membership degree. How connected this actually is. */
  importance: number;
  layoutRole: LayoutRole;
  x: number;
  y: number;
  /** Drawn radius at rest, world units. */
  r: number;

  // ── this frame ───────────────────────────────────────────────────────
  shape: NodeShape;
  /** A token name, never a resolved colour. */
  color: string;
  hollow: boolean;
  identity: Identity;
  opacity: number;
  depth: Depth;
  rank: FocusRank | null;
  /** Radius of the latent mark, floored in screen pixels. */
  latentR: number;
  selected: boolean;
  hovered: boolean;
  matched: boolean;
  swept: boolean;
  labelled: boolean;
  labelInward: boolean;
  onScreen: boolean;
  /** Drawn as a mark and still a pointer target. Superseded history only. */
  reachable: boolean;
  opened: boolean;
  /** 0 means "not in the keyboard order" — a latent, unreachable mark. */
  tabIndex: number;
  /**
   * WHAT A SCREEN READER SAYS.
   *
   * Projected here rather than built in a painter, because it is the same
   * sentence whichever renderer is mounted — and because a canvas has no DOM
   * to carry it implicitly, so it has to be an explicit part of the scene or
   * it silently stops existing.
   */
  accessibleName: string;
}

/** One relationship, as the painter needs it. */
export interface AuditVisualEdge {
  id: string;
  from: string;
  to: string;
  rel: string;
  basis: string;
  cls: FocusClass;
  verb: string;
  directional: boolean;
  /** World-space path. Does not move with the camera. */
  d: string;
  anchor: ReturnType<typeof edgeLabelAnchor>;
  tangent: { x: number; y: number };
  chord: number;
  source: { x: number; y: number; r: number };
  target: { x: number; y: number; r: number };

  opacity: number;
  /** Whether this edge is loud enough to paint. A false edge is still in the
      list: it suppresses its own understudy in the calm-state web. */
  visible: boolean;
  /** The focus class that woke this edge, or null when it is at rest. */
  woken: FocusClass | null;
  /** Drawn as the provenance filament, with its luminous underlay. */
  filament: boolean;
  strokeColor: string;
  /** Stroke weight in DEVICE pixels — the painter divides by k itself. */
  weight: number;
  /** Dash lengths in device pixels, or null for a solid stroke. Trust, and
      never overridden by focus. */
  dash: [number, number] | null;
  showVerb: boolean;
  /** Draw an arrowhead at the target end, and whether it is the double
      chevron supersession uses. */
  head: { x: number; y: number; double: boolean } | null;
}

export interface AuditVisualAggregate extends SeatedAggregate {
  /** A token name for a homogeneous group, or null for a mixed one. */
  tint: string | null;
  opacity: number;
  selected: boolean;
  layoutRole: LayoutRole;
  /**
   * Whether this group prints its NAME as well as its count.
   *
   * A TYPE group is a region and carries its name. A SOURCE group is a hub
   * and does not — its artifact is a real node sitting at the middle of it
   * and labels itself from the constellation tier onward. Printing eleven
   * transcript names at project scale produced exactly the stack of
   * overlapping text this tier exists to avoid.
   */
  named: boolean;
  /** Draw the name inward, because outward is off the screen. */
  labelFlip: boolean;
}

export interface AuditVisualBundle extends WebBundle {
  opacity: number;
  /** Where the count is printed, or null when the path is not a simple Q. */
  mid: { x: number; y: number } | null;
}

/** The rings, sector gutters and band names. Fixed geometry — a property of
    the field, not of the reader — carried here so a painter never has to
    know the layout module. */
export interface SceneRing {
  id: string;
  r: number;
  /** Dash in DEVICE pixels, or null for solid. The painter divides by k. */
  dash: [number, number] | null;
  /** This ring's own opacity, inside the layer's. */
  opacity: number;
}

export interface SceneStructure {
  cx: number;
  cy: number;
  /** Every guide the field draws, each with its own material. Deliberately
      not a bare radius list: `aligned` is solid and the two disagreement
      bands past it are dashed, and the Hermes boundary is broken in the same
      grammar the external edges use. */
  rings: SceneRing[];
  bands: { id: string; label: string; r: number }[];
  sectors: { x1: number; y1: number; x2: number; y2: number }[];
  /** The layer opacity for rings and sector gutters. */
  opacity: number;
  /** The band NAMES sit in their own group at their own opacity — they are
      read, and a ring is only ever glanced at. */
  bandLabelOpacity: number;
  showBandNames: boolean;
}

export interface AuditScene {
  nodes: AuditVisualNode[];
  edges: AuditVisualEdge[];
  aggregates: AuditVisualAggregate[];
  bundles: AuditVisualBundle[];
  web: StructuralWeb;
  structure: SceneStructure;
  /** The layer opacities the tier decides. */
  webOpacity: number;
  /** Sheaf/strand opacities, already folded for focus. */
  sheafOpacity: number;
  strandOpacity: number;
  aggShellOpacity: number;
  /** Edges the web must NOT also draw: they are being drawn properly, or
      they are currently standing inside a bundle. */
  suppressedWebEdges: ReadonlySet<string>;
  /** Reality's screen-space cap, as a scale on its world radius. */
  coreScale: number;
  focus: FocusModel | null;
  level: ZoomLevel;
  /** Everything opened by disclosure OR promoted by the current selection. */
  openedNow: ReadonlySet<string>;
  /** What "+N" counts, per cluster. */
  latentByCluster: ReadonlyMap<string, number>;
  /** A cluster name is the map's legend and is never removed — but it is
      text, and text on a dimmed field keeps pulling the eye. True whenever
      the field has a subject and the legend should stop competing. */
  dimClusterLabels: boolean;
  /** Reported, not styled: what the accessible name and the harness read. */
  stats: {
    drawn: number;
    opened: number;
    latent: number;
    edges: number;
    onScreen: number;
    labelled: number;
  };
}

export interface SceneInput {
  graph: AuditGraph;
  layout: GraphLayout;
  camera: SceneCamera;
  viewport: SceneViewport;
  level: ZoomLevel;
  opened: ReadonlySet<string>;
  selectedId: string | null;
  hoveredId: string | null;
  matches: ReadonlySet<string> | null;
  soloNodes: ReadonlySet<string> | null;
  swept: ReadonlySet<string>;
}

// ── LABEL AUTHORITY ────────────────────────────────────────────────────
//
// Unchanged from the SVG renderer that shipped it, and moved here for the
// reason the whole module exists: two painters that each decided their own
// sixty names would disagree about what the field says.

export const LABEL_BUDGET = 60;
export const LABEL_ROOM = 186;

export const LABEL_PRIORITY: NodeKind[] = [
  "reality",
  "lane",
  "scope",
  "finding",
  "decision",
  "dependency",
  "decisionGate",
  "requirement",
  "person",
  "transcript",
  "notion_page",
  "figma_artifact",
  "source",
  "intelligence",
  "intel",
  "feature",
  "work",
  "passage",
  "checkpoint",
];

/** The largest Reality is allowed to be drawn, in device pixels. */
export const CORE_MAX_PX = 190;

/** Hue per focus class, for the calm-state web and the bundles. */
export const WEB_STRAND_COLOR: Record<FocusClass, string> = {
  semantic: "var(--i-signal)",
  temporal: "var(--i-text)",
  provenance: "var(--i-source)",
  contextual: "var(--i-text-faint)",
};

/** The middle of a bundle's own curve, where its count is printed. Parsed
    back out of the path rather than recomputed, so the number can never end
    up somewhere the line is not. */
export function bundleMidpoint(d: string): { x: number; y: number } | null {
  const m = d.match(/^M ([-\d.]+) ([-\d.]+) Q ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+)$/);
  if (!m) return null;
  const [ax, ay, cx, cy, bx, by] = m.slice(1).map(Number);
  return { x: (ax + 2 * cx + bx) / 4, y: (ay + 2 * cy + by) / 4 };
}

/**
 * The producer's type, the truth state, or nothing.
 *
 * DELIBERATELY NOT A GUESS. A kind that carries no subtype returns null
 * rather than a stringified fallback, because a painter that draws "unknown"
 * for "not applicable" is claiming the model said something it did not.
 */
function subtypeOf(attrs: AuditNodeAttributes): string | null {
  if (attrs.kind === "intel") {
    const t = attrs.intelligenceType;
    return typeof t === "string" && t ? t : null;
  }
  if (typeof attrs.state === "string" && attrs.state) return attrs.state;
  if (typeof attrs.stateType === "string" && attrs.stateType) return attrs.stateType;
  return null;
}

/** The sentence the SVG renderer already announces, stated once. */
function accessibleNameOf(attrs: AuditNodeAttributes): string {
  return [
    KIND_LABEL[attrs.kind] ?? attrs.kind,
    String(attrs.label ?? ""),
    attrs.tier ? `${String(attrs.tier)} severity` : null,
    attrs.state ? `state ${String(attrs.state)}` : null,
    attrs.needsHuman ? "needs human judgement" : null,
    attrs.handled ? "handled" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function basisOf(attrs: AuditNodeAttributes): string | null {
  // An intel node is external by construction; everything else states its own
  // basis on its edges rather than on itself, so this stays null rather than
  // inventing one.
  if (attrs.kind === "intel") return "external";
  const b = attrs.basis;
  return typeof b === "string" && b ? b : null;
}

/**
 * BUILD THE SCENE.
 *
 * One pass over the graph per concern, in the order the field is painted.
 * Everything expensive that depends only on the corpus — the web, the
 * aggregates, the degrees — is cheap to hand in memoised from above; this
 * function recomputes them when it is not, so it stays correct standalone
 * for the proofs.
 */
export function buildScene(input: SceneInput, cached?: SceneCache): AuditScene {
  const { graph, layout, camera, viewport, level, opened, selectedId, hoveredId, matches, soloNodes, swept } =
    input;

  const cache = cached ?? buildSceneCache(graph, layout);
  const { web, aggregates: seatedAggregates, degreeOf, hasIntel } = cache;

  const focus: FocusModel | null = semanticFocus(graph, selectedId ?? hoveredId);
  const anchorId = selectedId ?? hoveredId;

  // ── TIER LAYER OPACITIES ─────────────────────────────────────────────
  const aggShellOpacity = level === "far" ? 1 : level === "medium" ? 0.5 : 0;
  const webOpacity = level === "close" ? 0 : level === "near" ? 0.5 : 1;
  const coreScale = Math.min(1, CORE_MAX_PX / (FIELD.coreR * camera.k));

  // ── WHAT IS DRAWN ────────────────────────────────────────────────────
  const drawnNodes: string[] = [];
  for (const n of graph.nodes()) if (layout.has(n)) drawnNodes.push(n);

  const halfW = viewport.w / 2;
  const halfH = viewport.h / 2;
  const onScreen = new Set<string>();
  for (const id of drawnNodes) {
    const p = layout.get(id);
    if (!p) continue;
    if (Math.abs((p.x - camera.x) * camera.k) > halfW + 80) continue;
    if (Math.abs((p.y - camera.y) * camera.k) > halfH + 80) continue;
    onScreen.add(id);
  }

  const resolvedByZoom = atLeast(level, RESOLVE_AT);

  // ── SELECTION PROMOTES ITS OWN NEIGHBOURHOOD ─────────────────────────
  let openedNow: ReadonlySet<string> = opened;
  {
    const reveal = soloNodes ? [...soloNodes] : focus ? focus.frame : null;
    if (reveal) {
      let extra: Set<string> | null = null;
      for (const id of reveal) {
        if (opened.has(id)) continue;
        if (!extra) extra = new Set(opened);
        extra.add(id);
      }
      if (extra) openedNow = extra;
    }
  }

  // ── OPACITY, DEPTH ───────────────────────────────────────────────────
  const nodeOpacity = (id: string): number => {
    if (soloNodes) return soloNodes.has(id) ? FOCUS_TIER.anchor : TIER.soloDimmed;
    if (matches && !focus) return matches.has(id) ? FOCUS_TIER.anchor : FOCUS_TIER.unrelated;
    if (focus) {
      const rank = focus.nodes.get(id);
      if (rank) return FOCUS_TIER[rank];
      return matches?.has(id) ? FOCUS_TIER.contextual : FOCUS_TIER.unrelated;
    }
    return TIER.rest;
  };

  const nodeDepth = (id: string): Depth => {
    if (!onScreen.has(id)) return 0;
    if (soloNodes) return soloNodes.has(id) ? 0 : 1;
    if (focus) {
      const rank = focus.nodes.get(id);
      if (rank && rank !== "contextual") return 0;
      if (matches?.has(id)) return 0;
      return 1;
    }
    if (matches) return (matches.has(id) ? 0 : 1) as Depth;
    return 0;
  };

  const edgeOpacity = (edge: string, basis: string): number => {
    if (soloNodes) {
      const lit = soloNodes.has(graph.source(edge)) && soloNodes.has(graph.target(edge));
      return lit ? 0.95 : TIER.soloDimmed * 0.5;
    }
    if (focus) {
      const cls = focus.edges.get(edge);
      return cls ? FOCUS_EDGE[cls] : TIER.dimmed * 0.5;
    }
    if (matches) return TIER.dimmed * 0.6;
    if (basis === "attested") return TIER.attestedRest;
    return basis === "external" ? TIER.externalRest : TIER.inferredRest;
  };

  // ── EDGES ────────────────────────────────────────────────────────────
  const edges: AuditVisualEdge[] = [];
  graph.forEachEdge((e, a, s, t) => {
    // MEMBERSHIP IS NEVER AN EDGE.
    const cls = edgeFocusClass(a as { rel: string; relClass?: string | null });
    if (!cls) return;
    if (!openedNow.has(s) || !openedNow.has(t)) return;
    if (!layout.has(s) || !layout.has(t)) return;
    if (a.basis === "external" && (cls === "contextual" || cls === "provenance")) {
      const reached =
        (soloNodes ? soloNodes.has(s) || soloNodes.has(t) : false) ||
        (anchorId != null && (s === anchorId || t === anchorId));
      if (!reached) return;
    }
    // NOT FILTERED HERE, DELIBERATELY. An edge too faint to paint still
    // suppresses its own understudy in the calm-state web — that is how the
    // SVG renderer behaves, and dropping it from the list instead of marking
    // it would make a faint relationship appear TWICE under Canvas. Painters
    // skip on `visible`.
    const op = edgeOpacity(e, a.basis);

    const verb = edgeVerb(a as { rel: string; intelRel?: string | null });
    const pa = layout.get(s)!;
    const pb = layout.get(t)!;
    const woken = focus?.edges.get(e) ?? null;
    const soloLit = !!soloNodes && op > 0.5;
    const lit = woken != null || soloLit;
    // Provenance keeps its filament treatment even when a Trace lights it —
    // that IS the trace, and making it look like a semantic claim would be
    // the route lying about what it is.
    const filament = (woken ?? (soloLit ? "provenance" : null)) === "provenance";
    const strokeColor = !lit
      ? "var(--i-text-soft)"
      : filament
        ? "var(--i-source)"
        : woken === "temporal"
          ? "var(--i-text)"
          : woken === "contextual"
            ? "var(--i-text-faint)"
            : "var(--i-signal)";
    const weight = !lit ? 1 : woken === "contextual" ? 0.8 : filament ? 1.4 : 1.9;

    const directional = verbIsDirectional(verb);
    const chord = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const chordPx = chord * camera.k;
    const showVerb =
      chordPx >= 58 &&
      (woken === "semantic" ||
        woken === "temporal" ||
        (woken === "provenance" && (level === "close" || (focus?.counts.provenance ?? 0) <= 4)));

    const tangent = edgeEndTangent(pa, pb);
    edges.push({
      id: e,
      from: s,
      to: t,
      rel: a.rel,
      basis: a.basis,
      cls,
      verb,
      directional,
      // GEOMETRY IS WORLD SPACE AND DOES NOT MOVE WITH THE CAMERA.
      d: edgePath(pa, pb),
      anchor: edgeLabelAnchor(pa, pb),
      tangent,
      chord,
      source: { x: pa.x, y: pa.y, r: pa.r },
      target: { x: pb.x, y: pb.y, r: pb.r },
      opacity: op,
      visible: op >= 0.02,
      woken,
      filament,
      strokeColor,
      weight,
      // TRUST LIVES ON THE DASH AND FOCUS NEVER TOUCHES IT.
      dash: a.basis === "external" ? [2.2, 2.6] : a.basis === "inferred" ? [4, 4] : null,
      showVerb,
      head: lit && woken !== "contextual" && directional ? { ...tangent, double: woken === "temporal" } : null,
    });
  });

  // ── AGGREGATES AND BUNDLES ───────────────────────────────────────────
  // WHICH SHELLS MAY SPEAK.
  //
  // A shell name is a claim about a mass, and two of them on top of each
  // other are no claim at all. Greedy, deterministic, biggest first — and
  // SEEDED WITH THE CLUSTER NAMES, which are the map's legend and are drawn
  // whatever else happens, so a shell name never lands on top of one.
  const aggNamed = new Set<string>();
  let aggFlip = new Map<string, boolean>();
  if (aggShellOpacity > 0.01) {
    const placed: { x: number; y: number }[] = CLUSTER_ORDER.map((c) => {
      const q = clusterLabelPoint(c);
      return { x: (q.x - camera.x) * camera.k, y: (q.y - camera.y) * camera.k };
    });
    const ordered = [...seatedAggregates].sort(
      (a, b) =>
        (a.kind === "type" ? 0 : 1) - (b.kind === "type" ? 0 : 1) ||
        b.count - a.count ||
        a.id.localeCompare(b.id)
    );
    for (const agg of ordered) {
      const sx = (agg.x - camera.x) * camera.k;
      const sy = (agg.y - camera.y) * camera.k;
      if (placed.some((q) => Math.abs(q.y - sy) < 17 && Math.abs(q.x - sx) < 210)) continue;
      aggNamed.add(agg.id);
      placed.push({ x: sx, y: sy });
    }
    aggFlip = new Map(
      seatedAggregates.map((agg) => {
        const sx = (agg.x - camera.x) * camera.k + viewport.w / 2;
        return [agg.id, agg.x < FIELD.cx ? sx > LABEL_ROOM : sx > viewport.w - LABEL_ROOM] as const;
      })
    );
  }

  const aggregates: AuditVisualAggregate[] = seatedAggregates.map((agg) => ({
    ...agg,
    tint: agg.homogeneous ? intelColor(agg.homogeneous) : null,
    opacity: aggShellOpacity,
    selected: selectedId === agg.id,
    layoutRole: "cell" as const,
    named: agg.kind === "type" && aggNamed.has(agg.id),
    labelFlip: aggFlip.get(agg.id) ?? false,
  }));

  const bundles: AuditVisualBundle[] =
    aggShellOpacity > 0.01
      ? cache.bundles.map((bn) => ({ ...bn, opacity: aggShellOpacity * 0.75, mid: bundleMidpoint(bn.d) }))
      : [];

  // ONE RELATIONSHIP, ONE LINE. A strand drawn properly, or standing inside a
  // bundle, must not also appear as its faint understudy underneath.
  const suppressedWebEdges = new Set<string>();
  for (const e of edges) suppressedWebEdges.add(e.id);
  for (const bn of bundles) for (const e of bn.edges) suppressedWebEdges.add(e);

  // ── LABEL AUTHORITY ──────────────────────────────────────────────────
  const labelled = new Set<string>();
  {
    const placed: { x: number; y: number; left: boolean }[] = [];
    const screen = (p: { x: number; y: number }) => ({
      x: (p.x - camera.x) * camera.k,
      y: (p.y - camera.y) * camera.k,
    });
    const room = (sx: number, sy: number, left: boolean) =>
      !placed.some((q) => q.left === left && Math.abs(q.y - sy) < 15 && Math.abs(q.x - sx) < LABEL_ROOM + 4);
    const take = (id: string) => {
      if (labelled.has(id) || labelled.size >= LABEL_BUDGET) return;
      const p = layout.get(id);
      if (!p) return;
      const s = screen(p);
      if (Math.abs(s.x) > halfW + 120 || Math.abs(s.y) > halfH + 60) return;
      const left = p.x < FIELD.cx;
      if (!room(s.x, s.y, left)) return;
      labelled.add(id);
      placed.push({ x: s.x, y: s.y, left });
    };

    if (selectedId) take(selectedId);
    if (hoveredId) take(hoveredId);
    if (focus) {
      const order = (id: string) => {
        const r = focus.nodes.get(id);
        return r === "anchor" ? 0 : r === "semantic" ? 1 : r === "temporal" ? 2 : 3;
      };
      for (const id of [...focus.frame].sort(
        (a, b) => order(a) - order(b) || (degreeOf.get(b) ?? 0) - (degreeOf.get(a) ?? 0)
      )) {
        take(id);
      }
    }

    if (level === "medium") {
      for (const agg of seatedAggregates) {
        const ranked = [...agg.members]
          .sort((a, b) => (degreeOf.get(b) ?? 0) - (degreeOf.get(a) ?? 0) || a.localeCompare(b))
          .filter((id) => (degreeOf.get(id) ?? 0) > 0)
          .slice(0, 2);
        for (const id of ranked) take(id);
      }
    }

    const allowed = labelsFor(level);
    const candidates = drawnNodes
      .filter((id) => allowed.has(graph.getNodeAttribute(id, "kind")))
      .sort((a, b) => {
        const ka = LABEL_PRIORITY.indexOf(graph.getNodeAttribute(a, "kind"));
        const kb = LABEL_PRIORITY.indexOf(graph.getNodeAttribute(b, "kind"));
        return ka - kb || (degreeOf.get(b) ?? 0) - (degreeOf.get(a) ?? 0) || a.localeCompare(b);
      });
    for (const id of candidates) take(id);
  }

  // ── KEYBOARD ORDER ───────────────────────────────────────────────────
  const tabIndexOf = new Map<string, number>();
  {
    const order = drawnNodes
      .filter((n) => openedNow.has(n))
      .sort((a, b) => {
        const aa = graph.getNodeAttributes(a);
        const ba = graph.getNodeAttributes(b);
        const k = KIND_ORDER.indexOf(aa.kind) - KIND_ORDER.indexOf(ba.kind);
        if (k !== 0) return k;
        return String(aa.label).localeCompare(String(ba.label));
      });
    order.forEach((id, i) => tabIndexOf.set(id, i + 1));
  }

  // ── NODES ────────────────────────────────────────────────────────────
  const nodes: AuditVisualNode[] = [];
  const latentByCluster = new Map<string, number>();
  let latentCount = 0;
  for (const id of drawnNodes) {
    const p = layout.get(id)!;
    const attrs = graph.getNodeAttributes(id);
    const rank = focus?.nodes.get(id) ?? null;

    // A SUPERSEDED EXTERNAL OBJECT IS HISTORY, NOT NEWS.
    //
    // It keeps a real seat — the temporal chain that reaches it has to land
    // somewhere — but it stays a mark until something reaches it: selected,
    // hovered, in its neighbourhood, matched by a search, or lit by a solo.
    // That is what makes "supersedes" legible as an ARROW OUT OF THE PAST
    // rather than as two live objects that happen to be joined.
    const historical = attrs.kind === "intel" && attrs.isCurrent === false;
    const reached =
      selectedId === id ||
      hoveredId === id ||
      (matches?.has(id) ?? false) ||
      (soloNodes?.has(id) ?? false) ||
      rank != null;

    // DISCLOSURE, SEPARATELY FROM RESOLUTION. `identityOf` folds the two
    // together; the search lens's claim is about this one alone.
    const disclosed = openedNow.has(id) && (!historical || reached);
    const identity = identityOf(
      attrs.kind,
      disclosed,
      level,
      // A SUPERSEDED OBJECT IS STILL HISTORY AT EVERY DISTANCE. Zoom reveals
      // what a thing is; it does not un-supersede it.
      resolvedByZoom && onScreen.has(id) && (!historical || reached)
    );
    const latent = identity === "latent";

    if (latent) {
      latentCount++;
      const lane = attrs.lane;
      if (typeof lane === "string" && lane) latentByCluster.set(lane, (latentByCluster.get(lane) ?? 0) + 1);
    }

    // A LABEL RUNS OUTWARD — UNLESS OUTWARD IS OFF THE SCREEN. Computed only
    // for the two nodes that can be at the rim with a name that must be
    // legible: the selection and whatever is under the cursor.
    const anchored = selectedId === id || hoveredId === id;
    const screenX = anchored ? (p.x - camera.x) * camera.k + viewport.w / 2 : 0;
    const labelInward =
      anchored && (p.x < FIELD.cx ? screenX < LABEL_ROOM : screenX > viewport.w - LABEL_ROOM);

    nodes.push({
      id,
      label: fieldLabel(attrs),
      kind: attrs.kind,
      semanticSubtype: subtypeOf(attrs),
      cluster: typeof attrs.lane === "string" ? attrs.lane : null,
      basis: basisOf(attrs),
      count: 0,
      importance: degreeOf.get(id) ?? 0,
      layoutRole: layoutRoleOf(attrs.kind),
      x: p.x,
      y: p.y,
      // REALITY STOPS GROWING AT 190 DEVICE PIXELS — a screen fact, applied
      // to the one node large enough for it to matter.
      r: attrs.kind === "reality" ? p.r * coreScale : p.r,

      shape: NODE_SHAPE[attrs.kind],
      color: nodeColor(attrs),
      hollow: attrs.kind === "intel" && intelIsHollow(attrs.intelligenceType),
      identity,
      // A latent mark recedes when something else is being explained, for the
      // same reason the cluster names do: it is orientation, not the answer.
      opacity: latent
        ? soloNodes
          ? TIER.latentDimmed
          : matches || focus
            ? FOCUS_TIER.unrelatedLatent
            : LATENT[level].opacity
        : nodeOpacity(id),
      depth: nodeDepth(id),
      rank,
      latentR: latentRadius(p.r, level, camera.k),
      selected: selectedId === id,
      hovered: hoveredId === id,
      matched: matches?.has(id) ?? false,
      // THE SWEEP TESTS CLUSTERS, NOT NODES. It lights everything seated in a
      // lane it has already passed, so the key is the lane.
      swept: swept.has((typeof attrs.lane === "string" ? attrs.lane : "") ?? ""),
      labelled: !latent && labelled.has(id) && attrs.kind !== "lane",
      labelInward,
      onScreen: onScreen.has(id),
      // A MARK YOU CANNOT REACH IS A DEAD END. Superseded history stays a
      // mark and becomes a pointer target, so the arrow into it can be
      // followed.
      reachable: historical && openedNow.has(id),
      opened: disclosed,
      tabIndex: tabIndexOf.get(id) ?? -1,
      accessibleName: accessibleNameOf(attrs),
    });
  }

  // ── STRUCTURE ────────────────────────────────────────────────────────
  //
  // `aligned` is solid and the two disagreement bands past it are dashed —
  // the first is where the project agrees with itself and the others are
  // distances from that, which the material says before any label does.
  const rings: SceneRing[] = [
    { id: "aligned", r: FIELD.alignedR, dash: null, opacity: 1 },
    { id: "drift", r: FIELD.driftR, dash: [3, 7], opacity: 1 },
    { id: "conflict", r: FIELD.conflictR, dash: [3, 7], opacity: 1 },
    { id: "cluster", r: FIELD.clusterR, dash: null, opacity: 1 },
    { id: "edge", r: FIELD.edgeR, dash: null, opacity: 0.6 },
  ];
  // WHEN EXTERNAL INTELLIGENCE IS PRESENT the ring above stops being the edge
  // of the map and becomes the edge of SIGNAL'S OWN RECORD, with somebody
  // else's material outside it. Same broken stroke as the external edges.
  if (hasIntel) rings.push({ id: "hermes", r: FIELD.outerR, dash: [2.2, 2.6], opacity: 0.5 });

  const sectors: SceneStructure["sectors"] = [];
  for (let i = 0; i < CLUSTER_ORDER.length; i++) {
    const a = (-90 + (i + 0.5) * (360 / CLUSTER_ORDER.length)) * (Math.PI / 180);
    sectors.push({
      x1: FIELD.cx + Math.cos(a) * FIELD.alignedR,
      y1: FIELD.cy + Math.sin(a) * FIELD.alignedR,
      x2: FIELD.cx + Math.cos(a) * FIELD.edgeR,
      y2: FIELD.cy + Math.sin(a) * FIELD.edgeR,
    });
  }

  return {
    nodes,
    edges,
    aggregates,
    bundles,
    web,
    structure: {
      cx: FIELD.cx,
      cy: FIELD.cy,
      rings,
      bands: BAND_LIST,
      sectors,
      // The guides recede when there is a subject on the field, because then
      // they are the ground rather than the reading.
      opacity: focus || soloNodes ? TIER.structure * 0.62 : TIER.structure,
      bandLabelOpacity: TIER.structure * (focus || soloNodes ? 1.0 : 1.6),
      showBandNames: level !== "close",
    },
    webOpacity,
    sheafOpacity: focus || soloNodes ? WEB.sheafFocused : WEB.sheaf,
    strandOpacity: focus || soloNodes ? WEB.strandFocused : WEB.strand,
    aggShellOpacity,
    suppressedWebEdges,
    coreScale,
    focus,
    level,
    openedNow,
    latentByCluster,
    dimClusterLabels: !!(soloNodes || matches || focus),
    stats: {
      drawn: nodes.length,
      opened: openedNow.size,
      latent: latentCount,
      edges: edges.length,
      onScreen: onScreen.size,
      labelled: labelled.size,
    },
  };
}

// ── THE CORPUS-ONLY HALF, MEMOISED SEPARATELY ──────────────────────────
//
// The web, the constellations, the bundles and the degrees depend on the
// graph and the seats alone — not on the camera, the selection or the tier.
// Recomputing them per frame is the single most expensive mistake this
// module could make, so they are a cache with its own lifetime, keyed by the
// caller on `[graph, layout]`.

export interface SceneCache {
  web: StructuralWeb;
  aggregates: SeatedAggregate[];
  bundles: WebBundle[];
  degreeOf: ReadonlyMap<string, number>;
  hasIntel: boolean;
}

export function buildSceneCache(graph: AuditGraph, layout: GraphLayout): SceneCache {
  const web = structuralWeb(graph, layout);
  const aggregates = layoutAggregates(layout);

  const degreeOf = new Map<string, number>();
  graph.forEachEdge((_e, a, src, tgt) => {
    if (edgeFocusClass(a as { rel: string; relClass?: string | null }) === null) return;
    degreeOf.set(src, (degreeOf.get(src) ?? 0) + 1);
    degreeOf.set(tgt, (degreeOf.get(tgt) ?? 0) + 1);
  });

  const groupOf = new Map<string, string>();
  const seat = new Map<string, { x: number; y: number }>();
  for (const agg of aggregates) {
    seat.set(agg.id, { x: agg.x, y: agg.y });
    for (const m of agg.members) groupOf.set(m, agg.id);
    // A source constellation's HUB belongs to it too.
    if (agg.hub) groupOf.set(agg.hub, agg.id);
  }
  const bundles =
    aggregates.length === 0
      ? []
      : aggregateBundles(graph, layout, {
          groupOf: (id) => groupOf.get(id) ?? null,
          seatOf: (id) => seat.get(id) ?? null,
        });

  return { web, aggregates, bundles, degreeOf, hasIntel: graph.someNode((_n, a) => a.kind === "intel") };
}

// Kept local rather than imported from the renderer, so this module has no
// dependency on a component. The order is the instrument's, not geometry's:
// the project, what it says must be true, then where Reality disagrees.
const KIND_ORDER: NodeKind[] = [
  "reality",
  "scope",
  "requirement",
  "lane",
  "person",
  "finding",
  "dependency",
  "decision",
  "decisionGate",
  "feature",
  "work",
  "intelligence",
  "passage",
  "transcript",
  "notion_page",
  "figma_artifact",
  "source",
  "checkpoint",
  "intel",
];

const BAND_LIST = [
  { id: "aligned", label: "Aligned", r: FIELD.alignedR },
  { id: "drift", label: "Drift", r: FIELD.driftR },
  { id: "conflict", label: "Conflict", r: FIELD.conflictR },
];
