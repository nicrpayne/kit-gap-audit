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
  type GraphLayout,
} from "@/lib/audit/graphLayout";
import {
  NODE_SHAPE,
  nodeColor,
  TIER,
  FOCUS_TIER,
  FOCUS_EDGE,
  DEPTH_CLASS,
  LATENT,
  latentRadius,
  identityOf,
  type Depth,
  type ZoomLevel,
  type Identity,
} from "./graphTokens";
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
  const nodeDepth = (id: string, latent: boolean): Depth => {
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
    if (!focus) return opened;
    let extra: Set<string> | null = null;
    for (const id of focus.frame) {
      if (opened.has(id)) continue;
      if (!extra) extra = new Set(opened);
      extra.add(id);
    }
    return extra ?? opened;
  }, [focus, opened]);

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
      out.push({
        id: e,
        from: s,
        to: t,
        rel: a.rel,
        basis: a.basis,
        cls,
        verb,
        directional: verbIsDirectional(verb),
      });
    });
    return out;
  }, [graph, openedNow, layout, anchorId, soloNodes]);

  /** Latent nodes per cluster — what "+N" is actually counting. */
  const latentByCluster = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of drawnNodes) {
      if (openedNow.has(n)) continue;
      const lane = graph.getNodeAttribute(n, "lane") as string | undefined;
      if (lane) m.set(lane, (m.get(lane) ?? 0) + 1);
    }
    return m;
  }, [drawnNodes, openedNow, graph]);

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
      <g data-shoot="graph-edges" style={{ pointerEvents: "none" }}>
        {drawnEdges.map((e) => {
          const a = layout.get(e.from)!;
          const b = layout.get(e.to)!;
          const op = edgeOpacity(e.id, e.basis);
          if (op < 0.02) return null;
          const woken = focus?.edges.get(e.id) ?? null;
          const soloLit = !!soloNodes && op > 0.5;
          const lit = woken != null || soloLit;
          // Provenance keeps its filament treatment even when a Trace lights
          // it — that IS the trace, and making it look like a semantic claim
          // would be the route lying about what it is.
          const filament = (woken ?? (soloLit ? "provenance" : null)) === "provenance";
          const strokeColor = !lit
            ? "var(--i-text-soft)"
            : filament
              ? "var(--i-text-soft)"
              : woken === "contextual"
                ? "var(--i-text-faint)"
                : "var(--i-signal)";
          const weight = !lit ? 1 : woken === "contextual" ? 0.8 : filament ? 1.15 : 1.9;
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
          const chordPx = Math.hypot(b.x - a.x, b.y - a.y) * camera.k;
          const showVerb =
            chordPx >= 58 &&
            (woken === "semantic" ||
              woken === "temporal" ||
              (woken === "provenance" && (level === "close" || (focus?.counts.provenance ?? 0) <= 4)));
          const anchorPt = showVerb ? edgeLabelAnchor(a, b) : null;
          const head = lit && woken !== "contextual" && e.directional ? edgeEndTangent(a, b) : null;
          return (
            <g key={e.id}>
              <path
                // ON THE PATH, WHERE THEY HAVE ALWAYS BEEN. The stroke is what
                // every screenshot pass and QA selector addresses; moving the
                // attributes up to the wrapper made "count the external edges
                // on the field" return zero without anything having changed
                // about the field.
                data-rel={e.rel}
                data-basis={e.basis}
                data-focus-class={woken ?? undefined}
                d={edgePath(a, b)}
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
                  d={arrowHead(b.x, b.y, head, camera.k, b.r, woken === "temporal")}
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
                  fill={filament ? "var(--i-text-soft)" : "var(--i-signal)"}
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
          orbiting it. */}
      <g data-shoot="graph-reality" style={{ pointerEvents: "none" }}>
        <circle cx={FIELD.cx} cy={FIELD.cy} r={FIELD.coreR + 46} fill="url(#sg-core)" />
        {[FIELD.coreR + 16, FIELD.coreR + 7].map((r, i) => (
          <circle
            key={r}
            cx={FIELD.cx}
            cy={FIELD.cy}
            r={r}
            fill="none"
            stroke="var(--i-signal)"
            strokeWidth={1 / camera.k}
            opacity={0.18 + i * 0.12}
          />
        ))}
        <circle
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={FIELD.coreR}
          fill="var(--i-void)"
          stroke="var(--i-signal)"
          strokeWidth={1.7 / camera.k}
          opacity={0.94}
        />
        <text
          x={FIELD.cx}
          y={FIELD.cy - 6}
          textAnchor="middle"
          fontSize={10 / camera.k}
          letterSpacing={`${0.18 / camera.k}em`}
          fill="var(--i-signal)"
          style={{ textTransform: "uppercase" }}
        >
          Accepted
        </text>
        <text x={FIELD.cx} y={FIELD.cy + 12} textAnchor="middle" fontSize={17 / camera.k} fill="var(--i-text)">
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
          const identity = identityOf(attrs.kind, openedNow.has(id) && (!historical || reached), level);
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
              // A NEIGHBOUR THE SELECTION WOKE IS READABLE. Law 4: the eye
              // must be able to answer "what belongs to it" without zooming,
              // and a nameless glowing dot answers nothing. Contextual
              // neighbours are deliberately excluded — naming seventy
              // `related_to` partners is the density failure, not the fix.
              labelled={
                identity === "named" ||
                selectedId === id ||
                hoveredId === id ||
                (rank != null && rank !== "contextual")
              }
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
        return (
          <path
            d={`M ${x} ${y - grown * 1.15} L ${x + grown} ${y + grown * 0.72} L ${x - grown} ${y + grown * 0.72} Z`}
            fill="var(--i-void)"
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

      {/* THE GLOW — one node on the field wears it, and only while it is the
          thing being explained.

          Two soft rings rather than a filter: a blur on the selected node
          would cost a rasterisation surface on the one element that has to
          respond instantly, and would soften the very thing Law 4 says must
          be the sharpest. Concentric falloff reads as luminance and costs two
          strokes. */}
      {!latent && selected && (
        <>
          <circle
            cx={x}
            cy={y}
            r={grown + 12 / k}
            fill="none"
            stroke={color}
            strokeWidth={3 / k}
            opacity={0.14}
            data-shoot="node-glow"
          />
          <circle cx={x} cy={y} r={grown + 18 / k} fill="none" stroke={color} strokeWidth={5 / k} opacity={0.06} />
        </>
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
        role={latent ? undefined : "button"}
        tabIndex={latent ? undefined : tabIndex}
        aria-label={latent ? undefined : accessibleName}
        aria-hidden={latent ? "true" : undefined}
        aria-pressed={latent ? undefined : selected}
        className="sg-node"
        opacity={latent ? 0 : 1}
        style={{
          cursor: "pointer",
          outline: "none",
          transition: "opacity 260ms ease",
          pointerEvents: latent ? "none" : undefined,
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
        >
          {truncate(String(attrs.label), attrs.kind === "finding" ? 34 : 28)}
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

export type { GraphLayout };
export { layoutGraph };
export type AuditGraphType = Graph;
