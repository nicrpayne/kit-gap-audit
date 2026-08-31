"use client";

// THE RUBRIC-DERIVED AUDIT VIEWPORT.
//
// Contains Rubric-adapted work — see ./canvas/rubric/* and ./rubricCamera for
// per-file attribution. Original: Copyright (c) 2026 Jay E | RoboNuggets,
// CC BY 4.0. Changes are documented in each adapted file and in
// docs/SIGNAL-RENDERER.md.
//
// It owns the visual world and nothing else: a canvas, a render loop, a
// presentation-only spatial field, hit geometry, and the pointer gestures
// that move the camera. Audit state, Graphology, selection, Search, the
// inspector, Findings, actions, provenance and routing are all outside, all
// unchanged, and reached only through props.
//
// ── WHAT CHANGED FROM THE PREVIOUS PASS ────────────────────────────────
//
// The painter is no longer homemade. The previous pass built one before the
// Rubric source was available, and its own measurement concluded that a
// better painter over identical coordinates does not produce the reference
// experience. That was the right answer to the wrong question: the missing
// piece was the arrangement, which that pass was explicitly told not to
// touch. This pass replaces the painter with Rubric's AND adds the spatial
// engine.
//
// Kept from that pass, because the brief says to and because they are
// infrastructure rather than painting: the visual scene adapter, the renderer
// boundary, the accessibility mirror, the hit-test index, and the four
// performance fixes it found by measuring.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildScene, buildSceneCache, type AuditScene } from "@/lib/audit/visualScene";
import { layoutGraph, clusterLabelPoint, CLUSTER_ORDER, type GraphLayout } from "@/lib/audit/graphLayout";
import { SpatialField, type LayoutMode } from "@/lib/audit/spatial/field";
import { MAX_ZOOM, MIN_ZOOM, quantizeScale, type Camera } from "./cameraMotion";
import type { AuditRendererProps } from "./renderer/types";
import { screenToWorld } from "./renderer/types";
import { TokenPalette } from "./canvas/paintTokens";
import { RubricSprites } from "./canvas/rubric/sprites2";
import { BackdropCache } from "./canvas/rubric/backdrop";
import { SoftLayer, paintScene, type PaintStats } from "./canvas/rubric/painter";
import { HitIndex } from "./canvas/hitTest";
import { RubricCamera, fromSignal, toSignal, resolveCamera, type CameraId } from "./rubricCamera";

declare global {
  interface Window {
    __signalCanvas?: {
      stats: PaintStats | null;
      frames: number[];
      hitTests: number[];
      repaints: number;
      layout: LayoutMode;
      camera: CameraId;
    };
  }
}

/** `?layout=constellations` opens on the organic view. Rings stays the
    default: it is the arrangement that carries Signal's disagreement law. */
function resolveLayout(search: string | null | undefined): LayoutMode {
  if (!search) return "rings";
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return p.get("layout") === "constellations" ? "constellations" : "rings";
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

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("rings");
  const [cameraId, setCameraId] = useState<CameraId>("signal");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLayoutMode(resolveLayout(window.location.search));
    setCameraId(resolveCamera(window.location.search));
  }, []);

  // ── SCENE ────────────────────────────────────────────────────────────
  const layout: GraphLayout = useMemo(() => layoutGraph(graph), [graph]);
  const sceneCache = useMemo(() => buildSceneCache(graph, layout), [graph, layout]);
  const nodeScale = useMemo(() => quantizeScale(camera.k), [camera.k]);
  const planKey = `${Math.round((camera.x * camera.k) / 12)}:${Math.round((camera.y * camera.k) / 12)}:${nodeScale.toFixed(3)}`;

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

  // ── THE SPATIAL FIELD ────────────────────────────────────────────────
  //
  // Presentation only. It reads the scene's anchor/band projection and writes
  // x/y into its own node objects; Graphology and `layoutGraph` are never
  // touched, so the semantic layer stays free of geometry.
  const fieldRef = useRef<SpatialField | null>(null);
  if (!fieldRef.current) fieldRef.current = new SpatialField({ mode: "rings", reducedMotion: false });

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    fieldRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // The population changes when the graph or what is disclosed changes — not
  // when the camera moves.
  const populationKey = `${scene.stats.drawn}|${scene.stats.opened}|${level}`;
  const population = useMemo(
    () =>
      scene.nodes.map((n) => ({
        id: n.id,
        r: n.identity === "latent" ? n.latentR : n.r,
        anchor: n.anchor,
        band: n.band,
        order: n.order,
        isAnchorNode: n.kind === "lane",
        isCore: n.anchor === "core",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [populationKey]
  );
  useEffect(() => {
    fieldRef.current?.setNodes(population);
  }, [population]);

  useEffect(() => {
    fieldRef.current?.setMode(layoutMode);
  }, [layoutMode]);

  // ── PAINT MACHINERY ──────────────────────────────────────────────────
  const palette = useRef(new TokenPalette(null));
  const sprites = useRef(new RubricSprites());
  const backdrop = useRef(new BackdropCache());
  const softLayer = useRef(new SoftLayer());
  const hits = useRef(new HitIndex());
  const fontFamily = useRef("system-ui, sans-serif");
  const rubricCam = useRef<RubricCamera | null>(null);
  const livePositions = useRef<Map<string, { x: number; y: number }>>(new Map());

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
    const layer = softLayer.current;
    const back = backdrop.current;
    const f = fieldRef.current;
    return () => {
      layer.release();
      back.release();
      f?.dispose();
    };
  }, []);

  // The Rubric camera keeps its own transform, seeded from Signal's so the
  // A/B starts from an identical view.
  useEffect(() => {
    if (cameraId !== "rubric") {
      rubricCam.current = null;
      return;
    }
    const cam = new RubricCamera(fromSignal(getCamera(), sizeRefInit(size)));
    cam.setReducedMotion(reducedMotion);
    rubricCam.current = cam;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, size.w, size.h, reducedMotion]);

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
          flip: p.angle > 90 || p.angle < -90,
          open: expanded.has(c),
          supplied: attrs.supplied !== false,
        };
      }),
    [graph, opened, expanded, scene.latentByCluster]
  );

  /** An active Trace is the one place motion along an edge is earned. */
  const traceEdges = useMemo(() => {
    if (!soloNodes) return null;
    const out = new Set<string>();
    for (const e of scene.edges) if (soloNodes.has(e.from) && soloNodes.has(e.to)) out.add(e.id);
    return out;
  }, [soloNodes, scene.edges]);

  // ── THE RENDER LOOP ──────────────────────────────────────────────────
  //
  // Rubric's loop never stops (`_core.js` line 1067). Signal's runs while
  // anything is genuinely moving — physics settling, a morph, a camera fly, a
  // Ring spin, a Trace, a selection pulse — and idles otherwise. The handoff
  // recommends exactly this (§3): "support dirty-frame rendering when idle."
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const clusterRef = useRef(clusterLabels);
  clusterRef.current = clusterLabels;
  const sweepRef = useRef(sweepAngle);
  sweepRef.current = sweepAngle;
  const traceRef = useRef(traceEdges);
  traceRef.current = traceEdges;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const cameraIdRef = useRef(cameraId);
  cameraIdRef.current = cameraId;
  const sceneKey = useRef({ id: 0, scene });
  if (sceneKey.current.scene !== scene) sceneKey.current = { id: sceneKey.current.id + 1, scene };

  const rafRef = useRef<number | null>(null);
  const lastT = useRef(0);
  const running = useRef(false);
  const invalidateRef = useRef<(() => void) | null>(null);

  const frame = useCallback(
    (now: number) => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const f = fieldRef.current;
      if (!canvas || !f) {
        running.current = false;
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        running.current = false;
        return;
      }

      const dt = lastT.current ? Math.min(64, now - lastT.current) : 16.7;
      lastT.current = now;

      const vp = sizeRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(vp.w * dpr));
      const H = Math.max(1, Math.round(vp.h * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        sprites.current.setDpr(dpr);
      }

      // Advance the world, then the camera, then paint. One clock for all
      // three, so physics, morph and motion cannot disagree about elapsed
      // time — which is what makes a morph land where the camera expects it.
      const moving = f.tick(dt);
      livePositions.current = f.positions();

      let cam: Camera;
      let camMoving = false;
      if (cameraIdRef.current === "rubric" && rubricCam.current) {
        camMoving = rubricCam.current.advance(dt);
        cam = toSignal(rubricCam.current.transform, vp);
      } else {
        cam = getCamera();
      }

      const t0 = performance.now();
      const stats = paintScene({
        ctx,
        scene: sceneRef.current,
        camera: cam,
        viewport: vp,
        dpr,
        palette: palette.current,
        sprites: sprites.current,
        backdrop: backdrop.current,
        softLayer: softLayer.current,
        sceneKey: `${sceneKey.current.id}|${f.layout}|${Math.round(now / 90)}`,
        reducedMotion: reducedRef.current,
        time: now,
        sweepAngle: sweepRef.current,
        fontFamily: fontFamily.current,
        positions: livePositions.current,
        boundR: f.layout === "constellations" ? f.boundR : 0,
        clusterLabels: clusterRef.current,
        traceEdges: traceRef.current,
      });
      const paintMs = performance.now() - t0;

      hits.current.buildFrom(sceneRef.current, livePositions.current, cam.k);

      const probe = (window.__signalCanvas ??= {
        stats: null,
        frames: [],
        hitTests: [],
        repaints: 0,
        layout: f.layout,
        camera: cameraIdRef.current,
      });
      probe.stats = stats;
      probe.layout = f.layout;
      probe.camera = cameraIdRef.current;
      probe.repaints++;
      probe.frames.push(paintMs);
      if (probe.frames.length > 400) probe.frames.shift();

      const spinning = f.layout === "rings" && !reducedRef.current;
      const pulsing = !reducedRef.current && sceneRef.current.nodes.some((n) => n.selected);
      const tracing = !reducedRef.current && (traceRef.current?.size ?? 0) > 0;
      const alive = moving || camMoving || spinning || pulsing || tracing || sweepRef.current != null;
      if (alive) {
        running.current = true;
        rafRef.current = requestAnimationFrame(frame);
      } else {
        running.current = false;
      }
    },
    [getCamera]
  );

  const invalidate = useCallback(() => {
    if (rafRef.current != null || running.current) return;
    running.current = true;
    rafRef.current = requestAnimationFrame(frame);
  }, [frame]);
  invalidateRef.current = invalidate;

  useEffect(() => {
    // A state change repaints even if nothing is animating: this restarts a
    // loop that had gone quiet.
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    running.current = false;
    invalidate();
  }, [scene, camera, size, sweepAngle, reducedMotion, clusterLabels, layoutMode, cameraId, invalidate]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      running.current = false;
    },
    []
  );

  // ── GESTURES ─────────────────────────────────────────────────────────
  //
  // Two cameras, one gesture surface: which camera receives the gesture is
  // the only thing the A/B changes, so what is compared is camera FEEL rather
  // than two different interactions.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const el = hostRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const vp = sizeRef.current;

      if (cameraIdRef.current === "rubric" && rubricCam.current) {
        rubricCam.current.wheel(e.deltaY, { x: sx, y: sy });
        onCamera(toSignal(rubricCam.current.transform, vp));
        invalidateRef.current?.();
        return;
      }
      const c = getCamera();
      const w0 = vp.w / c.k;
      const h0 = vp.h / c.k;
      const before = { x: c.x - w0 / 2 + (sx / r.width) * w0, y: c.y - h0 / 2 + (sy / r.height) * h0 };
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * Math.exp(-e.deltaY * 0.0016)));
      onCamera({
        x: before.x - (sx / r.width - 0.5) * (vp.w / k),
        y: before.y - (sy / r.height - 0.5) * (vp.h / k),
        k,
      });
    },
    [getCamera, onCamera]
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const drag = useRef<{ sx: number; sy: number; cam: Camera; node: string | null; moved: boolean } | null>(
    null
  );

  const currentCam = useCallback((): Camera => {
    if (cameraIdRef.current === "rubric" && rubricCam.current) {
      return toSignal(rubricCam.current.transform, sizeRef.current);
    }
    return getCamera();
  }, [getCamera]);

  const worldAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = hostRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return screenToWorld({ x: clientX - r.left, y: clientY - r.top }, currentCam(), sizeRef.current);
    },
    [currentCam]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const w = worldAt(e.clientX, e.clientY);
    // A pointer on a node grabs the node; a pointer on the field pans.
    const node = w ? hits.current.at(w.x, w.y) : null;
    drag.current = { sx: e.clientX, sy: e.clientY, cam: currentCam(), node, moved: false };
    if (node && graph.hasNode(node)) fieldRef.current?.grab(node);
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* no live pointer to capture — the drag still works inside the field */
    }
    invalidateRef.current?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.node) {
        // THE HAND OUTRANKS EVERY LAYOUT. Rubric pins a dragged node; so does
        // this, and the release returns it to its semantic seat.
        const w = worldAt(e.clientX, e.clientY);
        if (w) fieldRef.current?.dragTo(d.node, w.x, w.y);
      } else if (cameraIdRef.current === "rubric" && rubricCam.current) {
        const base = fromSignal(d.cam, sizeRef.current);
        rubricCam.current.set({ k: d.cam.k, x: base.x + dx, y: base.y + dy });
        onCamera(toSignal(rubricCam.current.transform, sizeRef.current));
      } else {
        onCamera({ x: d.cam.x - dx / d.cam.k, y: d.cam.y - dy / d.cam.k, k: d.cam.k });
      }
      invalidateRef.current?.();
      return;
    }
    const w = worldAt(e.clientX, e.clientY);
    if (!w) return;
    const t0 = performance.now();
    const id = hits.current.at(w.x, w.y);
    const probe = (window.__signalCanvas ??= {
      stats: null,
      frames: [],
      hitTests: [],
      repaints: 0,
      layout: "rings",
      camera: "signal",
    });
    probe.hitTests.push(performance.now() - t0);
    if (probe.hitTests.length > 400) probe.hitTests.shift();
    if (id !== hoveredId) onHover(id);
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d?.node) fieldRef.current?.release(d.node);
    drag.current = null;
    invalidateRef.current?.();
  };

  const onClick = (e: React.MouseEvent) => {
    if (drag.current?.moved) return;
    const w = worldAt(e.clientX, e.clientY);
    if (!w) return;
    const cam = currentCam();
    const project = (x: number, y: number) => ({
      x: (x - cam.x) * cam.k + sizeRef.current.w / 2,
      y: (y - cam.y) * cam.k + sizeRef.current.h / 2,
    });
    // The toggle sits under the lane's name, and the lane moves, so its hit
    // region is taken from the live position rather than the static seat.
    const live = livePositions.current;
    const toggle = clusterToggleAt(
      e,
      hostRef.current,
      clusterLabels.map((c) => {
        const p = live.get(`lane:${c.cluster}`);
        return p ? { ...c, x: p.x, y: p.y } : c;
      }),
      expanded,
      project
    );
    if (toggle) {
      onToggleCluster(toggle);
      return;
    }
    const id = hits.current.at(w.x, w.y);
    onSelect(id === null ? null : id === selectedId ? null : id);
    // A new selection wants a little room. Rubric's own click path changes no
    // physics (`select()`); this is Signal's B3 law added on top — the local
    // world opens, the global map does not move.
    if (id) fieldRef.current?.reheat(0.22);
  };

  // ── ACCESSIBLE MIRROR ────────────────────────────────────────────────
  const mirrorRows = useMemo(
    () =>
      scene.nodes
        .filter((n) => n.tabIndex >= 1)
        .sort((a, b) => a.tabIndex - b.tabIndex)
        .map((n) => ({
          id: n.id,
          name: n.accessibleName,
          kind: n.kind as string,
          tabIndex: n.tabIndex,
          selected: n.selected,
        })),
    [scene.nodes]
  );
  const mirrorSignature = mirrorRows.map((m) => `${m.id}:${m.tabIndex}:${m.selected ? 1 : 0}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mirror = useMemo(() => mirrorRows, [mirrorSignature]);
  const onFocusNode = useCallback(() => invalidateRef.current?.(), []);

  return (
    <div
      ref={hostRef}
      data-shoot="signal-graph"
      data-renderer="canvas"
      data-layout={layoutMode}
      data-camera={cameraId}
      data-zoom={level}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "block",
        cursor: drag.current?.node ? "grabbing" : "grab",
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
      <canvas ref={canvasRef} aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }} />

      {/* THE ONE PRODUCTION CONTROL. Physics dials stay out of the product —
          the handoff's Slice 5 is explicit — but WHICH ARRANGEMENT you are
          looking at is a reading choice and belongs on the surface. */}
      <div
        className="absolute left-3 top-3 flex gap-1 rounded-md p-1"
        style={{
          background: "color-mix(in srgb, var(--i-panel) 92%, transparent)",
          border: "1px solid var(--i-border-strong)",
        }}
        data-shoot="layout-switch"
      >
        {(["rings", "constellations"] as LayoutMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLayoutMode(m);
            }}
            aria-pressed={layoutMode === m}
            data-shoot={`layout-${m}`}
            className="rounded px-2 py-1 text-[10.5px] uppercase tracking-wider transition-colors"
            style={{
              color: layoutMode === m ? "var(--i-text)" : "var(--i-text-faint)",
              background: layoutMode === m ? "var(--i-signal-soft)" : "transparent",
            }}
          >
            {m === "rings" ? "Rings" : "Constellations"}
          </button>
        ))}
      </div>

      <A11yMirror
        nodes={mirror}
        label={`Signal Graph: ${scene.stats.drawn} nodes, ${scene.stats.opened} opened and ${scene.stats.drawn - scene.stats.opened} collapsed into marks, ${scene.stats.edges} relationships shown, ${level} zoom, ${layoutMode} layout`}
        onSelect={onSelect}
        onHover={onHover}
        onFocusNode={onFocusNode}
      />
    </div>
  );
}

/** The viewport at first paint, before the ResizeObserver has measured. */
function sizeRefInit(s: { w: number; h: number }): { w: number; h: number } {
  return s;
}

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

interface MirrorRow {
  id: string;
  name: string;
  kind: string;
  tabIndex: number;
  selected: boolean;
}

const A11yMirror = memo(function A11yMirror({
  nodes,
  label,
  onSelect,
  onHover,
  onFocusNode,
}: {
  nodes: MirrorRow[];
  label: string;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onFocusNode: (id: string | null) => void;
}) {
  return (
    <div role="application" aria-label={label} data-shoot="canvas-a11y-mirror" style={SR_ONLY}>
      {nodes.map((n) => (
        <MirrorNode key={n.id} {...n} onSelect={onSelect} onHover={onHover} onFocusNode={onFocusNode} />
      ))}
    </div>
  );
});

const MirrorNode = memo(function MirrorNode({
  id,
  name,
  kind,
  tabIndex,
  selected,
  onSelect,
  onHover,
  onFocusNode,
}: MirrorRow & {
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

function clusterToggleAt(
  e: React.MouseEvent,
  host: HTMLElement | null,
  labels: { cluster: string; x: number; y: number; latent: number; flip: boolean }[],
  expanded: Set<string>,
  project: (x: number, y: number) => { x: number; y: number }
): string | null {
  if (!host) return null;
  const r = host.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  for (const c of labels) {
    if (c.latent <= 0 && !expanded.has(c.cluster)) continue;
    const p = project(c.x, c.y);
    const sy = p.y + 15;
    const w = 74;
    const x0 = c.flip ? p.x - w : p.x;
    if (px >= x0 && px <= x0 + w && py >= sy - 9 && py <= sy + 9) return c.cluster;
  }
  return null;
}
