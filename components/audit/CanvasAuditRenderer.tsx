"use client";

// THE CANVAS PAINTER, AS A REACT COMPONENT.
//
// It implements exactly the same contract the SVG renderer does — see
// ./renderer/types — and it owns exactly the visual world: a canvas, a render
// loop, hit geometry, and the pointer gestures that move the camera.
//
// EVERYTHING ELSE STAYS OUTSIDE. Selection, search, the inspector, Findings,
// actions, Reality controls, provenance, keyboard commands, Back/Forward and
// routing are the instrument's, unchanged, and this file neither reads nor
// writes them. What is selected arrives as a prop and leaves as a callback;
// nothing about it is stored here.
//
// ── THE ONE THING A CANVAS TAKES AWAY, AND HOW IT IS GIVEN BACK ────────
//
// The SVG renderer's own header says it keeps "every node a real focusable
// element with an accessible name — which a WebGL canvas cannot". That is
// true and it is the strongest argument against this whole slice, so it is
// answered directly rather than deferred: every node the SVG would have made
// focusable is a real focusable button here too, in the same keyboard order,
// carrying the same accessible name. They are visually hidden because the
// canvas is already drawing them, and the canvas draws a focus ring for
// whichever one the keyboard is on, so a keyboard user sees where they are.
//
// A canvas that only works with a mouse is not done. This one does not.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildScene,
  buildSceneCache,
  type AuditScene,
} from "@/lib/audit/visualScene";
import {
  layoutGraph,
  clusterLabelPoint,
  CLUSTER_ORDER,
  type GraphLayout,
} from "@/lib/audit/graphLayout";
import { MAX_ZOOM, MIN_ZOOM, quantizeScale } from "./cameraMotion";
import type { AuditRendererProps } from "./renderer/types";
import { screenToWorld } from "./renderer/types";
import { TokenPalette } from "./canvas/paintTokens";
import { SpriteCache } from "./canvas/sprites";
import { PathCache, paintScene, releaseLayer, type PaintStats } from "./canvas/painter";
import { HitIndex, hitRadiusOf } from "./canvas/hitTest";

/** Exposed for the harness: the last frame's paint statistics, and a rolling
    frame-time sample. Read from the browser by the comparison shoot, which is
    the only way "how many draw calls" can be a measured number rather than a
    claim. */
declare global {
  interface Window {
    __signalCanvas?: {
      stats: PaintStats | null;
      frames: number[];
      hitTests: number[];
      repaints: number;
    };
  }
}

export default function CanvasAuditRenderer(props: AuditRendererProps) {
  const {
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
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 800 });
  const viewportRef = useRef(onViewport);
  viewportRef.current = onViewport;

  // ── LAYOUT AND SCENE ─────────────────────────────────────────────────
  //
  // THE CURRENT SIGNAL COORDINATES, UNTOUCHED. No physics, no retargeting,
  // no morph — this slice changes the painter and nothing else, so that "how
  // much of the feel is the renderer" is a question the comparison can
  // actually answer.
  const layout: GraphLayout = useMemo(() => layoutGraph(graph), [graph]);
  const sceneCache = useMemo(() => buildSceneCache(graph, layout), [graph, layout]);

  // THE SCENE IS QUANTISED AGAINST THE CAMERA, exactly as the SVG's label
  // plan and viewport filter are. Which names fit and what is on screen
  // depend on where the camera is, in principle every frame — and rebuilding
  // 427 node projections and a sixty-name collision pass on every frame of
  // every wheel gesture is the single easiest way to make this slower than
  // the renderer it is being compared against.
  //
  // Twelve device pixels of pan and one quantised zoom step. The camera the
  // PAINTER uses stays exactly continuous; only what is DERIVED from it steps.
  const nodeScale = useMemo(() => quantizeScale(camera.k), [camera.k]);
  const planKey =
    `${Math.round((camera.x * camera.k) / 12)}:${Math.round((camera.y * camera.k) / 12)}:${nodeScale.toFixed(3)}`;

  const scene: AuditScene = useMemo(
    () =>
      buildScene(
        {
          graph,
          layout,
          camera: { x: camera.x, y: camera.y, k: nodeScale },
          viewport: size,
          level,
          opened,
          selectedId,
          hoveredId,
          matches,
          soloNodes,
          swept,
        },
        sceneCache
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, layout, sceneCache, planKey, size.w, size.h, level, opened, selectedId, hoveredId, matches, soloNodes, swept]
  );

  // Cluster legends are the map's own, and they are always drawn.
  const clusterLabels = useMemo(
    () =>
      CLUSTER_ORDER.filter((c) => graph.hasNode(`lane:${c}`) && opened.has(`lane:${c}`)).map((c) => {
        const p = clusterLabelPoint(c);
        const attrs = graph.getNodeAttributes(`lane:${c}`);
        return {
          cluster: c as string,
          x: p.x,
          y: p.y,
          label: String(attrs.label ?? c),
          latent: scene.latentByCluster.get(c) ?? 0,
          // The same test the SVG makes: a sector on the far side of the
          // field anchors its name inward so it does not run off the edge.
          flip: p.angle > 90 || p.angle < -90,
          open: expanded.has(c),
          supplied: attrs.supplied !== false,
        };
      }),
    [graph, opened, expanded, scene.latentByCluster]
  );

  // ── PAINT MACHINERY, HELD ACROSS FRAMES ──────────────────────────────
  const palette = useRef<TokenPalette>(new TokenPalette(null));
  const sprites = useRef<SpriteCache>(new SpriteCache());
  const paths = useRef<PathCache>(new PathCache());
  const hits = useRef<HitIndex>(new HitIndex());
  const fontFamily = useRef<string>("system-ui, sans-serif");

  // ── MEASUREMENT ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = hostRef.current;
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

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    palette.current.attach(el);
    fontFamily.current = getComputedStyle(el).fontFamily || "system-ui, sans-serif";
    return () => releaseLayer();
  }, []);

  // Reduced motion is asked once and then watched: someone who turns it on
  // mid-session has asked this instrument too.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ── THE HIT INDEX ────────────────────────────────────────────────────
  useEffect(() => {
    hits.current.build(scene, nodeScale);
  }, [scene, nodeScale]);

  // ── THE RENDER LOOP ──────────────────────────────────────────────────
  //
  // rAF-driven and DIRTY-FLAGGED. A canvas that repaints unconditionally at
  // 60Hz burns a core to show a field that has not changed — the resting
  // state of this instrument is most of its life. So a frame is scheduled
  // when something that affects pixels changes, and the loop keeps running
  // only while something is genuinely animating.
  const dirty = useRef(true);
  const rafRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const clusterRef = useRef(clusterLabels);
  clusterRef.current = clusterLabels;
  const sweepRef = useRef(sweepAngle);
  sweepRef.current = sweepAngle;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const focusedRef = useRef<string | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vp = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(vp.w * dpr));
    const H = Math.max(1, Math.round(vp.h * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      sprites.current.setDpr(dpr);
    }
    const t0 = performance.now();
    const stats = paintScene({
      ctx,
      scene: sceneRef.current,
      // THE PAINTER GETS THE EXACT CAMERA. Only the scene derivation is
      // stepped; pan and zoom stay perfectly continuous on screen.
      camera: getCamera(),
      viewport: vp,
      dpr,
      palette: palette.current,
      sprites: sprites.current,
      paths: paths.current,
      reducedMotion: reducedRef.current,
      time: t0,
      sweepAngle: sweepRef.current,
      fontFamily: fontFamily.current,
      clusterLabels: clusterRef.current,
    });
    const dt = performance.now() - t0;

    const probe = (window.__signalCanvas ??= { stats: null, frames: [], hitTests: [], repaints: 0 });
    probe.stats = stats;
    probe.repaints++;
    probe.frames.push(dt);
    if (probe.frames.length > 400) probe.frames.shift();
  }, [getCamera]);

  const invalidate = useCallback(() => {
    dirty.current = true;
    if (rafRef.current != null) return;
    const tick = () => {
      rafRef.current = null;
      if (!dirty.current) return;
      dirty.current = false;
      draw();
      // The selection pulse is the only thing that animates a resting field,
      // and it does not run at all when the system has asked for less motion.
      const scn = sceneRef.current;
      const animating =
        (!reducedRef.current && scn.nodes.some((n) => n.selected)) || sweepRef.current != null;
      if (animating) {
        dirty.current = true;
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  useEffect(() => {
    invalidate();
  }, [scene, camera, size, sweepAngle, reducedMotion, clusterLabels, invalidate]);

  useEffect(
    () => () => {
      // AND THE HANDLE IS CLEARED, NOT JUST CANCELLED.
      //
      // `invalidate` treats a non-null handle as "a frame is already
      // scheduled" and returns early. React's development double-invoke runs
      // this cleanup between the two mounts, so leaving a stale id here meant
      // every subsequent invalidate short-circuited and the canvas never
      // painted at all — a blank field with no error, which is the worst
      // shape a bug can take.
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    []
  );

  // ── THE CAMERA GESTURES ──────────────────────────────────────────────
  //
  // Identical to the SVG renderer's, deliberately: this slice isolates the
  // PAINTER, so pan and zoom must not be a second variable. Same live-camera
  // rule, same exponential wheel, same zoom-about-the-pointer.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const el = hostRef.current;
      if (!el) return;
      const c = getCamera();
      const vp = sizeRef.current;
      const r = el.getBoundingClientRect();
      const w0 = vp.w / c.k;
      const h0 = vp.h / c.k;
      const before = {
        x: c.x - w0 / 2 + ((e.clientX - r.left) / r.width) * w0,
        y: c.y - h0 / 2 + ((e.clientY - r.top) / r.height) * h0,
      };
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * Math.exp(-e.deltaY * 0.0016)));
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      onCamera({ x: before.x - (fx - 0.5) * (vp.w / k), y: before.y - (fy - 0.5) * (vp.h / k), k });
    },
    [getCamera, onCamera]
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    // Natively, and non-passive: React registers wheel handlers as passive,
    // so preventDefault() is ignored and the page scrolls behind the field.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; k: number } | null>(null);
  const moved = useRef(false);

  /** World point under a client-space pointer. */
  const worldAt = useCallback((clientX: number, clientY: number) => {
    const el = hostRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return screenToWorld({ x: clientX - r.left, y: clientY - r.top }, getCamera(), sizeRef.current);
  }, [getCamera]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const c = getCamera();
    drag.current = { sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y, k: c.k };
    moved.current = false;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* no live pointer to capture — the drag still works inside the field */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      onCamera({ x: d.cx - dx / d.k, y: d.cy - dy / d.k, k: d.k });
      return;
    }
    // HOVER IS A HIT TEST, AND IT IS MEASURED. The probe records how long it
    // takes so "is hit testing better" is answered with a number.
    const w = worldAt(e.clientX, e.clientY);
    if (!w) return;
    const t0 = performance.now();
    const id = hits.current.at(w.x, w.y);
    const probe = (window.__signalCanvas ??= { stats: null, frames: [], hitTests: [], repaints: 0 });
    probe.hitTests.push(performance.now() - t0);
    if (probe.hitTests.length > 400) probe.hitTests.shift();
    if (id !== hoveredId) onHover(id);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onClick = (e: React.MouseEvent) => {
    if (moved.current) return;
    const w = worldAt(e.clientX, e.clientY);
    if (!w) return;

    // A cluster's own toggle is a screen-space target sitting beside its
    // name, exactly where the SVG puts it.
    const hitToggle = clusterToggleAt(e, hostRef.current, clusterLabels, getCamera(), sizeRef.current, expanded);
    if (hitToggle) {
      onToggleCluster(hitToggle);
      return;
    }

    const id = hits.current.at(w.x, w.y);
    onSelect(id === null ? null : id === selectedId ? null : id);
  };

  // ── THE ACCESSIBLE MIRROR ────────────────────────────────────────────
  //
  // One real button per node the SVG would have made focusable, in the same
  // keyboard order and carrying the same name. Visually hidden — the canvas
  // is already drawing the thing — but present in the accessibility tree, in
  // the tab sequence, and reachable by a screen reader's element list.
  const mirror = useMemo(
    () =>
      scene.nodes
        .filter((n) => n.tabIndex >= 1)
        .sort((a, b) => a.tabIndex - b.tabIndex),
    [scene.nodes]
  );

  return (
    <div
      ref={hostRef}
      data-shoot="signal-graph"
      data-renderer="canvas"
      data-zoom={level}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "block",
        cursor: drag.current ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        onPointerUp();
        onHover(null);
      }}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <div
        role="application"
        aria-label={`Signal Graph: ${scene.stats.drawn} nodes, ${scene.stats.opened} opened and ${scene.stats.drawn - scene.stats.opened} collapsed into marks, ${scene.stats.edges} relationships shown, ${level} zoom`}
        data-shoot="canvas-a11y-mirror"
        style={SR_ONLY}
      >
        {mirror.map((n) => (
          <MirrorNode
            key={n.id}
            id={n.id}
            name={n.accessibleName}
            kind={n.kind}
            tabIndex={n.tabIndex}
            selected={n.selected}
            onSelect={onSelect}
            onHover={onHover}
            onFocusNode={(id) => {
              focusedRef.current = id;
              invalidate();
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * VISUALLY HIDDEN, NOT HIDDEN.
 *
 * `display:none` and `visibility:hidden` both remove an element from the
 * accessibility tree and from the tab order, which would be the whole
 * regression this mirror exists to prevent. The clip-rect idiom keeps it
 * real and keeps it silent.
 */
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

const MirrorNode = memo(function MirrorNode({
  id,
  name,
  kind,
  tabIndex,
  selected,
  onSelect,
  onHover,
  onFocusNode,
}: {
  id: string;
  name: string;
  kind: string;
  tabIndex: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onFocusNode: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-pressed={selected}
      data-shoot={`node-${id}`}
      data-kind={kind}
      data-opened="true"
      onFocus={() => {
        onHover(id);
        onFocusNode(id);
      }}
      onBlur={() => {
        onHover(null);
        onFocusNode(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : id);
      }}
    >
      {name}
    </button>
  );
});

/**
 * A cluster's expand/collapse target, in screen space.
 *
 * The SVG hangs this off a `<text>` element, which gives it a real box for
 * free. Here it is the same anchor point with the same offset, tested as a
 * rectangle sized to the text it stands for.
 */
function clusterToggleAt(
  e: React.MouseEvent,
  host: HTMLElement | null,
  labels: { cluster: string; x: number; y: number; latent: number }[],
  camera: { x: number; y: number; k: number },
  vp: { w: number; h: number },
  expanded: Set<string>
): string | null {
  if (!host) return null;
  const r = host.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  for (const c of labels) {
    if (c.latent <= 0 && !expanded.has(c.cluster)) continue;
    const sx = (c.x - camera.x) * camera.k + vp.w / 2;
    const sy = (c.y - camera.y) * camera.k + vp.h / 2 + 16;
    const flip = clusterLabelPoint(c.cluster).angle > 90 || clusterLabelPoint(c.cluster).angle < -90;
    const w = 74;
    const x0 = flip ? sx - w : sx;
    if (px >= x0 && px <= x0 + w && py >= sy - 9 && py <= sy + 9) return c.cluster;
  }
  return null;
}

export { hitRadiusOf };
