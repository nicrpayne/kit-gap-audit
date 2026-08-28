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
  clusterLabelPoint,
  CLUSTER_ORDER,
  type GraphLayout,
} from "@/lib/audit/graphLayout";
import {
  NODE_SHAPE,
  nodeColor,
  TIER,
  MEMBERSHIP_RELS,
  LATENT,
  latentRadius,
  identityOf,
  type ZoomLevel,
  type Identity,
} from "./graphTokens";
import {
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  quantizeScale,
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
  "source",
  "checkpoint",
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
}: SignalGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 800 });
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
      setSize({ w: r.width || 1000, h: r.height || 800 });
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
    (e.target as Element).setPointerCapture?.(e.pointerId);
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
  // Selection lights a node's own neighbourhood: the edges it actually has,
  // membership excluded. Nothing is reached transitively — a neighbourhood is
  // one hop, or it is the whole graph.
  const focus = useMemo(() => {
    const anchor = selectedId ?? hoveredId;
    if (!anchor || !graph.hasNode(anchor)) return null;
    const nodes = new Set<string>([anchor]);
    const edges = new Set<string>();
    for (const e of graph.edges(anchor)) {
      if (MEMBERSHIP_RELS.has(graph.getEdgeAttribute(e, "rel"))) continue;
      edges.add(e);
      nodes.add(graph.source(e));
      nodes.add(graph.target(e));
    }
    return { nodes, edges };
  }, [selectedId, hoveredId, graph]);

  /** How loudly a node speaks right now. */
  const nodeOpacity = (id: string): number => {
    if (soloNodes) return soloNodes.has(id) ? TIER.focus : TIER.soloDimmed;
    if (matches) return matches.has(id) ? TIER.focus : TIER.dimmed;
    if (focus) return focus.nodes.has(id) ? TIER.focus : TIER.dimmed;
    return TIER.rest;
  };

  const edgeOpacity = (edge: string, basis: string): number => {
    if (soloNodes) {
      const lit = soloNodes.has(graph.source(edge)) && soloNodes.has(graph.target(edge));
      return lit ? 0.95 : TIER.soloDimmed * 0.5;
    }
    if (focus) return focus.edges.has(edge) ? 0.95 : TIER.dimmed * 0.5;
    if (matches) return TIER.dimmed * 0.6;
    return basis === "attested" ? TIER.attestedRest : TIER.inferredRest;
  };

  // ── WHAT IS DRAWN ────────────────────────────────────────────────────
  //
  // EVERY SEATED NODE. A collapsed cluster no longer means "not here", it
  // means "not yet itself" — the difference between a field that admits how
  // big the project is and one that pretends 41 of its 65 things do not
  // exist.
  const drawnNodes = useMemo(() => graph.nodes().filter((n) => layout.has(n)), [graph, layout]);

  // DENSE NODES DO NOT REQUIRE DENSE EDGES.
  //
  // Latent marks carry no lines. Drawing every relationship the moment every
  // node is on screen is precisely the hairball this layout was built to
  // avoid, and an edge to something with no name on it explains nothing
  // anyway. An edge appears when BOTH its endpoints have been opened.
  const drawnEdges = useMemo(() => {
    const out: { id: string; from: string; to: string; rel: string; basis: string }[] = [];
    graph.forEachEdge((e, a, s, t) => {
      // MEMBERSHIP IS NEVER AN EDGE. See the header.
      if (MEMBERSHIP_RELS.has(a.rel)) return;
      if (!opened.has(s) || !opened.has(t)) return;
      if (!layout.has(s) || !layout.has(t)) return;
      out.push({ id: e, from: s, to: t, rel: a.rel, basis: a.basis });
    });
    return out;
  }, [graph, opened, layout]);

  /** Latent nodes per cluster — what "+N" is actually counting. */
  const latentByCluster = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of drawnNodes) {
      if (opened.has(n)) continue;
      const lane = graph.getNodeAttribute(n, "lane") as string | undefined;
      if (lane) m.set(lane, (m.get(lane) ?? 0) + 1);
    }
    return m;
  }, [drawnNodes, opened, graph]);

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
      drawnNodes.filter((n) => opened.has(n)).sort((a, b) => {
        const aa = graph.getNodeAttributes(a);
        const ba = graph.getNodeAttributes(b);
        const k = KIND_ORDER.indexOf(aa.kind) - KIND_ORDER.indexOf(ba.kind);
        if (k !== 0) return k;
        return String(aa.label).localeCompare(String(ba.label));
      }),
    [drawnNodes, opened, graph]
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
      <g opacity={TIER.structure} style={{ pointerEvents: "none" }} data-shoot="graph-structure">
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
        <g opacity={TIER.structure * 1.6} style={{ pointerEvents: "none" }}>
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
          Relationships only. Attested solid, inferred dashed — the epistemic
          basis is visible before anything is clicked. */}
      <g data-shoot="graph-edges" style={{ pointerEvents: "none" }}>
        {drawnEdges.map((e) => {
          const a = layout.get(e.from)!;
          const b = layout.get(e.to)!;
          const op = edgeOpacity(e.id, e.basis);
          if (op < 0.02) return null;
          const lit = focus?.edges.has(e.id) || (soloNodes && op > 0.5);
          return (
            <path
              key={e.id}
              d={edgePath(a, b)}
              fill="none"
              stroke={lit ? "var(--i-signal)" : "var(--i-text-soft)"}
              strokeWidth={(lit ? 1.8 : 1) / camera.k}
              strokeDasharray={e.basis === "inferred" ? `${4 / camera.k} ${4 / camera.k}` : undefined}
              opacity={op}
              data-rel={e.rel}
              data-basis={e.basis}
              style={{ transition: "opacity 200ms ease" }}
            />
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
          return (
            <g
              key={cluster}
              opacity={dim}
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
          const identity = identityOf(attrs.kind, opened.has(id), level);
          const latent = identity === "latent";
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
              // A latent mark recedes further when something else is being
              // explained, for the same reason the cluster names do: it is
              // orientation, not the answer.
              opacity={
                latent
                  ? soloNodes || matches || focus
                    ? TIER.latentDimmed
                    : LATENT[level].opacity
                  : nodeOpacity(id)
              }
              selected={selectedId === id}
              hovered={hoveredId === id}
              matched={matches?.has(id) ?? false}
              swept={swept.has((attrs.lane as string) ?? "")}
              labelled={identity === "named" || selectedId === id || hoveredId === id}
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
  tabIndex: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const latent = identity === "latent";
  const leftHalf = x < FIELD.cx;
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
      style={{ transition: "opacity 260ms ease" }}
      data-shoot={`node-${id}`}
      data-kind={attrs.kind}
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
          fill={selected || hovered ? "var(--i-text)" : "var(--i-text-soft)"}
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
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Fit the whole field in view — the "reset" the reference offers as a
    home button, and what the instrument opens at. */
export function fitCamera(): Camera {
  return { ...DEFAULT_CAMERA };
}

/** Centre on one node without changing zoom — the reference's "fly to". */
export function focusCamera(layout: GraphLayout, id: string, camera: Camera, k?: number): Camera {
  const p = layout.get(id);
  if (!p) return camera;
  return { x: p.x, y: p.y, k: k ?? Math.max(camera.k, 1.6) };
}

export type { GraphLayout };
export { layoutGraph };
export type AuditGraphType = Graph;
