"use client";

// THE SIGNAL GRAPH — the primary Audit surface.
//
// The graph IS the instrument. The inspector and the review console are
// contextual detail beside it, not peers competing for the viewport.
//
// WHAT MAKES THIS NOT A HAIRBALL, in order of importance:
//
//   1. MEMBERSHIP IS POSITION, NOT A LINE. 74 of the graph's edges say "this
//      belongs to that cluster". The layout already says that by seating the
//      node in the cluster's sector, so those edges are never drawn. That one
//      decision is the difference between ~40 readable relationships and 162
//      crossing strokes.
//
//   2. PROGRESSIVE IDENTITY — NOT PROGRESSIVE EXISTENCE. Every real node is
//      drawn at every zoom, at its real seat. What changes is how much of
//      itself it shows: a latent mark, then its shape, then its name. Zoom
//      reveals identity; it does not create the world. Expanding a cluster
//      promotes marks that were already on screen rather than conjuring
//      fourteen new things, which is what it used to do.
//
//   3. EVIDENCE OUTRANKS INFERENCE. Attested edges are solid at rest; inferred
//      ones are dashed and faint until something is selected.
//
// SVG, with a viewBox camera. At 65 nodes on the largest Scope this is far
// inside SVG's comfort zone, and it keeps every node a real focusable element
// with an accessible name — which a WebGL canvas cannot.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Graph from "graphology";
import type { AuditGraph, AuditNodeAttributes, NodeKind } from "@/lib/audit/graph";
import {
  FIELD,
  BANDS,
  layoutGraph,
  edgePath,
  edgeLabelAnchor,
  edgeEndTangent,
  clusterLabelPoint,
  CLUSTER_ORDER,
  RECORD_EXTENT,
  layoutAggregates,
  type GraphLayout,
} from "@/lib/audit/graphLayout";
import {
  NODE_SHAPE,
  nodeColor,
  TIER,
  FOCUS_TIER,
  FOCUS_EDGE,
  WEB,
  DEPTH_CLASS,
  intelColor,
  LATENT,
  latentRadius,
  identityOf,
  atLeast,
  RESOLVE_AT,
  intelIsHollow,
  fieldLabel,
  labelsFor,
  type Depth,
  type ZoomLevel,
  type Identity,
} from "./graphTokens";
import { structuralWeb, aggregateBundles } from "@/lib/audit/structuralWeb";
import {
  semanticFocus,
  edgeFocusClass,
  edgeVerb,
  verbIsDirectional,
  type FocusClass,
  type FocusModel,
  type FocusRank,
} from "@/lib/audit/focus";
import {
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  quantizeScale,
  FRAME_SLACK,
  type Camera,
} from "./cameraMotion";

// KEYBOARD ORDER, AS A CONSTANT. Declared here rather than inside the
// component so it is not a fresh array identity on every render.
const KIND_ORDER: NodeKind[] = [
  "reality",
  "scope",
  // With the project, before the disagreements: tabbing should read "here is
  // the project, here is what it says must be true, here is where Reality
  // disagrees".
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
  // LAST IN THE TAB ORDER, on purpose. Tabbing should walk Signal's own
  // record before it walks anybody else's claims about it.
  "intel",
];

// Camera shape, limits and motion live in ./cameraMotion — pure, so the
// motion contract is assertable by proof rather than only by eye. Re-exported
// here because this module is where callers already look for them.
export { DEFAULT_CAMERA, MAX_ZOOM, MIN_ZOOM };
export type { Camera };

export interface SignalGraphProps {
  graph: AuditGraph;
  /** Node ids whose cluster is open — the core slice, plus expanded clusters.
      Everything else is still DRAWN, as a latent mark. */
  opened: Set<string>;
  selectedId: string | null;
  hoveredId: string | null;
  /** Evidence Solo result, or null when off. */
  soloNodes: Set<string> | null;
  /** Search matches, or null when the search box is empty. */
  matches: Set<string> | null;
  camera: Camera;
  /** The detail tier, decided upstream WITH HYSTERESIS. Not derived from
      `camera.k` here: a bare threshold makes the tier a coin toss for any
      camera resting on it, and one owner of that decision is the only way
      this and the instrument's own readout can agree. */
  level: ZoomLevel;
  /** The LIVE camera, not the last rendered one. Wheel and drag events arrive
      faster than React commits and each must chain off the previous result. */
  getCamera: () => Camera;
  onCamera: (c: Camera) => void;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  /** Cluster ids the user has expanded. */
  expanded: Set<string>;
  onToggleCluster: (cluster: string) => void;
  /** Degrees, or null when no audit sweep is running. */
  sweepAngle: number | null;
  /** Clusters the sweep has already tested this pass. */
  swept: Set<string>;
  /**
   * The measured viewport, in CSS pixels, reported upward whenever it
   * changes.
   *
   * The FRAMING LAW lives in the instrument — it has to, because it is the
   * instrument that owns the camera — but the only thing that knows how big
   * the field actually is on screen is the element being resized. Guessing
   * 1000x800 there would make "is this already comfortably in view" a lie on
   * every window that is not exactly that size.
   */
  onViewport?: (vp: { w: number; h: number }) => void;
}

export default function SignalGraph({
  graph,
  opened,
  selectedId,
  hoveredId,
  soloNodes,
  matches,
  camera,
  level,
  getCamera,
  onCamera,
  onSelect,
  onHover,
  expanded,
  onToggleCluster,
  sweepAngle,
  swept,
  onViewport,
}: SignalGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 800 });
  // Held in a ref so the observer is installed once. A callback prop in the
  // effect's dependency list would tear down and rebuild the ResizeObserver
  // on every parent render, which is a lot of observer churn to pay for a
  // number that changes when someone drags a window edge.
  const viewportRef = useRef(onViewport);
  viewportRef.current = onViewport;
  // Labelling is decided per node by identityOf(), which folds the zoom level
  // and whether the node's cluster is open into one answer — a node can be at
  // close zoom and still be a nameless mark.
  //
  // THE SCALE THE NODES SEE IS STEPPED. The camera below is exact; this is
  // the only value handed down to the 64 memoised nodes, so a slow trackpad
  // zoom stops re-rendering all of them on every frame. See cameraMotion.
  const nodeScale = useMemo(() => quantizeScale(camera.k), [camera.k]);

  /**
   * THE CAMERA, ROUNDED, FOR THINGS THAT MUST NOT RECOMPUTE EVERY FRAME.
   *
   * Which labels fit and which nodes are on screen both depend on where the
   * camera is — in principle every frame, and in practice that meant twenty
   * recomputations during one 320ms framing move, each able to hand a name
   * from one node to another or create four hundred filter surfaces.
   *
   * Twelve device pixels of pan and one quantised zoom step. The camera
   * itself stays exactly continuous; only what is DERIVED from it is stepped.
   */
  const planKey =
    `${Math.round((camera.x * camera.k) / 12)}:${Math.round((camera.y * camera.k) / 12)}:${nodeScale.toFixed(3)}`;

  // Layout is computed from the WHOLE graph, not the visible subset, so a
  // node does not move when its neighbours are collapsed. Expanding a cluster
  // should reveal nodes, never rearrange the map.
  const layout: GraphLayout = useMemo(() => layoutGraph(graph), [graph]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { w: r.width || 1000, h: r.height || 800 };
      setSize(next);
      viewportRef.current?.(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── CAMERA ───────────────────────────────────────────────────────────
  const vb = useMemo(() => {
    const w = size.w / camera.k;
    const h = size.h / camera.k;
    return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
  }, [camera, size]);

  // THE WHEEL COMPUTES FROM A LIVE CAMERA, NOT A RENDERED ONE.
  //
  // A trackpad delivers wheel events far faster than React re-renders. A
  // handler that closes over the `camera` prop therefore computes SEVERAL
  // consecutive events from the same stale value, and they do not compose:
  // measured, alternating in/out notches that should have cancelled exactly
  // instead walked the zoom apart in both directions at once — 1.05 became
  // 1.24 and 0.90 over fourteen events that summed to zero. That is the
  // defect underneath what looked like threshold chatter, and it made fast
  // trackpad zoom subtly non-linear.
  //
  // So the handler asks the instrument for the LIVE camera. An earlier
  // attempt kept a local ref synced from the prop by an effect, and that was
  // worse than the bug it fixed: an effect from an older render lands AFTER a
  // newer wheel event and clobbers the ref back to a stale value, so the two
  // directions of a wobble each walked away from centre instead of
  // cancelling. There is exactly one live camera, and the instrument owns it.
  const sizeLive = useRef(size);
  useEffect(() => {
    sizeLive.current = size;
  }, [size]);

  // Zoom about the pointer, so the thing under the cursor stays under it.
  //
  // Attached natively rather than through React's onWheel: React registers
  // wheel handlers as PASSIVE, so preventDefault() is ignored and the page
  // scrolls behind the graph while you zoom. The browser says so out loud
  // ("Unable to preventDefault inside passive event listener invocation") and
  // it is a real defect, not a warning to silence.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const el = svgRef.current;
      if (!el) return;
      const c = getCamera();
      const sz = sizeLive.current;
      const r = el.getBoundingClientRect();
      const w0 = sz.w / c.k;
      const h0 = sz.h / c.k;
      const before = {
        x: c.x - w0 / 2 + ((e.clientX - r.left) / r.width) * w0,
        y: c.y - h0 / 2 + ((e.clientY - r.top) / r.height) * h0,
      };
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * Math.exp(-e.deltaY * 0.0016)));
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      onCamera({ x: before.x - (fx - 0.5) * (sz.w / k), y: before.y - (fy - 0.5) * (sz.h / k), k });
    },
    [getCamera, onCamera]
  );

  // Attached once: `onWheel` no longer changes identity every frame, so the
  // listener is not torn down and rebuilt on every notch of every gesture.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; k: number } | null>(null);
  const moved = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const c = getCamera();
    drag.current = { sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y, k: c.k };
    moved.current = false;
    // Capture so a drag that leaves the SVG still delivers its moves. Guarded
    // because a pointerdown does not guarantee a LIVE pointer with that id —
    // a synthetic event, a pointer that ended between dispatch and handler, or
    // assistive tech all throw here, and a throw in a pointer handler takes
    // the whole gesture down. Losing capture costs a drag that stops at the
    // edge; throwing costs the field.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* no live pointer to capture — the drag still works inside the field */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    // Measured against the camera captured at pointer-down, so a burst of
    // moves between commits still lands exactly under the cursor.
    onCamera({ x: d.cx - dx / d.k, y: d.cy - dy / d.k, k: d.k });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // ── FOCUS SETS ───────────────────────────────────────────────────────
  //
  // Selection lights a node's own neighbourhood, ONE HOP, membership
  // excluded — and now CLASSIFIED. lib/audit/focus.ts owns the sorting; this
  // file owns only what each class looks like. The split matters because the
  // classification is assertable by a proof and a stroke width is not.
  const focus: FocusModel | null = useMemo(
    () => semanticFocus(graph, selectedId ?? hoveredId),
    [selectedId, hoveredId, graph]
  );

  /** How loudly a node speaks right now. */
  const nodeOpacity = (id: string): number => {
    if (soloNodes) return soloNodes.has(id) ? FOCUS_TIER.anchor : TIER.soloDimmed;
    if (matches && !focus) return matches.has(id) ? FOCUS_TIER.anchor : FOCUS_TIER.unrelated;
    if (focus) {
      const rank = focus.nodes.get(id);
      if (rank) return FOCUS_TIER[rank];
      // A search match that the selection does not touch stays findable:
      // search is a question about the whole field, and answering it only
      // inside the current neighbourhood would read as the search breaking.
      return matches?.has(id) ? FOCUS_TIER.contextual : FOCUS_TIER.unrelated;
    }
    return TIER.rest;
  };

  /**
   * SHARP OR SOFT — the other half of the hierarchy.
   *
   * Everything the reader is being asked to read is sharp: the selection, its
   * semantic and temporal neighbours, the provenance route, the current
   * search matches. Everything else is softened by half a pixel, which is
   * enough for the eye to stop trying to resolve it and nowhere near enough
   * to stop it being a map.
   */
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

  // ── WHAT IS DRAWN ────────────────────────────────────────────────────
  //
  // EVERY SEATED NODE. A collapsed cluster no longer means "not here", it
  // means "not yet itself" — the difference between a field that admits how
  // big the project is and one that pretends 41 of its 65 things do not
  // exist.
  const drawnNodes = useMemo(() => graph.nodes().filter((n) => layout.has(n)), [graph, layout]);

  /**
   * WHAT IS ON SCREEN, QUANTISED.
   *
   * Optical depth is a filter, and a filter is an offscreen rasterisation
   * surface per element. Profiled during a Trace on the real payload, 44% of
   * the transition was browser style-and-paint work: four hundred blur
   * surfaces being created at once, most of them for nodes outside the
   * viewport that nobody could see either way.
   *
   * Softening something off screen is not a perceptual effect, it is a bill.
   * Shares the label plan's quantised camera key, so crossing the frame edge
   * during a pan does not re-render the field.
   */
  const onScreen = useMemo(() => {
    const out = new Set<string>();
    const halfW = size.w / 2 + 80;
    const halfH = size.h / 2 + 80;
    for (const id of drawnNodes) {
      const p = layout.get(id);
      if (!p) continue;
      if (Math.abs((p.x - camera.x) * camera.k) > halfW) continue;
      if (Math.abs((p.y - camera.y) * camera.k) > halfH) continue;
      out.add(id);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnNodes, layout, planKey, size.w, size.h]);

  /**
   * WHICH MARKS DISTANCE HAS RESOLVED.
   *
   * The primary law of this tranche, applied: from the NEAR tier inward, a
   * mark you are actually looking at becomes itself. Gated on `onScreen`
   * rather than on the whole field, because resolution costs a real shape
   * and a hit target per node, and 250 of them behind the viewport edge are
   * a bill with no perceptual return — the same argument the depth filter
   * already makes.
   *
   * It does NOT feed `openedNow`. Going closer resolves identity and wakes
   * no relationships; edges still belong to expansion and selection.
   */
  const resolvedByZoom = atLeast(level, RESOLVE_AT);

  const nodeDepth = (id: string, latent: boolean): Depth => {
    if (!onScreen.has(id)) return 0;
    if (soloNodes) return soloNodes.has(id) ? 0 : latent ? 1 : 1;
    if (focus) {
      const rank = focus.nodes.get(id);
      if (rank && rank !== "contextual") return 0;
      if (matches?.has(id)) return 0;
      return 1;
    }
    if (matches) return matches.has(id) ? 0 : 1;
    return 0;
  };



  // ── THE CALM-STATE WEB ───────────────────────────────────────────────
  //
  // Computed from the graph and the seats alone — not from `opened`, not from
  // selection, not from the camera. It is a property of the corpus, so it is
  // the same web whatever the reader has open, and it costs one memo per
  // graph rather than one per frame.
  const web = useMemo(() => structuralWeb(graph, layout), [graph, layout]);

  /** How many real relationships each node has — membership excluded, since
      that is position. On the node as `data-degree`, which is what makes
      "20 anonymous marks, 16 of them with two or more relationships"
      checkable from outside instead of by opening twenty panels. */
  const degreeOf = useMemo(() => {
    const m = new Map<string, number>();
    graph.forEachEdge((_e, a, src, tgt) => {
      if (edgeFocusClass(a as { rel: string; relClass?: string | null }) === null) return;
      m.set(src, (m.get(src) ?? 0) + 1);
      m.set(tgt, (m.get(tgt) ?? 0) + 1);
    });
    return m;
  }, [graph]);

  // ── THE CONSTELLATIONS, AND WHAT THEY SHOW AT EACH TIER ──────────────
  //
  // A shell is not a node. It is a way of saying "these N things" without
  // drawing N labels, and it fades out as the things themselves become
  // readable — at `near` the members carry their own names and a shell around
  // them would be a second, redundant claim about the same region.
  const aggregates = useMemo(() => layoutAggregates(layout), [layout]);

  // ── WHAT A CONSTELLATION IS CONNECTED TO, WHILE IT IS STILL A MASS ────
  //
  // At the outer tiers a group is one shape with a count, so its members'
  // relationships have to be one strand with a count too. Computed once per
  // layout — it is a property of the corpus, not of the camera or the
  // selection — and drawn only where the shells are drawn.
  const bundles = useMemo(() => {
    if (aggregates.length === 0) return [];
    const groupOf = new Map<string, string>();
    const seat = new Map<string, { x: number; y: number }>();
    for (const agg of aggregates) {
      seat.set(agg.id, { x: agg.x, y: agg.y });
      for (const m of agg.members) groupOf.set(m, agg.id);
      // A source constellation's HUB belongs to it too. Its passages are the
      // members; the artifact itself is the thing they hang off, and an edge
      // reaching the artifact is reaching the constellation.
      if (agg.hub) groupOf.set(agg.hub, agg.id);
    }
    return aggregateBundles(graph, layout, {
      groupOf: (id) => groupOf.get(id) ?? null,
      seatOf: (id) => seat.get(id) ?? null,
    });
  }, [graph, layout, aggregates]);

  /**
   * HOW LOUD A SHELL IS, BY TIER.
   *
   * The ladder in four numbers. It reaches zero at `near` rather than fading
   * asymptotically, because a 4%-opacity ring around a region whose contents
   * are all named is not subtle, it is a smudge nobody can account for.
   */
  const aggShellOpacity = level === "far" ? 1 : level === "medium" ? 0.5 : 0;

  /**
   * HOW MUCH OF THE WEB THIS TIER WANTS.
   *
   * Full while the field is the subject; halved at NEAR, where you are
   * arriving somewhere and the surrounding structure is still orientation;
   * gone at CLOSE, where you are reading one thing and the web is neither
   * readable nor free. See the layer itself for the measurement.
   */
  const webOpacity = level === "close" ? 0 : level === "near" ? 0.5 : 1;

  /**
   * REALITY STOPS GROWING AT 190 DEVICE PIXELS.
   *
   * It is 54 world units where nothing else is more than 15, so at close zoom
   * it became a planet: a reader who went in to read one passage got the core
   * filling a third of the field and the passage pushed off the edge. Capped
   * in SCREEN space rather than world space, because "too big" is a fact
   * about the viewport, not about the model — at far zoom nothing changes at
   * all, and the cap only ever engages past roughly 350%.
   */
  const coreScale = Math.min(1, CORE_MAX_PX / (FIELD.coreR * camera.k));

  /**
   * WHICH SHELLS GET TO PRINT THEIR NAME.
   *
   * The same greedy, authority-ordered collision pass the focused labels use.
   * Type groups are the regions of this field and go first, largest first,
   * because "OBSERVATION 59" is the most useful thing a reader can be told
   * about that mass. Anything that would land on top of a name already
   * printed keeps its count and loses its name.
   */
  const aggLabels = useMemo(() => {
    const kept = new Set<string>();
    if (aggShellOpacity <= 0.01) return kept;
    // SEEDED WITH THE CLUSTER NAMES, which are the map's legend and are drawn
    // whatever else happens. A shell name that lands on "HERMES / WIKI" has
    // not been placed, it has been hidden — and it hides the legend with it.
    const placed: { x: number; y: number }[] = CLUSTER_ORDER.map((c) => {
      const q = clusterLabelPoint(c);
      return { x: (q.x - camera.x) * camera.k, y: (q.y - camera.y) * camera.k };
    });
    const ordered = [...aggregates].sort(
      (a, b) =>
        (a.kind === "type" ? 0 : 1) - (b.kind === "type" ? 0 : 1) ||
        b.count - a.count ||
        a.id.localeCompare(b.id)
    );
    for (const agg of ordered) {
      const sx = (agg.x - camera.x) * camera.k;
      const sy = (agg.y - camera.y) * camera.k;
      if (placed.some((q) => Math.abs(q.y - sy) < 17 && Math.abs(q.x - sx) < 210)) continue;
      kept.add(agg.id);
      placed.push({ x: sx, y: sy });
    }
    return kept;
  }, [aggregates, aggShellOpacity, camera.x, camera.y, camera.k]);

  /** Whether this Scope has any external intelligence at all. Governs the
      outer boundary ring, and nothing else — an absent band draws no ring
      rather than an empty one. */
  const hasIntel = useMemo(() => graph.someNode((_n, a) => a.kind === "intel"), [graph]);

  // DENSE NODES DO NOT REQUIRE DENSE EDGES.
  //
  // Latent marks carry no lines. Drawing every relationship the moment every
  // node is on screen is precisely the hairball this layout was built to
  // avoid, and an edge to something with no name on it explains nothing
  // anyway. An edge appears when BOTH its endpoints have been opened.
  //
  // AND EXTERNAL INTELLIGENCE IS DRAWN BY CLASS, NOT ALL AT ONCE.
  //
  // The real corpus is overwhelmingly contextual: of 87 object-to-object
  // relations in the JSA payload, 6 are temporal and 9 are semantic — the
  // remaining 72 are `related_to`. Drawing those at rest would put 72
  // meaningless strokes across the outer band and bury the 15 that carry a
  // chain, which is the exact failure mode this whole layout exists to
  // prevent. So:
  //
  //   TEMPORAL    supersedes / refines / resolves / reopens — the chain
  //   SEMANTIC    depends_on / caused_by / contradicts / supports / …
  //               Both drawn at rest, once both endpoints are open.
  //
  //   CONTEXTUAL  related_to and anything unrecognised. Present in the
  //               graph, reachable, listed in the inspector — drawn only
  //               when one of its endpoints is the thing being explained.
  //   PROVENANCE  derived_from between two objects, and `cites` from an
  //               object to a passage. The mesh that says how the knowledge
  //               was made rather than what it says about the project.
  //               Same rule: hundreds of citation strokes are the answer to
  //               "why does it say this", which is a question about ONE
  //               object.
  //
  // Nothing is dropped and nothing is hidden from the reader — the edges
  // exist, the inspector lists them, and selecting either end draws them.
  // This is a rule about REST, not about existence.
  const anchorId = selectedId ?? hoveredId;

  // SELECTION REVEALS ITS OWN NEIGHBOURHOOD.
  //
  // A Finding's work item can sit in a collapsed cluster. Before this, focus
  // lit it and the cluster kept it a nameless mark — so "reveal the one-hop
  // neighbourhood" produced a glowing dot with no name and no line reaching
  // it, which is the exact "selection reveals only one useful relationship"
  // the hands-on test found.
  //
  // This is PROMOTION AT THE SAME SEAT, not a topology change: the node was
  // always drawn, always there, always in that position. Law 1 holds — no
  // node moves, nothing is created, and it reverts the moment the selection
  // does, because it is attention rather than state.
  //
  // Contextual neighbours are excluded (`focus.frame`, not `focus.nodes`):
  // opening every `related_to` partner would promote a large part of the
  // outer band on every click.
  const openedNow = useMemo(() => {
    // AND A TRACE PROMOTES ITS OWN ROUTE, for exactly the same reason and by
    // exactly the same mechanism. The alternative — expanding the CLUSTER of
    // every node on the route — is what turned one claim's provenance into
    // 394 open nodes on the real corpus. A route is the nodes on the route.
    const reveal = soloNodes ? [...soloNodes] : focus ? focus.frame : null;
    if (!reveal) return opened;
    let extra: Set<string> | null = null;
    for (const id of reveal) {
      if (opened.has(id)) continue;
      if (!extra) extra = new Set(opened);
      extra.add(id);
    }
    return extra ?? opened;
  }, [focus, opened, soloNodes]);

  const drawnEdges = useMemo(() => {
    const out: {
      id: string;
      from: string;
      to: string;
      rel: string;
      basis: string;
      cls: FocusClass;
      verb: string;
      directional: boolean;
      d: string;
      anchor: ReturnType<typeof edgeLabelAnchor>;
      tangent: { x: number; y: number };
      chord: number;
      target: { x: number; y: number; r: number };
    }[] = [];
    graph.forEachEdge((e, a, s, t) => {
      // MEMBERSHIP IS NEVER AN EDGE. See the header.
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
      const verb = edgeVerb(a as { rel: string; intelRel?: string | null });
      const pa = layout.get(s)!;
      const pb = layout.get(t)!;
      out.push({
        id: e,
        from: s,
        to: t,
        rel: a.rel,
        basis: a.basis,
        cls,
        verb,
        directional: verbIsDirectional(verb),
        // GEOMETRY IS WORLD SPACE AND DOES NOT MOVE WITH THE CAMERA.
        //
        // These were rebuilt inside the render for every drawn edge on every
        // frame — 187 path strings and three trig calls each, per frame of
        // every pan and every framing move. Measured, the largest single
        // contributor to the 60-90ms long tasks a Trace was producing. The
        // camera changes what a stroke LOOKS like, never where it is.
        d: edgePath(pa, pb),
        anchor: edgeLabelAnchor(pa, pb),
        tangent: edgeEndTangent(pa, pb),
        chord: Math.hypot(pb.x - pa.x, pb.y - pa.y),
        target: pb,
      });
    });
    return out;
  }, [graph, openedNow, layout, anchorId, soloNodes]);

  // ── LABEL AUTHORITY ──────────────────────────────────────────────────
  //
  // ONE PASS DECIDES EVERY NAME ON THE FIELD.
  //
  // Zoom says which KINDS of thing may be named at this tier. That is not
  // enough on its own: measured at close zoom over a real transcript, 130
  // passage quotes printed on top of each other and the region became an
  // illegible grey smear. A label that cannot be read costs the space a
  // readable one would have used.
  //
  // So a second rule runs after the tier's: greedy, deterministic, in
  // authority order, keeping a name only where nothing already printed sits
  // in the same place.
  //
  //   1. WHAT IS OFF SCREEN IS NOT A LABEL. Candidates are filtered to the
  //      viewport first, which is both the largest saving and the most
  //      obviously correct rule: the names you get are the names of the
  //      things you are looking at.
  //   2. The selection and its neighbourhood go first — that is what the
  //      reader asked for.
  //   3. Then representatives, so every constellation names a couple of its
  //      own at the tier where it is still a mass.
  //   4. Then everything the tier permits, by kind, then by how connected it
  //      is, then by id. A hub outranks a leaf; a leaf nothing else refers to
  //      goes last.
  //
  // Recomputed on camera change, which sounds expensive and is not: the
  // viewport filter leaves tens of candidates, and a name changing hands is a
  // prop change on one node rather than a re-render of the field.
  const labelPlan = useMemo(() => {
    const kept = new Set<string>();
    const placed: { x: number; y: number; left: boolean }[] = [];
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    const screen = (p: { x: number; y: number }) => ({
      x: (p.x - camera.x) * camera.k,
      y: (p.y - camera.y) * camera.k,
    });
    const room = (sx: number, sy: number, left: boolean) =>
      !placed.some((q) => q.left === left && Math.abs(q.y - sy) < 15 && Math.abs(q.x - sx) < 190);
    const take = (id: string) => {
      if (kept.has(id) || kept.size >= LABEL_BUDGET) return;
      const p = layout.get(id);
      if (!p) return;
      const s = screen(p);
      // Off screen, plus a margin so a label does not pop the instant its
      // node crosses the frame.
      if (Math.abs(s.x) > halfW + 120 || Math.abs(s.y) > halfH + 60) return;
      const left = p.x < FIELD.cx;
      if (!room(s.x, s.y, left)) return;
      kept.add(id);
      placed.push({ x: s.x, y: s.y, left });
    };

    // 1. the selection, then its neighbourhood in authority order
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

    // 2. a couple of representatives per constellation, at the tier where the
    //    constellation is still a mass
    if (level === "medium") {
      for (const agg of aggregates) {
        const ranked = [...agg.members]
          .sort((a, b) => (degreeOf.get(b) ?? 0) - (degreeOf.get(a) ?? 0) || a.localeCompare(b))
          .filter((id) => (degreeOf.get(id) ?? 0) > 0)
          .slice(0, 2);
        for (const id of ranked) take(id);
      }
    }

    // 3. everything the tier permits
    const allowed = labelsFor(level);
    const candidates = drawnNodes
      .filter((id) => allowed.has(graph.getNodeAttribute(id, "kind")))
      .sort((a, b) => {
        const ka = LABEL_PRIORITY.indexOf(graph.getNodeAttribute(a, "kind"));
        const kb = LABEL_PRIORITY.indexOf(graph.getNodeAttribute(b, "kind"));
        return ka - kb || (degreeOf.get(b) ?? 0) - (degreeOf.get(a) ?? 0) || a.localeCompare(b);
      });
    for (const id of candidates) take(id);
    return kept;
    // QUANTISED AGAINST THE CAMERA, not tied to it.
    //
    // Which names fit depends on where the camera is, so in principle this
    // belongs in every frame — and in practice that meant recomputing the
    // plan twenty times during a single 320ms framing move, each one
    // potentially handing a name from one node to another. Measured, it put a
    // Trace 7ms over its budget and made labels flicker during the tween.
    //
    // Rounded to 12 device pixels of pan and one quantised zoom step, the
    // plan changes when the view meaningfully changes and not while it is
    // merely on its way there. The camera itself stays exactly continuous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, drawnNodes, graph, level, aggregates, degreeOf, focus, selectedId, hoveredId, planKey, size.w, size.h]);

  /** ONE RELATIONSHIP, ONE LINE. Once both ends of a strand are open the
      edge layer draws it properly — with its weight, its head and its verb —
      so the web must stop drawing its faint understudy underneath. */
  const drawnEdgeIds = useMemo(() => new Set(drawnEdges.map((e) => e.id)), [drawnEdges]);

  /** Edges currently standing inside a bundle rather than as themselves. */
  const bundledEdgeIds = useMemo(() => {
    const out = new Set<string>();
    if (aggShellOpacity <= 0.01) return out;
    for (const bn of bundles) for (const e of bn.edges) out.add(e);
    return out;
  }, [bundles, aggShellOpacity]);

  /** Latent nodes per cluster — what "+N" is actually counting. */
  const latentByCluster = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of drawnNodes) {
      // STILL A MARK MEANS STILL A MARK. A node the reader has opened is not
      // counted, and neither is one that distance has resolved — "+202" over
      // a region where forty of them are wearing names would be counting
      // things the reader can already see.
      if (openedNow.has(n)) continue;
      if (resolvedByZoom && onScreen.has(n)) continue;
      const lane = graph.getNodeAttribute(n, "lane") as string | undefined;
      if (lane) m.set(lane, (m.get(lane) ?? 0) + 1);
    }
    return m;
  }, [drawnNodes, openedNow, graph, resolvedByZoom, onScreen]);

  // KEYBOARD ORDER FOLLOWS MEANING, NOT GEOMETRY.
  //
  // SVG document order here is "whatever the layout passes emitted", which
  // would make tabbing wander the field at random. Sorting by slice, then
  // kind, then label gives a tab sequence that reads like the inspector's own
  // hierarchy: Reality, clusters, findings, then detail.
  //
  // Latent marks are deliberately NOT in it: they have no name to announce
  // and clicking one would do nothing. The keyboard route to a collapsed
  // cluster's contents is its own toggle, which says how many there are.
  const tabOrder = useMemo(
    () =>
      drawnNodes.filter((n) => openedNow.has(n)).sort((a, b) => {
        const aa = graph.getNodeAttributes(a);
        const ba = graph.getNodeAttributes(b);
        const k = KIND_ORDER.indexOf(aa.kind) - KIND_ORDER.indexOf(ba.kind);
        if (k !== 0) return k;
        return String(aa.label).localeCompare(String(ba.label));
      }),
    [drawnNodes, openedNow, graph]
  );
  const tabIndexOf = useMemo(() => {
    const m = new Map<string, number>();
    tabOrder.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [tabOrder]);

  return (
    <svg
      ref={svgRef}
      data-shoot="signal-graph"
      data-zoom={level}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={{ width: "100%", height: "100%", display: "block", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
      role="application"
      aria-label={`Signal Graph: ${drawnNodes.length} nodes, ${opened.size} opened and ${drawnNodes.length - opened.size} collapsed into marks, ${drawnEdges.length} relationships shown, ${level} zoom`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={(e) => {
        if (e.target === e.currentTarget && !moved.current) onSelect(null);
      }}
    >
      <defs>
        <radialGradient id="sg-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--i-signal)" stopOpacity="0.26" />
          <stop offset="60%" stopColor="var(--i-signal)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--i-signal)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── STRUCTURE ─────────────────────────────────────────────────
          The disagreement bands, and the sector gutters that make cluster
          territory legible without drawing a box around anything. */}
      {/* BACKGROUND GEOMETRY RECEDES; IT DOES NOT DISAPPEAR.

          Softened by LUMINANCE alone, deliberately — no filter. A blur on
          this group would take a filter region covering the entire field,
          which at close zoom is a multi-thousand-pixel offscreen surface
          re-rasterised on every pan. The rings are hairlines at 15% already;
          two thirds of that is the same perceptual step the nodes get from
          half a pixel of softening, for no paint at all. Orientation is what
          this layer is FOR, so it is the last thing allowed to become
          expensive. */}
      <g
        opacity={focus || soloNodes ? TIER.structure * 0.62 : TIER.structure}
        style={{ pointerEvents: "none", transition: "opacity 200ms ease" }}
        data-shoot="graph-structure"
      >
        {BANDS.map((b) => (
          <circle
            key={b.id}
            cx={FIELD.cx}
            cy={FIELD.cy}
            r={b.r}
            fill="none"
            stroke="var(--i-text-soft)"
            strokeWidth={1 / camera.k}
            strokeDasharray={b.id === "aligned" ? undefined : `${3 / camera.k} ${7 / camera.k}`}
          />
        ))}
        <circle
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={FIELD.clusterR}
          fill="none"
          stroke="var(--i-text-soft)"
          strokeWidth={1 / camera.k}
        />
        {/* THE OUTER BOUND. With the substrate drawn at every zoom, the
            cluster ring stopped being the edge of the map — 41 marks now sit
            outside it, and with nothing enclosing them they read as specks
            that escaped rather than as the project's outer band. This closes
            the field. It is a structural guide at structure opacity: it
            states no fact and stands for no row. */}
        <circle
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={FIELD.edgeR}
          fill="none"
          stroke="var(--i-text-soft)"
          strokeWidth={1 / camera.k}
          opacity={0.6}
        />
        {/* WHEN EXTERNAL INTELLIGENCE IS PRESENT, the ring above stops being
            the edge of the map and becomes the EDGE OF SIGNAL'S OWN RECORD,
            with somebody else's material outside it. This closes the wider
            field, drawn with the same broken stroke the external nodes and
            edges use so the boundary reads as belonging to that material
            rather than to Signal's. */}
        {hasIntel && (
          <circle
            cx={FIELD.cx}
            cy={FIELD.cy}
            r={FIELD.outerR}
            fill="none"
            stroke="var(--i-text-soft)"
            strokeWidth={1 / camera.k}
            strokeDasharray={`${2.2 / camera.k} ${2.6 / camera.k}`}
            opacity={0.5}
          />
        )}
        {CLUSTER_ORDER.map((c, i) => {
          const a = (-90 + (i + 0.5) * (360 / CLUSTER_ORDER.length)) * (Math.PI / 180);
          return (
            <line
              key={c}
              x1={FIELD.cx + Math.cos(a) * FIELD.alignedR}
              y1={FIELD.cy + Math.sin(a) * FIELD.alignedR}
              x2={FIELD.cx + Math.cos(a) * FIELD.edgeR}
              y2={FIELD.cy + Math.sin(a) * FIELD.edgeR}
              stroke="var(--i-text-soft)"
              strokeWidth={1 / camera.k}
              opacity={0.5}
            />
          );
        })}
      </g>

      {/* Band names, on the one axis no cluster puck occupies. */}
      {level !== "close" && (
        <g opacity={TIER.structure * (focus || soloNodes ? 1.0 : 1.6)} style={{ pointerEvents: "none" }}>
          {BANDS.map((b) => {
            // On a sector GUTTER, not the horizontal axis: stacked on one
            // radius line the three names ran into each other
            // ("DRIFTCONFLICT"), and the diagonal separates them on both axes
            // while staying clear of every cluster puck.
            const a = -22.5 * (Math.PI / 180);
            return (
              <text
                key={b.id}
                x={FIELD.cx + Math.cos(a) * (b.r - 8)}
                y={FIELD.cy + Math.sin(a) * (b.r - 8)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11 / camera.k}
                letterSpacing={`${0.16 / camera.k}em`}
                fill="var(--i-text-soft)"
                style={{ textTransform: "uppercase" }}
              >
                {b.label}
              </text>
            );
          })}
        </g>
      )}

      {/* ── THE AUDIT SWEEP ───────────────────────────────────────────
          The bright edge IS the scan; the trail is drawn at angles the scan
          has already passed, so the glow follows rather than precedes it. */}
      {sweepAngle != null && (
        <g
          transform={`rotate(${sweepAngle} ${FIELD.cx} ${FIELD.cy})`}
          style={{ pointerEvents: "none" }}
          data-shoot="graph-sweep"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const from = -(i + 1) * 8;
            const to = -i * 8;
            const p0 = {
              x: FIELD.cx + Math.cos(from * (Math.PI / 180)) * FIELD.edgeR,
              y: FIELD.cy + Math.sin(from * (Math.PI / 180)) * FIELD.edgeR,
            };
            const p1 = {
              x: FIELD.cx + Math.cos(to * (Math.PI / 180)) * FIELD.edgeR,
              y: FIELD.cy + Math.sin(to * (Math.PI / 180)) * FIELD.edgeR,
            };
            return (
              <path
                key={i}
                d={`M ${FIELD.cx} ${FIELD.cy} L ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${FIELD.edgeR} ${FIELD.edgeR} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`}
                fill="var(--i-signal)"
                opacity={0.09 * (1 - i / 6)}
              />
            );
          })}
          <line
            x1={FIELD.cx}
            y1={FIELD.cy}
            x2={FIELD.cx + FIELD.edgeR}
            y2={FIELD.cy}
            stroke="var(--i-signal)"
            strokeWidth={1.6 / camera.k}
            opacity={0.8}
          />
        </g>
      )}

      {/* ── EDGES ─────────────────────────────────────────────────────

          TWO CHANNELS, TWO QUESTIONS, AND THEY MUST NOT SHARE ONE.

          THE DASH SAYS WHOSE CLAIM IT IS. Solid is Signal's own attested
          record; a wide dash is Signal's own inference; a fine broken stitch
          is somebody else's. This channel is never overridden by focus,
          because "Signal Reality must remain distinguishable from external
          intelligence" has to hold whether or not something is selected.

          THE COLOUR, WEIGHT AND HEAD SAY WHAT KIND OF RELATIONSHIP IT IS,
          and only once the edge has woken:

            SEMANTIC    signal-coloured, full weight, arrowhead where the
                        verb is not symmetric. What this thing means.
            TEMPORAL    the same weight, and a DOUBLE head — the only place
                        on this field that mark appears. Supersession is the
                        one relation whose whole content is a direction in
                        time, so it gets the mark that reads as one.
            PROVENANCE  a fine neutral filament. How the thing is known is
                        not a statement about the project, and a finding with
                        nine citations must not read as nine claims.
            CONTEXTUAL  a hairline. Present because it is true, quiet because
                        `related_to` is most of the producer's corpus.

          AND A WOKEN EDGE CARRIES ITS VERB. Law 3: the reader must be able to
          say WHY two objects are joined without opening a panel. Only woken
          edges, only when the word will actually be legible, and never on the
          contextual hairline — labelling seventy `related_to` strokes is how
          you make a field nobody reads. */}
      {/* ── CONSTELLATION SHELLS ──────────────────────────────────────

          The aggregate layer. A shell says "these N things, and they are all
          Risks" — at a tier where naming all N would be a wall of text over
          the region it is trying to describe.

          IT IS NOT A NODE AND NEVER BECOMES ONE. No row, no ref, no truth
          status, nothing stored, no pointer events. Every mark inside it is a
          real node at its real seat, and the count is exactly how many of
          them there are.

          IT FADES AS ITS CONTENTS BECOME READABLE. At `far` it is the thing
          you see; at `medium` it is a boundary around forming marks; by
          `near` the members carry their own names and a shell would be a
          second, redundant claim about the same region. That is the whole
          disclosure ladder in one opacity. */}
      {aggShellOpacity > 0.01 && (
        <g data-shoot="graph-aggregates" style={{ pointerEvents: "none", transition: "opacity 220ms ease" }}>
          {/* THE BUNDLES, UNDER THE SHELLS. One strand per pair of groups,
              carrying how many real relationships it stands for. Weight goes
              as the square root of the count, so twenty-three reads as
              heavier than four without four reading as invisible — and the
              number itself is printed, because a thickness is an impression
              and a count is a fact. */}
          {bundles.map((bn) => {
            const mid = bundleMidpoint(bn.d);
            return (
              <g key={bn.id} opacity={aggShellOpacity * 0.75} data-shoot="aggregate-bundle" data-bundle-count={bn.count}>
                <path
                  d={bn.d}
                  fill="none"
                  stroke={WEB_STRAND_COLOR[bn.cls]}
                  strokeWidth={Math.min(4, 0.7 + Math.sqrt(bn.count) * 0.5)}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  opacity={0.3}
                />
                {bn.count > 2 && mid && (
                  <text
                    x={mid.x}
                    y={mid.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9 / camera.k}
                    fill={WEB_STRAND_COLOR[bn.cls]}
                    paintOrder="stroke"
                    stroke="var(--i-bg)"
                    strokeWidth={3 / camera.k}
                    strokeLinejoin="round"
                    opacity={0.85}
                  >
                    {bn.count}
                  </text>
                )}
              </g>
            );
          })}
          {aggregates.map((agg) => {
            // A homogeneous group may wear its type's colour, because every
            // mark inside really is that type. A mixed one may not: one hue
            // over mixed contents is a lie about what is in there.
            const tint = agg.homogeneous ? intelColor(agg.homogeneous) : "var(--i-text-soft)";
            const named = aggLabels.has(agg.id);
            // Outward, unless outward is off the screen — the same rule the
            // node labels follow, for the same reason.
            const sx = (agg.x - camera.x) * camera.k + size.w / 2;
            const flip = agg.x < FIELD.cx ? sx > LABEL_ROOM : sx > size.w - LABEL_ROOM;
            const off = agg.discR + 7 / camera.k;
            return (
              <g key={agg.id} opacity={aggShellOpacity} data-shoot={`aggregate-${agg.id}`} data-agg-count={agg.count}>
                {/* THE SHELL IS THE CLICK TARGET FOR ITS GROUP.
                    At the tiers where a constellation is one shape, the one
                    shape is what a reader points at — and what they get is a
                    panel about the group, not about whichever member happened
                    to be under the cursor. `pointer-events` is re-enabled
                    only on this ring, so the layer stays inert everywhere
                    else and never steals a click from a node. */}
                <circle
                  cx={agg.x}
                  cy={agg.y}
                  r={agg.discR}
                  fill={`color-mix(in srgb, ${tint} ${selectedId === agg.id ? 17 : 9}%, transparent)`}
                  stroke={tint}
                  strokeWidth={(selectedId === agg.id ? 2 : 1) / camera.k}
                  strokeOpacity={selectedId === agg.id ? 0.85 : 0.34}
                  role="button"
                  aria-label={`${agg.label}, ${agg.count} members`}
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect(selectedId === agg.id ? null : agg.id);
                  }}
                  data-shoot="aggregate-hit"
                />
                {/* A TYPE GROUP IS A REGION AND CARRIES ITS NAME. A SOURCE
                    GROUP IS A HUB AND DOES NOT — its artifact is a real node
                    sitting at the middle of it, and that node labels itself
                    from the constellation tier onward. Printing eleven
                    transcript names at project scale produced exactly the
                    stack of overlapping text this tier exists to avoid, over
                    the region it was trying to describe. */}
                {agg.kind === "type" && named && (
                  <text
                    x={agg.x + (flip ? -off : off)}
                    y={agg.y}
                    textAnchor={flip ? "end" : "start"}
                    dominantBaseline="middle"
                    fontSize={11 / camera.k}
                    letterSpacing={`${0.1 / camera.k}em`}
                    fill="var(--i-text)"
                    paintOrder="stroke"
                    stroke="var(--i-bg)"
                    strokeWidth={3 / camera.k}
                    strokeLinejoin="round"
                    style={{ textTransform: "uppercase" }}
                    data-shoot="aggregate-name"
                  >
                    {agg.label}
                  </text>
                )}
                {/* THE COUNT IS THE POINT, and it is short enough to survive
                    a crowd. A shell without it is a blob; with it, the reader
                    knows the scale of what they are looking at before
                    deciding whether to go in. */}
                <text
                  x={agg.kind === "type" && named ? agg.x + (flip ? -off : off) : agg.x}
                  y={agg.kind === "type" && named ? agg.y + 13 / camera.k : agg.y}
                  textAnchor={agg.kind === "type" && named ? (flip ? "end" : "start") : "middle"}
                  dominantBaseline="middle"
                  fontSize={10 / camera.k}
                  fill={tint}
                  paintOrder="stroke"
                  stroke="var(--i-bg)"
                  strokeWidth={3 / camera.k}
                  strokeLinejoin="round"
                  data-shoot="aggregate-count"
                >
                  {agg.count}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── A SELECTED REGION KEEPS ITS OUTLINE PAST THE TIER THAT DREW IT ──

          The shell layer switches off from NEAR inward, which is the whole
          point: the group has dissolved into the things it was standing for.
          But a reader who selected a region and then zoomed into it still has
          it selected — the panel is still describing it — and with the layer
          gone there was nothing on the field saying WHERE it was. You ended
          up reading about 59 observations while looking at an anonymous
          patch of marks.

          So one ring survives, and only one: the selected group's. No fill,
          no count, no name, no hit target — the members underneath are the
          things to click now. It is a boundary, which is exactly what the
          selection still means at this tier. */}
      {aggShellOpacity <= 0.01 &&
        (() => {
          const agg = aggregates.find((a) => a.id === selectedId);
          if (!agg) return null;
          const tint = agg.homogeneous ? intelColor(agg.homogeneous) : "var(--i-text-soft)";
          return (
            <circle
              cx={agg.x}
              cy={agg.y}
              r={agg.discR}
              fill="none"
              stroke={tint}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
              strokeOpacity={0.5}
              strokeDasharray="5 5"
              style={{ pointerEvents: "none" }}
              data-shoot="aggregate-outline"
            />
          );
        })()}

      {/* ── THE CALM-STATE WEB ────────────────────────────────────────

          Under everything, and never touchable. This is the layer that
          answers "is this a connected knowledge system" before anything is
          clicked — 385 of the corpus's 480 relationships, carried in 119
          paths, against the 44 the field used to draw at rest.

          It recedes rather than disappears when something is selected: the
          local world is what the reader is being asked to read, and the web
          becomes the ground it stands on.

          AND IT LEAVES AT THE EVIDENCE TIER, for the same reason the shells
          do. "Is this a connected knowledge system" is the question you ask
          from across the field; at 300% you are inside one constellation
          reading a quoted sentence, and a hairline that enters the frame at
          one edge and leaves at the other answers nothing you can act on.

          It is also, measured, the single most expensive thing the field
          draws at that range. Isolated by hiding one layer at a time during
          a drag at 450%: everything 50.1ms median / 83.4ms p95 — the web
          alone accounts for all of it, 16.7ms / 16.8ms without it, against
          33.3ms without the structure rings and 16.7ms without labels. 119
          paths that fit the viewport at Fit are, at that scale, 119 curves
          several viewport-widths long, and each one is clipped and stroked
          on every frame of every pan.

          So the layer is not merely faded — it is not rendered. A hidden
          element still costs its clip. */}
      {webOpacity > 0.01 && (
      <g
        data-shoot="graph-web"
        opacity={webOpacity}
        style={{ pointerEvents: "none", transition: "opacity 220ms ease" }}
        className={focus || soloNodes ? DEPTH_CLASS[1] : undefined}
      >
        {/* THE BUNDLED PROVENANCE MESH. Each path is one source artifact's
            whole fan — the passages Signal pulled out of it, and the external
            claims that quote them. Filaments share a waist so the fan reads
            as one stem opening rather than as N unrelated chords, which is
            the entire difference between structure and a hairball. */}
        {/* ONE OPACITY, ON THE GROUP. Putting the focus tier on each path
            meant that selecting anything rewrote 119 attributes — measured,
            it pushed a Trace from 240ms to 260ms, past its budget, for a
            change that is identical on every path in the layer. The group
            carries what focus changes; a path carries only what is true of
            that path forever. */}
        <g opacity={focus || soloNodes ? WEB.sheafFocused : WEB.sheaf} style={{ transition: "opacity 200ms ease" }}>
          {web.sheaves.map((sh) => (
            <path
              key={sh.id}
              d={sh.d}
              fill="none"
              // Signal's own extraction is source-blue; somebody else's
              // citation of it is slate. One mesh, two authorships, and the
              // eye can tell which without a legend.
              stroke={sh.kind === "extraction" ? "var(--i-source)" : "var(--i-slate)"}
              // NON-SCALING STROKE, so the width is a device fact rather than
              // a camera fact. Every other stroke on this field is written as
              // `n / camera.k`, which is correct and costs an attribute
              // rewrite on all 88 sheaves in every frame of every pan —
              // measured, part of a 94ms long task during a framing move.
              // These carry no dash pattern, so the one channel this
              // property is unreliable for is not in use here.
              strokeWidth={0.55}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              data-web="sheaf"
              data-web-kind={sh.kind}
              data-web-count={sh.count}
            />
          ))}
        </g>
        {/* AND THE RELATIONSHIPS WITH AUTHORITY, AS THEMSELVES. Every
            semantic and temporal edge, Signal's attested structure, and the
            lane spine into Reality. Faint, but a line rather than a filament,
            because each of these is a fact somebody could act on. */}
        <g opacity={focus || soloNodes ? WEB.strandFocused : WEB.strand} style={{ transition: "opacity 200ms ease" }}>
          {web.strands.map((st) =>
            // A STRAND THAT IS CURRENTLY BUNDLED IS NOT ALSO DRAWN.
            //
            // This is the fan-out, and it is the whole point of bundling:
            // while a constellation is one shape, its members' semantic and
            // temporal relationships are one strand with a count; as the
            // members resolve into individuals, that strand resolves into the
            // relationships it stood for. The same edges, at two grains,
            // never at once.
            drawnEdgeIds.has(st.id) || bundledEdgeIds.has(st.id) ? null : (
              <path
                key={`web-${st.id}`}
                d={st.d}
                fill="none"
                stroke={WEB_STRAND_COLOR[st.cls]}
                strokeWidth={(st.cls === "semantic" || st.cls === "temporal" ? 1 : 0.85) / camera.k}
                strokeDasharray={
                  st.basis === "external"
                    ? `${2.2 / camera.k} ${2.6 / camera.k}`
                    : st.basis === "inferred"
                      ? `${4 / camera.k} ${4 / camera.k}`
                      : undefined
                }
                // A temporal strand reaching into superseded history is
                // quieter than one between two live things — a property of
                // the relationship, not of the reader's attention, so it
                // lives on the path and never changes.
                opacity={st.current ? 1 : 0.6}
                data-web="strand"
                data-web-class={st.cls}
                data-rel={st.rel}
              />
            )
          )}
        </g>
      </g>
      )}

      <g data-shoot="graph-edges" style={{ pointerEvents: "none" }}>
        {drawnEdges.map((e) => {
          const op = edgeOpacity(e.id, e.basis);
          if (op < 0.02) return null;
          const woken = focus?.edges.get(e.id) ?? null;
          const soloLit = !!soloNodes && op > 0.5;
          const lit = woken != null || soloLit;
          // Provenance keeps its filament treatment even when a Trace lights
          // it — that IS the trace, and making it look like a semantic claim
          // would be the route lying about what it is.
          const filament = (woken ?? (soloLit ? "provenance" : null)) === "provenance";
          // FIVE CLASSES, FIVE MATERIALS. Hue and weight carry the class;
          // the dash still carries trust, untouched, because a channel that
          // meant both would mean neither.
          //
          //   SEMANTIC    signal cyan, full weight, arrowhead, verb
          //   TEMPORAL    cream — the one warm line on the field — with the
          //               double chevron that appears nowhere else. Sequence.
          //   PROVENANCE  source-blue filament, the same blue as the artifact
          //               it ends at, so object → passage → source reads as
          //               one continuous route rather than three hops
          //   CONTEXTUAL  a faint hairline
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
          // THE WORD IS ONLY DRAWN WHERE THERE IS ROOM FOR IT.
          //
          // Not gated on zoom: every label on this field is sized in `1/k`, so
          // a verb is always 9 device pixels whatever the camera is doing. The
          // thing that actually decides legibility is how long the LINE is on
          // screen — a word straddling a 20px stroke is illegible at every
          // zoom, and readable at every zoom once the stroke is 60px.
          //
          // And provenance labels are rationed rather than tiered: a finding
          // with nine citations does not need "cites" written nine times, but
          // an object with one is being asked exactly the question the word
          // answers.
          const chordPx = e.chord * camera.k;
          const showVerb =
            chordPx >= 58 &&
            (woken === "semantic" ||
              woken === "temporal" ||
              (woken === "provenance" && (level === "close" || (focus?.counts.provenance ?? 0) <= 4)));
          const anchorPt = showVerb ? e.anchor : null;
          const head = lit && woken !== "contextual" && e.directional ? e.tangent : null;
          return (
            <g key={e.id}>
              {/* A LUMINOUS UNDERLAY ON THE PROVENANCE ROUTE. Law: "object
                  → passage → source should read as one route". A wider, very
                  faint stroke of the same blue under the filament makes the
                  chain glow as a single continuous thing across the darker
                  field, which two separate hairlines never did. Drawn only
                  for the class that needs it, so it costs two extra strokes
                  on a focused route and nothing at rest. */}
              {filament && lit && (
                <path
                  d={e.d}
                  fill="none"
                  stroke="var(--i-source)"
                  strokeWidth={5 / camera.k}
                  strokeLinecap="round"
                  opacity={op * 0.22}
                  data-shoot="route-glow"
                />
              )}
              <path
                // ON THE PATH, WHERE THEY HAVE ALWAYS BEEN. The stroke is what
                // every screenshot pass and QA selector addresses; moving the
                // attributes up to the wrapper made "count the external edges
                // on the field" return zero without anything having changed
                // about the field.
                data-rel={e.rel}
                data-basis={e.basis}
                data-focus-class={woken ?? undefined}
                d={e.d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={weight / camera.k}
                strokeDasharray={
                  e.basis === "external"
                    ? `${2.2 / camera.k} ${2.6 / camera.k}`
                    : e.basis === "inferred"
                      ? `${4 / camera.k} ${4 / camera.k}`
                      : undefined
                }
                opacity={op}
                style={{ transition: "opacity 200ms ease" }}
              />
              {head && (
                <path
                  d={arrowHead(e.target.x, e.target.y, head, camera.k, e.target.r, woken === "temporal")}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={1.5 / camera.k}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={op}
                  data-shoot="edge-arrow"
                />
              )}
              {anchorPt && (
                <text
                  x={anchorPt.x}
                  y={anchorPt.y}
                  transform={`rotate(${anchorPt.angle.toFixed(1)} ${anchorPt.x.toFixed(1)} ${anchorPt.y.toFixed(1)})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9 / camera.k}
                  letterSpacing={`${0.06 / camera.k}em`}
                  fill={
                    filament ? "var(--i-source)" : woken === "temporal" ? "var(--i-text)" : "var(--i-signal)"
                  }
                  paintOrder="stroke"
                  stroke="var(--i-bg)"
                  strokeWidth={3 / camera.k}
                  strokeLinejoin="round"
                  // A WORD IS EITHER READABLE OR IT IS NOISE. The stroke's own
                  // opacity says how loud the RELATIONSHIP is; the label says
                  // what it is called, and a name at 62% of a faint grey is a
                  // smudge that costs paint and answers nothing.
                  opacity={Math.max(op, 0.88)}
                  data-shoot="edge-verb"
                  style={{ pointerEvents: "none" }}
                >
                  {e.verb}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* ── CLUSTER NAMES ─────────────────────────────────────────────
          Always legible, at every zoom — they are the map's legend, and the
          reference keeps its department labels up at all times too. */}
      <g data-shoot="graph-clusters">
        {CLUSTER_ORDER.map((cluster) => {
          const laneId = `lane:${cluster}`;
          // A lane is core, so it is always open — but guard anyway rather
          // than assume the slice.
          if (!graph.hasNode(laneId) || !opened.has(laneId)) return null;
          const attrs = graph.getNodeAttributes(laneId);
          const p = clusterLabelPoint(cluster);
          // THE COUNT IS THE MASS. It used to count every node attesting to
          // the lane, including the findings and features already drawn at
          // full size — so "+14" sat beside eighteen things and named none of
          // them. It now counts exactly the latent marks in this sector: what
          // you can see but cannot yet read, and precisely what expanding
          // will name.
          const childCount = latentByCluster.get(cluster) ?? 0;
          const isOpen = expanded.has(cluster);
          const dim = soloNodes || matches || focus ? 0.34 : 1;
          const flip = p.angle > 90 || p.angle < -90;
          // A cluster name is the map's legend, so it is never removed — but
          // it is text, and text on a dimmed field is the thing that keeps
          // pulling the eye. Softened, it stays available to anyone who looks
          // for it and stops competing with the local world.
          const soft = focus?.nodes.has(laneId) ? undefined : soloNodes || matches || focus ? DEPTH_CLASS[1] : undefined;
          return (
            <g
              key={cluster}
              opacity={dim}
              className={soft}
              style={{ transition: "opacity 200ms ease" }}
              data-shoot={`cluster-${cluster}`}
            >
              <text
                x={p.x}
                y={p.y}
                textAnchor={flip ? "end" : "start"}
                dominantBaseline="middle"
                fontSize={13 / camera.k}
                letterSpacing={`${0.14 / camera.k}em`}
                fill={attrs.supplied ? "var(--i-text)" : "var(--i-text-faint)"}
                style={{ textTransform: "uppercase", pointerEvents: "none" }}
                data-shoot="cluster-label"
              >
                {attrs.label}
              </text>
              {(childCount > 0 || isOpen) && (
                <text
                  x={p.x}
                  y={p.y + 15 / camera.k}
                  textAnchor={flip ? "end" : "start"}
                  dominantBaseline="middle"
                  fontSize={10.5 / camera.k}
                  fill="var(--i-text-faint)"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onToggleCluster(cluster);
                  }}
                  style={{ cursor: "pointer" }}
                  data-shoot={`cluster-toggle-${cluster}`}
                  data-latent={childCount}
                >
                  {isOpen ? "− collapse" : `+ ${childCount}`}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* ── REALITY ───────────────────────────────────────────────────
          The hero, and visibly a different KIND of object from everything
          orbiting it.

          AND IT IS CAPPED. Every other mark on this field is a few units
          across; Reality is 54, so at close zoom it grew into a planet that
          pushed the thing you had gone in to read off the screen. It now
          stops growing at 190 device pixels: still unmistakably the largest
          object on the field at any zoom, and never the reason you cannot see
          what you came for. The rings and the text scale with it, so it stays
          one object rather than a disc with a halo that outgrew it. */}
      <g data-shoot="graph-reality" style={{ pointerEvents: "none" }} data-core-scale={coreScale.toFixed(3)}>
        <circle cx={FIELD.cx} cy={FIELD.cy} r={(FIELD.coreR + 46) * coreScale} fill="url(#sg-core)" />
        {[FIELD.coreR + 16, FIELD.coreR + 7].map((r, i) => (
          <circle
            key={r}
            cx={FIELD.cx}
            cy={FIELD.cy}
            r={r * coreScale}
            fill="none"
            stroke="var(--i-signal)"
            strokeWidth={1 / camera.k}
            opacity={0.18 + i * 0.12}
          />
        ))}
        <circle
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={FIELD.coreR * coreScale}
          fill="var(--i-void)"
          stroke="var(--i-signal)"
          strokeWidth={1.7 / camera.k}
          opacity={0.94}
        />
        <text
          x={FIELD.cx}
          y={FIELD.cy - 6 * coreScale}
          textAnchor="middle"
          fontSize={Math.min(10 / camera.k, 14 * coreScale)}
          letterSpacing={`${0.18 / camera.k}em`}
          fill="var(--i-signal)"
          style={{ textTransform: "uppercase" }}
        >
          Accepted
        </text>
        <text
          x={FIELD.cx}
          y={FIELD.cy + 12 * coreScale}
          textAnchor="middle"
          fontSize={Math.min(17 / camera.k, 24 * coreScale)}
          fill="var(--i-text)"
        >
          Reality
        </text>
      </g>

      {/* ── NODES ─────────────────────────────────────────────────────── */}
      <g data-shoot="graph-nodes">
        {drawnNodes.map((id) => {
          const attrs = graph.getNodeAttributes(id);
          if (attrs.kind === "reality") return null; // drawn above, as the hero
          const p = layout.get(id)!;
          // A SUPERSEDED EXTERNAL OBJECT IS HISTORY, NOT NEWS.
          //
          // It keeps a real seat — the temporal chain that reaches it has to
          // land somewhere — but it stays a mark until something reaches it:
          // selected, hovered, in its neighbourhood, or lit by a solo. That
          // is what makes "supersedes" legible as an ARROW OUT OF THE PAST
          // rather than as two live objects that happen to be joined.
          const historical = attrs.kind === "intel" && attrs.isCurrent === false;
          // A SEARCH MATCH COUNTS AS REACHING IT. The same law the collapsed
          // clusters already run on: search reveals what it finds, and a
          // superseded object that matched and then stayed a nameless mark
          // reads as the search being broken rather than as the object being
          // history.
          const rank = focus?.nodes.get(id) ?? null;
          const reached =
            selectedId === id ||
            hoveredId === id ||
            (matches?.has(id) ?? false) ||
            (soloNodes?.has(id) ?? false) ||
            rank != null;
          const identity = identityOf(
            attrs.kind,
            openedNow.has(id) && (!historical || reached),
            level,
            // A SUPERSEDED OBJECT IS STILL HISTORY AT EVERY DISTANCE. Zoom
            // reveals what a thing is; it does not un-supersede it.
            resolvedByZoom && onScreen.has(id) && (!historical || reached)
          );
          const latent = identity === "latent";
          const depth = nodeDepth(id, latent);
          // A LABEL RUNS OUTWARD — UNLESS OUTWARD IS OFF THE SCREEN.
          //
          // Labels are anchored away from the centre so they do not run back
          // across the field. At the rim that sends the selected node's own
          // name past the edge of the viewport, which is the one label on
          // screen that must be legible: the framing law deliberately holds
          // the camera still, so the fix belongs here rather than in a pan.
          //
          // Computed ONLY for the two nodes that are already re-rendering —
          // the selection and whatever is under the cursor. Deriving it for
          // all four hundred would make every node's props change on every
          // frame of every pan, which is exactly the re-render the quantised
          // scale exists to prevent.
          const anchored = selectedId === id || hoveredId === id;
          const screenX = anchored ? (p.x - camera.x) * camera.k + size.w / 2 : 0;
          const labelInward =
            anchored && (p.x < FIELD.cx ? screenX < LABEL_ROOM : screenX > size.w - LABEL_ROOM);
          return (
            <GraphNode
              key={id}
              id={id}
              attrs={attrs}
              x={p.x}
              y={p.y}
              r={p.r}
              k={nodeScale}
              identity={identity}
              latentR={latentRadius(p.r, level, nodeScale)}
              // A latent mark recedes when something else is being explained,
              // for the same reason the cluster names do: it is orientation,
              // not the answer. It no longer recedes to near-nothing — the
              // softening carries that now, and a field of invisible dust is
              // a field you cannot navigate by.
              opacity={
                latent
                  ? soloNodes
                    ? TIER.latentDimmed
                    : matches || focus
                      ? FOCUS_TIER.unrelatedLatent
                      : LATENT[level].opacity
                  : nodeOpacity(id)
              }
              depth={depth}
              rank={rank}
              selected={selectedId === id}
              hovered={hoveredId === id}
              matched={matches?.has(id) ?? false}
              swept={swept.has((attrs.lane as string) ?? "")}
              labelInward={labelInward}
              degree={degreeOf.get(id) ?? 0}
              // A MARK YOU CANNOT REACH IS A DEAD END ON THE FIELD.
              //
              // Superseded history is drawn as a mark on purpose — it is not
              // news — but a mark has no pointer events, so the arrow the
              // temporal chain draws INTO it could not be followed. The one
              // thing on this field the reader is explicitly invited to look
              // at was the one thing they could not click.
              //
              // It stays a mark and becomes reachable. Not the same rule as a
              // collapsed cluster's contents, and deliberately: those have a
              // toggle that names them, and this has nothing else.
              reachable={historical && openedNow.has(id)}
              // A NEIGHBOUR THE SELECTION WOKE IS READABLE. Law 4: the eye
              // must be able to answer "what belongs to it" without zooming,
              // and a nameless glowing dot answers nothing. Contextual
              // neighbours are deliberately excluded — naming seventy
              // `related_to` partners is the density failure, not the fix.
              // ONE SOURCE OF TRUTH FOR EVERY NAME ON THE FIELD. The tier
              // says which kinds MAY be named; the plan says which of them
              // actually fit. Neither alone is enough — the first produced a
              // smear at close zoom, the second on its own would name things
              // the reader has not asked to see yet.
              labelled={labelPlan.has(id)}
              tabIndex={tabIndexOf.get(id) ?? -1}
              onSelect={onSelect}
              onHover={onHover}
            />
          );
        })}
      </g>
    </svg>
  );
}

// ── ONE NODE, IN ITS THREE DEGREES OF PRESENCE ─────────────────────────
//
// MEMOISED WITH REACT'S OWN SHALLOW COMPARISON, deliberately — no custom
// comparator. A hand-written comparator is how memoisation silently eats a
// state change: forget one prop and selection, dimming, search marking or
// identity quietly stops updating for some nodes and not others, which is
// invisible until someone is on a call. Every prop below is a primitive, a
// stable callback, or graphology's own attribute object (returned by
// reference, so it changes identity exactly when the graph is rebuilt) —
// which is precisely the shape shallow comparison handles correctly.
//
// What this buys: hovering, selecting, searching and expanding no longer
// re-render the nodes they did not touch, and a slow zoom no longer
// re-renders any of them (see `quantizeScale`). Proofs R1–R5 assert that
// every one of those states still arrives.
//
// Shape by kind, colour by state, size by importance in the reading order.
// Every node is a real focusable target with an accessible name that carries
// kind AND state in words — colour is never the only channel.
//
// THE LATENT MARK AND THE FORMED NODE ARE THE SAME ELEMENT. Both are always
// rendered, one of them at zero opacity, and expanding a cluster cross-fades
// between them over 260ms at a fixed seat. That is the whole trick: nothing
// mounts, nothing unmounts, nothing moves. The mark you were looking at
// becomes the thing it always was.
//
// Rendering both costs one extra <circle> per node, which at 65 nodes is not
// a cost. Mounting instead would cost the illusion.

const GraphNode = memo(function GraphNode({
  id,
  attrs,
  x,
  y,
  r,
  k,
  identity,
  latentR,
  opacity,
  selected,
  hovered,
  matched,
  swept,
  labelled,
  labelInward,
  degree,
  reachable,
  depth,
  rank,
  tabIndex,
  onSelect,
  onHover,
}: {
  id: string;
  attrs: AuditNodeAttributes;
  x: number;
  y: number;
  r: number;
  k: number;
  identity: Identity;
  latentR: number;
  opacity: number;
  selected: boolean;
  hovered: boolean;
  matched: boolean;
  swept: boolean;
  labelled: boolean;
  /** Draw the name toward the centre instead of away from it, because away
      from it is off the edge of the viewport. Only ever true for the selected
      or hovered node. */
  labelInward: boolean;
  /** Non-membership relationships this node actually has. */
  degree: number;
  /** Drawn as a mark, but still a pointer target. Superseded history only. */
  reachable: boolean;
  /** Optical depth. 0 sharp, 1 softened. See DEPTH_CLASS. */
  depth: Depth;
  /** What this node is to the current selection, or null when nothing is. */
  rank: FocusRank | null;
  tabIndex: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const latent = identity === "latent";
  const leftHalf = labelInward ? x >= FIELD.cx : x < FIELD.cx;
  const color = nodeColor(attrs);
  const shape = NODE_SHAPE[attrs.kind];
  const hollow = attrs.kind === "intel" && intelIsHollow(attrs.intelligenceType);
  const stroke = 1.4 / k;
  const grown = selected ? r * 1.35 : hovered ? r * 1.15 : r;

  const body = (() => {
    switch (shape) {
      case "diamond":
        return (
          <path
            d={`M ${x} ${y - grown} L ${x + grown} ${y} L ${x} ${y + grown} L ${x - grown} ${y} Z`}
            fill="var(--i-void)"
            stroke={color}
            strokeWidth={stroke}
          />
        );
      case "hex": {
        const pts = [0, 1, 2, 3, 4, 5]
          .map((i) => {
            const a = (Math.PI / 3) * i - Math.PI / 2;
            return `${(x + Math.cos(a) * grown).toFixed(1)},${(y + Math.sin(a) * grown).toFixed(1)}`;
          })
          .join(" ");
        return <polygon points={pts} fill="var(--i-void)" stroke={color} strokeWidth={stroke} />;
      }
      case "chip":
        return (
          <rect
            x={x - grown}
            y={y - grown * 0.78}
            width={grown * 2}
            height={grown * 1.56}
            rx={grown * 0.42}
            fill="var(--i-void)"
            stroke={color}
            strokeWidth={stroke}
          />
        );
      case "pin":
        // A finding points AT something — the one shape with a direction,
        // because a finding is the only kind that is an accusation.
        return (
          <path
            d={`M ${x} ${y + grown * 1.25} L ${x - grown} ${y - grown * 0.55} A ${grown} ${grown} 0 1 1 ${x + grown} ${y - grown * 0.55} Z`}
            fill={`color-mix(in srgb, ${color} 18%, var(--i-void))`}
            stroke={color}
            strokeWidth={stroke}
          />
        );
      case "figure":
        // Head and shoulders. Two strokes, no face, no photograph.
        return (
          <g>
            <circle
              cx={x}
              cy={y - grown * 0.46}
              r={grown * 0.42}
              fill={`color-mix(in srgb, ${color} 16%, var(--i-void))`}
              stroke={color}
              strokeWidth={stroke}
            />
            <path
              d={`M ${x - grown * 0.78} ${y + grown * 0.86} a ${grown * 0.78} ${grown * 0.86} 0 0 1 ${grown * 1.56} 0`}
              fill={`color-mix(in srgb, ${color} 16%, var(--i-void))`}
              stroke={color}
              strokeWidth={stroke}
            />
          </g>
        );
      case "tablet":
        // Upright, square-shouldered, with a rule across it. A statement, not
        // a document and not an accusation.
        return (
          <g>
            <rect
              x={x - grown * 0.66}
              y={y - grown}
              width={grown * 1.32}
              height={grown * 2}
              rx={grown * 0.16}
              fill={`color-mix(in srgb, ${color} 12%, var(--i-void))`}
              stroke={color}
              strokeWidth={stroke}
            />
            <line
              x1={x - grown * 0.34}
              y1={y}
              x2={x + grown * 0.34}
              y2={y}
              stroke={color}
              strokeWidth={stroke}
              opacity={0.8}
            />
          </g>
        );
      case "speech":
        // Something someone SAID: a rounded bubble with a tail.
        return (
          <path
            d={`M ${x - grown * 0.9} ${y - grown * 0.72} h ${grown * 1.8} a ${grown * 0.3} ${grown * 0.3} 0 0 1 ${grown * 0.3} ${grown * 0.3} v ${grown * 0.84} a ${grown * 0.3} ${grown * 0.3} 0 0 1 ${-grown * 0.3} ${grown * 0.3} h ${-grown * 1.1} l ${-grown * 0.5} ${grown * 0.5} v ${-grown * 0.5} h ${-grown * 0.2} a ${grown * 0.3} ${grown * 0.3} 0 0 1 ${-grown * 0.3} ${-grown * 0.3} v ${-grown * 0.84} a ${grown * 0.3} ${grown * 0.3} 0 0 1 ${grown * 0.3} ${-grown * 0.3} Z`}
            fill="var(--i-void)"
            stroke={color}
            strokeWidth={stroke}
          />
        );
      case "page":
        // Something WRITTEN DOWN: an upright page, ruled.
        return (
          <g>
            <rect
              x={x - grown * 0.7}
              y={y - grown}
              width={grown * 1.4}
              height={grown * 2}
              rx={grown * 0.12}
              fill="var(--i-void)"
              stroke={color}
              strokeWidth={stroke}
            />
            {[-0.34, 0.06, 0.46].map((dy) => (
              <line
                key={dy}
                x1={x - grown * 0.38}
                y1={y + grown * dy}
                x2={x + grown * 0.38}
                y2={y + grown * dy}
                stroke={color}
                strokeWidth={stroke * 0.8}
                opacity={0.65}
              />
            ))}
          </g>
        );
      case "frame":
        // Something DRAWN: a frame with a corner handle.
        return (
          <g>
            <rect
              x={x - grown * 0.92}
              y={y - grown * 0.78}
              width={grown * 1.84}
              height={grown * 1.56}
              rx={grown * 0.1}
              fill="var(--i-void)"
              stroke={color}
              strokeWidth={stroke}
            />
            <rect
              x={x + grown * 0.42}
              y={y + grown * 0.28}
              width={grown * 0.5}
              height={grown * 0.5}
              fill={color}
              opacity={0.55}
            />
          </g>
        );
      case "shard":
        // AN EXTERNAL CLAIM: an upward triangle whose stroke does not close.
        // Same grammar as the external edges — broken means somebody outside
        // Signal says so. The dash is sized in screen units so it survives at
        // a 4.6-unit node.
        //
        // AND IT NOW CARRIES A BODY, tinted with its own type's colour. At
        // 4.6 units a hollow outline is three faint dashes; a tinted body is
        // a mark you can name from across the field, which is the whole
        // point of giving the types colours at all.
        //
        // AN UNKNOWN STAYS GENUINELY EMPTY. Its entire content is that it has
        // no content yet — an open question the producer could not answer —
        // and an empty outline says that before any hue does. It is the one
        // external type whose form differs, because it is the one whose
        // MEANING is absence.
        return (
          <path
            d={`M ${x} ${y - grown * 1.15} L ${x + grown} ${y + grown * 0.72} L ${x - grown} ${y + grown * 0.72} Z`}
            fill={hollow ? "var(--i-void)" : `color-mix(in srgb, ${color} 34%, var(--i-void))`}
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${2.4 / k} ${1.8 / k}`}
            strokeLinejoin="round"
          />
        );
      case "doc":
        return (
          <path
            d={`M ${x - grown * 0.72} ${y - grown} h ${grown * 1.1} l ${grown * 0.34} ${grown * 0.34} v ${grown * 1.66} h ${-grown * 1.44} Z`}
            fill="var(--i-void)"
            stroke={color}
            strokeWidth={stroke}
          />
        );
      case "disc":
        return <circle cx={x} cy={y} r={grown} fill="var(--i-void)" stroke={color} strokeWidth={stroke * 1.2} />;
      default:
        return <circle cx={x} cy={y} r={grown} fill={color} stroke="none" />;
    }
  })();

  const accessibleName = [
    KIND_NAME[attrs.kind] ?? attrs.kind,
    attrs.label,
    attrs.tier ? `${attrs.tier} severity` : null,
    attrs.state ? `state ${attrs.state}` : null,
    attrs.needsHuman ? "needs human judgement" : null,
    attrs.handled ? "handled" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <g
      opacity={opacity}
      // DEPTH IS A CLASS, NOT AN INLINE FILTER. One compiled rule shared by
      // four hundred elements; see `.sg-depth-*` and the measurement in
      // scripts/audit-focus-measure.ts.
      className={DEPTH_CLASS[depth]}
      style={{ transition: "opacity 260ms ease" }}
      data-shoot={`node-${id}`}
      data-kind={attrs.kind}
      data-rank={rank ?? undefined}
      data-degree={degree}
      data-depth={depth}
      // The producer's own type string, for the same reason `data-kind` is
      // here: a QA pass and a screenshot script must be able to find "the
      // external Decision" without reading a label out of an accessible name.
      data-intel-type={attrs.kind === "intel" ? String(attrs.intelligenceType) : undefined}
      data-current={attrs.kind === "intel" ? String(attrs.isCurrent !== false) : undefined}
      data-identity={identity}
      data-selected={selected ? "true" : undefined}
      data-matched={matched ? "true" : undefined}
    >
      {/* LATENT: this node, before it is anything but population. Kept in the
          node's own colour rather than a uniform grey, so the Evidence rim
          reads faint and an intelligence package reads violet even while
          neither is readable — that is real information, from real rows. */}
      <circle
        cx={x}
        cy={y}
        r={latentR}
        fill={color}
        opacity={latent ? 1 : 0}
        style={{ transition: "opacity 260ms ease" }}
        aria-hidden="true"
        data-shoot="latent-mark"
      />

      {/* ── FUNCTIONAL GLOW ───────────────────────────────────────────

          Three levels of perceptual authority, and none of them decorative:

            SELECTED  three concentric falloffs. Unmistakable from across the
                      field, at any zoom, without having read a word.
            HOVERED   one ring — PRESELECTION authority. The reader is asking
                      "what about this one?" and the field answers before the
                      click, which is what makes a dense graph explorable by
                      sweeping rather than by clicking forty times.
            NEIGHBOUR a single soft ring on whatever the selection reached, so
                      "what belongs to it" is answerable by shape alone even
                      where the connecting line is off screen.

          Rings rather than a filter, deliberately: a blur on the node that
          must respond instantly would cost a rasterisation surface on exactly
          the wrong element, and would soften the one thing that has to be the
          sharpest on the field. Concentric strokes read as luminance and cost
          a stroke each. */}
      {!latent && selected && (
        <>
          <circle
            cx={x}
            cy={y}
            r={grown + 9 / k}
            fill="none"
            stroke={color}
            strokeWidth={2.5 / k}
            opacity={0.3}
            data-shoot="node-glow"
          />
          <circle cx={x} cy={y} r={grown + 15 / k} fill="none" stroke={color} strokeWidth={4 / k} opacity={0.15} />
          <circle cx={x} cy={y} r={grown + 23 / k} fill="none" stroke={color} strokeWidth={6 / k} opacity={0.06} />
        </>
      )}
      {!latent && !selected && hovered && (
        <circle
          cx={x}
          cy={y}
          r={grown + 10 / k}
          fill="none"
          stroke={color}
          strokeWidth={2.5 / k}
          opacity={0.22}
          data-shoot="node-preselect"
        />
      )}
      {!latent && !selected && !hovered && rank != null && rank !== "contextual" && (
        <circle
          cx={x}
          cy={y}
          r={grown + 7 / k}
          fill="none"
          stroke={color}
          strokeWidth={1.6 / k}
          opacity={rank === "provenance" ? 0.16 : 0.26}
          data-shoot="node-neighbour"
        />
      )}

      {/* Halo: selection, search match, or the sweep passing over. */}
      {!latent && (selected || matched || swept) && (
        <circle
          cx={x}
          cy={y}
          r={grown + 7 / k}
          fill="none"
          stroke={color}
          strokeWidth={(selected ? 1.5 : 1) / k}
          opacity={selected ? 0.75 : 0.4}
        />
      )}
      <g
        role={latent && !reachable ? undefined : "button"}
        tabIndex={latent && !reachable ? undefined : tabIndex}
        aria-label={latent && !reachable ? undefined : accessibleName}
        aria-hidden={latent && !reachable ? "true" : undefined}
        aria-pressed={latent && !reachable ? undefined : selected}
        className="sg-node"
        opacity={latent ? 0 : 1}
        style={{
          cursor: "pointer",
          outline: "none",
          transition: "opacity 260ms ease",
          pointerEvents: latent && !reachable ? "none" : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(selected ? null : id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(selected ? null : id);
          }
        }}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(id)}
        onBlur={() => onHover(null)}
      >
        {/* A generous invisible hit area: a 4px dot is not a click target. */}
        <circle cx={x} cy={y} r={Math.max(grown + 5 / k, 11 / k)} fill="transparent" />
        {body}
      </g>
      {/* A cluster puck's name is drawn once, in the cluster layer — labelling
          the node as well printed every cluster's name twice. */}
      {/* A LABEL RUNS OUTWARD, NOT ALWAYS RIGHTWARD.
          Every label used to sit to the node's right, so on the left half of
          the field it ran back across the map and collided with whatever it
          passed. Anchoring by side sends it away from the centre instead,
          which is also how the cluster names already behave. */}
      {!latent && labelled && attrs.kind !== "lane" && (
        <text
          x={x + (leftHalf ? -(grown + 6 / k) : grown + 6 / k)}
          y={y + 3.5 / k}
          textAnchor={leftHalf ? "end" : "start"}
          fontSize={(attrs.kind === "work" || attrs.kind === "passage" ? 9.5 : 11) / k}
          fill={selected || hovered || rank != null ? "var(--i-text)" : "var(--i-text-soft)"}
          // TEXT IS WHERE BLUR EARNS ITS KEEP. The eye works hardest to
          // resolve letterforms, so an unrelated label is the single loudest
          // thing on a dimmed field. It gets the second depth on top of the
          // group's — compounding to a little over a pixel, which is exactly
          // the point at which a word stops asking to be read and starts
          // reading as texture.
          className={depth > 0 ? DEPTH_CLASS[2] : undefined}
          style={{ pointerEvents: "none" }}
          data-shoot="node-label"
        >
          {truncate(fieldLabel(attrs), attrs.kind === "finding" ? 34 : attrs.kind === "passage" ? 40 : 30)}
        </text>
      )}
    </g>
  );
});

const KIND_NAME: Record<string, string> = {
  reality: "Reality",
  scope: "Project",
  lane: "Cluster",
  checkpoint: "Checkpoint",
  finding: "Finding",
  work: "Work item",
  feature: "Feature",
  decision: "Decision",
  decisionGate: "Decision gate",
  dependency: "Dependency",
  intelligence: "Intelligence package",
  passage: "Evidence passage",
  source: "Source",
  requirement: "Requirement",
  person: "Person",
  transcript: "Transcript",
  notion_page: "Notion page",
  figma_artifact: "Figma artifact",
  intel: "External intelligence",
};

/**
 * A STRAND'S COLOUR IS ITS CLASS, AT REST.
 *
 * The same families the woken edges use, so nothing changes meaning when it
 * wakes — a semantic line is cyan whether you are looking at it or not, and
 * a provenance filament is source-blue in both states. Waking changes
 * brightness, weight and whether it carries a word. It never changes what
 * kind of thing the line is.
 */
const WEB_STRAND_COLOR: Record<FocusClass, string> = {
  semantic: "var(--i-signal)",
  temporal: "var(--i-text)",
  provenance: "var(--i-source)",
  contextual: "var(--i-text-faint)",
};

/**
 * THE HEAD ON A WOKEN EDGE.
 *
 * Drawn as an explicit path rather than an SVG `marker`, for one reason: a
 * marker cannot be scaled per-use, and every stroke on this field is sized in
 * `1/k` so that it stays the same number of device pixels at any zoom. A
 * marker would be correct at exactly one camera scale and wrong at every
 * other.
 *
 * It sits at the RIM of the target, not at its centre, so the head reads as
 * arriving at the object rather than as buried inside it.
 *
 * `double` is the temporal mark, and it appears nowhere else on this field. A
 * chevron behind a chevron reads as motion along the line — which is exactly
 * what `supersedes` and `resolves` are: not "A relates to B" but "A came
 * after B and replaced it".
 */
function arrowHead(
  x: number,
  y: number,
  t: { x: number; y: number },
  k: number,
  r: number,
  double: boolean
): string {
  const back = r + 3 / k;
  const len = 6.5 / k;
  const spread = 0.62;
  const draw = (offset: number) => {
    const tipX = x - t.x * (back + offset);
    const tipY = y - t.y * (back + offset);
    const bx = -t.x;
    const by = -t.y;
    const c = Math.cos(spread);
    const sn = Math.sin(spread);
    const ax = tipX + (bx * c - by * sn) * len;
    const ay = tipY + (bx * sn + by * c) * len;
    const cx2 = tipX + (bx * c + by * sn) * len;
    const cy2 = tipY + (-bx * sn + by * c) * len;
    return `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${tipX.toFixed(1)} ${tipY.toFixed(1)} L ${cx2.toFixed(1)} ${cy2.toFixed(1)}`;
  };
  return double ? `${draw(0)} ${draw(len * 0.72)}` : draw(0);
}

/**
 * Trim a label to fit, KEEPING THE END WHEN THE END IS WHAT DISTINGUISHES IT.
 *
 * A source artifact's label is its ref, and the producer's refs are URIs:
 * `ke://source/transcript/2026-08-19_KE-User-Interview-Follow-Up`. Cut from
 * the front at 28 characters and thirty transcripts all read
 * `ke://source/transcript/2026…` — the same string, thirty times, in one
 * sector. Everything that tells them apart is in the part that was thrown
 * away.
 *
 * So a path-shaped label is trimmed from the LEFT instead, which is the
 * convention every file browser and terminal already uses for the same
 * reason. Ordinary prose labels — a finding's title, a claim's statement —
 * still trim from the right, because there the beginning is what matters.
 */
function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const pathShaped = s.includes("://") || s.split("/").length > 2;
  return pathShaped ? `…${s.slice(s.length - (n - 1))}` : `${s.slice(0, n - 1)}…`;
}

/** Fit the whole field in view — the "reset" the reference offers as a
    home button, and what the instrument opens at. */
export function fitCamera(extent: number = RECORD_EXTENT, vp?: { w: number; h: number }): Camera {
  // FIT MUST ACTUALLY FIT. External intelligence seats outside the record's
  // edge, so a fixed zoom would push the outermost band off screen at the one
  // moment the user asked to see everything.
  //
  // The comparison is against RECORD_EXTENT — how far Signal's own material
  // reaches, which is what the default zoom was chosen for — so a Scope with
  // no external intelligence comes back at exactly the zoom it always did.
  //
  // ── AND IT MUST FIT THE SCREEN IT IS ON ───────────────────────────────
  //
  // 0.72 was chosen against a viewport at least ~870px tall. Measured on a
  // 1440×900 window the graph gets 856px, the record is 1194 world units
  // across, and the field overflowed the view by 5% — "Fit" that does not fit
  // was still shipping, just less obviously than before.
  //
  // It matters more now than it did: the framing law's first rule is "if the
  // neighbourhood is already visible, do not move", and at a Fit that does
  // not fit, selecting anything near the rim was legitimately a camera move.
  // Every selection at the home camera nudged the field. Making Fit honest
  // makes the whole selection grammar hold still.
  //
  // This can only ever REDUCE the zoom from the historic value, so on a
  // window tall enough for the original constant nothing changes at all.
  const base = DEFAULT_CAMERA.k * (RECORD_EXTENT / Math.max(RECORD_EXTENT, extent));
  // The field must land INSIDE the framing law's trigger inset, not exactly
  // on the frame edge — otherwise Fit is a view in which every rim node is
  // one pixel from needing a camera move, and the first click pans.
  const k =
    vp && vp.w > 0 && vp.h > 0
      ? Math.min(base, (Math.min(vp.w, vp.h) * (1 - 2 * FRAME_SLACK)) / (2 * extent))
      : base;
  return { x: FIELD.cx, y: FIELD.cy, k: Math.max(MIN_ZOOM, k) };
}

/** Centre on one node without changing zoom — the reference's "fly to". */
export function focusCamera(layout: GraphLayout, id: string, camera: Camera, k?: number): Camera {
  const p = layout.get(id);
  if (!p) return camera;
  return { x: p.x, y: p.y, k: k ?? Math.max(camera.k, 1.6) };
}

/**
 * How much screen a label needs beside its node.
 *
 * 28 characters at 11px in this face is a little under 170px; 186 leaves the
 * gap between the node and the first letter. In DEVICE pixels, not world
 * units — every label on this field is sized in `1/k`, so its width on screen
 * is the same at every zoom.
 */
const LABEL_ROOM = 186;

/**
 * The most names that may be on screen at once.
 *
 * Not a rendering limit — it is a reading limit. Past roughly sixty, a field
 * of labels stops being something anybody reads and becomes texture, and the
 * sixty-first is displacing one somebody might have wanted.
 */
const LABEL_BUDGET = 60;

/**
 * Which kinds get first refusal on the space, when two names want it.
 *
 * Roughly: the project's own structure, then its disagreements, then the
 * external claims about it, then the substrate they were read from. Within a
 * kind the tie is broken by how connected the node actually is, so a hub
 * outranks a leaf and a leaf nothing refers to goes last.
 */
const LABEL_PRIORITY: NodeKind[] = [
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
const CORE_MAX_PX = 190;

/** The middle of a bundle's own curve, where its count is printed. Parsed
    back out of the path rather than recomputed, so the number can never end
    up somewhere the line is not. */
function bundleMidpoint(d: string): { x: number; y: number } | null {
  const m = d.match(/^M ([-\d.]+) ([-\d.]+) Q ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+)$/);
  if (!m) return null;
  const [ax, ay, cx, cy, bx, by] = m.slice(1).map(Number);
  return { x: (ax + 2 * cx + bx) / 4, y: (ay + 2 * cy + by) / 4 };
}

export type { GraphLayout };
export { layoutGraph };
export type AuditGraphType = Graph;
