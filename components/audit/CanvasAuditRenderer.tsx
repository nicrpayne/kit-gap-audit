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
import { adaptSignalSceneToRubric } from "@/lib/audit/rubricVisualAdapter";
import { layoutGraph, clusterLabelPoint, CLUSTER_ORDER, type GraphLayout } from "@/lib/audit/graphLayout";
import type { LayoutMode } from "@/lib/audit/spatial/field";
import { quantizeScale, type Camera } from "./cameraMotion";
import type { AuditRendererProps, AuditSpatialAuthority } from "./renderer/types";
import { TokenPalette } from "./canvas/paintTokens";
import type { PaintStats } from "./canvas/rubric/painter";
import { RubricViewportEngine } from "./canvas/rubric/engine";
import { fromSignal, toSignal } from "./rubricCamera";
import worldStyles from "./AuditWorld.module.css";

declare global {
  interface Window {
    __signalCanvas?: {
      stats: PaintStats | null;
      frames: number[];
      hitTests: number[];
      repaints: number;
      /** Whether the field is still animating at rest on this machine. */
      ambient: boolean;
      layout: LayoutMode;
      camera: "rubric";
      cameraFlying?: boolean;
      cameraScale?: number;
      geometry?: {
        projectedCanonical: number;
        aggregateRegions: number;
        openedIdentities: number;
        nearestOwnHubPct: number;
        largestTerritoryAreaShare: number;
        selectedOffscreen: boolean;
        traceEndpointsOffscreen: number;
      };
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
    onCameraPublished,
    onSelect,
    onPointerSelect,
    onHover,
    expanded,
    onToggleCluster,
    sweepAngle,
    swept,
    onViewport,
    onSpatialAuthority,
  } = props;
  // Rubric owns Canvas flights. Each reached frame is mirrored into Signal
  // without being mistaken for a new direct camera write (which would cancel
  // the very flight being reported).
  const publishReachedCamera = onCameraPublished ?? onCamera;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 800 });
  const viewportRef = useRef(onViewport);
  viewportRef.current = onViewport;

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("rings");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLayoutMode(resolveLayout(window.location.search));
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
  const engineRef = useRef<RubricViewportEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new RubricViewportEngine({
      mode: "rings",
      reducedMotion: false,
      camera: fromSignal(camera, size),
    });
  }

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
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // The population changes when the graph or what is disclosed changes — not
  // when the camera moves.
  const populationKey = `${scene.stats.drawn}|${scene.stats.opened}|${level}|${[...opened].sort().join(",")}|${selectedId ?? ""}|${
    matches ? [...matches].sort().join(",") : ""
  }|${soloNodes ? [...soloNodes].sort().join(",") : ""}`;
  const rubricWorld = useMemo(
    () => adaptSignalSceneToRubric(scene, level),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [populationKey]
  );
  const worldRef = useRef(rubricWorld);
  worldRef.current = rubricWorld;
  useEffect(() => {
    engineRef.current?.setNodes(rubricWorld.nodes);
  }, [rubricWorld]);

  useEffect(() => {
    const id = selectedId ?? hoveredId;
    engineRef.current?.field.setFocus(id, scene.focus?.frame ?? (id ? [id] : []));
  }, [selectedId, hoveredId, scene.focus, rubricWorld]);

  useEffect(() => {
    engineRef.current?.setMode(layoutMode);
  }, [layoutMode]);

  // ── PAINT MACHINERY ──────────────────────────────────────────────────
  const palette = useRef(new TokenPalette(null));
  const fontFamily = useRef("system-ui, sans-serif");
  const publishCameraReached = useCallback(
    (next: Camera) => {
      publishReachedCamera(next);
    },
    [publishReachedCamera]
  );
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
    const engine = engineRef.current;
    return () => {
      engine?.dispose();
    };
  }, []);

  // The canvas has one camera: Rubric's affine transform. Signal's camera
  // state is only the product-facing mirror used by the controls outside the
  // canvas and by the semantic scene builder.
  useEffect(() => {
    const vp = sizeRefInit(size);
    const engine = engineRef.current;
    if (!engine) return;
    const cam = engine.camera;
    cam.set(fromSignal(getCamera(), vp));
    cam.setReducedMotion(reducedMotion);
    const field = engine.field;
    if (field) cam.fitWorld(field.origin, field.viewRadius, vp, 0);
    const fitted = toSignal(cam.transform, vp);
    publishCameraReached(fitted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, reducedMotion, getCamera, publishCameraReached]);

  // There is intentionally no camera-prop -> Rubric feedback effect here.
  // Every Canvas camera intent (Fit, +/- , Search/Trace framing, history,
  // wheel and pan) already enters through `AuditSpatialAuthority`; the prop
  // is the product-facing mirror that Rubric publishes. Feeding that mirror
  // back into Rubric one React commit later recreated a stale second camera
  // and cancelled eased flights after their first frame.

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.fitIfClipped(size);
    invalidateRef.current?.();
  }, [layoutMode, size]);

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
  const soloRef = useRef(soloNodes);
  soloRef.current = soloNodes;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const sceneKey = useRef({ id: 0, scene });
  if (sceneKey.current.scene !== scene) sceneKey.current = { id: sceneKey.current.id + 1, scene };

  const rafRef = useRef<number | null>(null);
  const lastT = useRef(0);

  // ── THE AMBIENT-MOTION GOVERNOR ──────────────────────────────────────
  //
  // Rubric's field never stops moving, and on hardware that composites a
  // canvas on the GPU that costs nothing worth measuring. This environment
  // has no GPU — WebGL reports SwiftShader — and there a canvas repaint
  // re-rasterises the entire backing store: ~65ms at 1944×1618. Measured, a
  // RESTING field cost 166ms a frame while the painter itself took 1.8ms.
  //
  // The answer is not to delete the spin, which is part of what makes the
  // reference feel alive, and not to keep it and ship a 6fps instrument. It
  // is to let the field find out which machine it is on. If ambient frames
  // are consistently costing more than two display intervals, ambient motion
  // switches off and the field becomes still until something happens; if
  // they are cheap, it stays on.
  const ambient = useRef({ on: true, samples: [] as number[], decided: false });
  const running = useRef(false);
  const invalidateRef = useRef<(() => void) | null>(null);

  const frame = useCallback(
    (now: number) => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      const f = engine?.field;
      if (!canvas || !engine || !f) {
        running.current = false;
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        running.current = false;
        return;
      }

      const dt = lastT.current ? Math.min(64, now - lastT.current) : 16.7;
      const interval = lastT.current ? now - lastT.current : 16.7;
      lastT.current = now;

      const vp = sizeRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(vp.w * dpr));
      const H = Math.max(1, Math.round(vp.h * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        engine.setDpr(dpr);
      }

      // Advance the world, then the camera, then paint. One clock for all
      // three, so physics, morph and motion cannot disagree about elapsed
      // time — which is what makes a morph land where the camera expects it.
      const moving = f.tick(dt);
      livePositions.current = f.positions();

      const camMoving = engine.camera.advance(dt);
      const cam = toSignal(engine.camera.transform, vp);
      if (camMoving) {
        publishCameraReached(cam);
      }

      const t0 = performance.now();
      const stats = engine.paint({
        ctx,
        scene: sceneRef.current,
        camera: cam,
        viewport: vp,
        dpr,
        palette: palette.current,
        sceneKey: `${sceneKey.current.id}|${f.layout}`,
        settled: !moving,
        reducedMotion: reducedRef.current,
        ambient: f.ambientOn,
        time: now,
        sweepAngle: sweepRef.current,
        fontFamily: fontFamily.current,
        positions: livePositions.current,
        boundR: f.layout === "constellations" ? f.boundR : 0,
        clusterLabels: clusterRef.current,
        traceEdges: traceRef.current,
      });
      const paintMs = performance.now() - t0;

      // Rubric hit-tests the coordinates painted on this frame. A second,
      // throttled Signal index would make a moving node and its grab target
      // disagree, so the engine keeps direct references to this live frame.
      engine.updateHitFrame(sceneRef.current, livePositions.current, cam.k);

      const probe = (window.__signalCanvas ??= {
        stats: null,
        frames: [],
        hitTests: [],
        repaints: 0,
        ambient: f.ambientOn,
        layout: f.layout,
        camera: "rubric",
      });
      probe.stats = stats;
      probe.ambient = f.ambientOn;
      probe.layout = f.layout;
      probe.camera = "rubric";
      probe.cameraFlying = engine.camera.flying;
      probe.cameraScale = cam.k;
      const visible = (id: string) => {
        const p = livePositions.current.get(id);
        if (!p) return false;
        const sx = (p.x - cam.x) * cam.k + vp.w / 2;
        const sy = (p.y - cam.y) * cam.k + vp.h / 2;
        return sx >= 0 && sx <= vp.w && sy >= 0 && sy <= vp.h;
      };
      const constellation = f.constellationMetrics();
      probe.geometry = {
        projectedCanonical: worldRef.current.projectedCanonicalIds.size,
        aggregateRegions: worldRef.current.aggregateIds.size,
        openedIdentities: sceneRef.current.stats.opened,
        nearestOwnHubPct: constellation.nearestOwnHubPct,
        largestTerritoryAreaShare: constellation.largestTerritoryAreaShare,
        selectedOffscreen: !!sceneRef.current.focus && !visible(sceneRef.current.focus.anchor),
        traceEndpointsOffscreen: soloRef.current
          ? [...soloRef.current].filter((id) => !visible(id)).length
          : 0,
      };
      const host = hostRef.current;
      if (host) {
        host.dataset.projectedCanonical = String(probe.geometry.projectedCanonical);
        host.dataset.aggregateRegions = String(probe.geometry.aggregateRegions);
        host.dataset.openedIdentities = String(probe.geometry.openedIdentities);
        host.dataset.nearestOwnHubPct = probe.geometry.nearestOwnHubPct.toFixed(1);
        host.dataset.largestTerritoryShare = probe.geometry.largestTerritoryAreaShare.toFixed(3);
        host.dataset.selectedOffscreen = String(probe.geometry.selectedOffscreen);
        host.dataset.traceEndpointsOffscreen = String(probe.geometry.traceEndpointsOffscreen);
        host.dataset.cameraFlying = String(engine.camera.flying);
        host.dataset.cameraScale = cam.k.toFixed(4);
      }
      probe.repaints++;
      probe.frames.push(paintMs);
      if (probe.frames.length > 400) probe.frames.shift();
      if (host) {
        host.dataset.repaintCount = String(probe.repaints);
        host.dataset.paintSamples = String(probe.frames.length);
        host.dataset.hitSamples = String(probe.hitTests.length);
        host.dataset.ambient = String(probe.ambient);
        // A lightweight, DOM-visible real-hardware probe. Recompute the
        // percentiles only every thirty paints so measuring the renderer does
        // not become part of the renderer's steady-state cost.
        if (probe.repaints % 30 === 0 || probe.frames.length === 1) {
          const quantile = (values: readonly number[], p: number) => {
            if (values.length === 0) return 0;
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
          };
          host.dataset.paintP50Ms = quantile(probe.frames, 0.5).toFixed(3);
          host.dataset.paintP95Ms = quantile(probe.frames, 0.95).toFixed(3);
          host.dataset.paintMaxMs = Math.max(...probe.frames).toFixed(3);
          host.dataset.hitP95Ms = quantile(probe.hitTests, 0.95).toFixed(3);
        }
      }

      // Judge only frames where ambient motion is the ONLY thing running:
      // a morph or a drag is supposed to be expensive, and counting those
      // would switch the spin off for the wrong reason.
      const ambientOnly = !f.busy && !camMoving && sweepRef.current == null;
      if (ambient.current.on && ambientOnly) {
        const a = ambient.current;
        a.samples.push(interval);
        if (a.samples.length >= 24) {
          const sorted = [...a.samples].sort((x, y) => x - y);
          const med = sorted[Math.floor(sorted.length / 2)];
          if (med > (1000 / 60) * 2.2) {
            a.on = false;
            f.setAmbient(false);
          }
          a.decided = true;
          a.samples = [];
        }
      }

      const spinning = f.layout === "rings" && f.ambientOn;
      const pulsing = f.ambientOn && sceneRef.current.nodes.some((n) => n.selected);
      const tracing = f.ambientOn && (traceRef.current?.size ?? 0) > 0;
      const alive = moving || camMoving || engine.camera.flying || spinning || pulsing || tracing || sweepRef.current != null;
      if (alive) {
        running.current = true;
        rafRef.current = requestAnimationFrame(frame);
      } else {
        running.current = false;
      }
    },
    [publishCameraReached]
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
  }, [scene, camera, size, sweepAngle, reducedMotion, clusterLabels, layoutMode, invalidate]);

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
  // Rubric owns the gesture state machine. React only converts browser
  // coordinates, publishes the resulting camera/selection to the product,
  // and invalidates the painter. There is deliberately no second Signal drag
  // ref, hit policy, click threshold, camera branch or selection toggle here.
  const localPoint = useCallback((clientX: number, clientY: number) => {
    const el = hostRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  const publishCamera = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = toSignal(engine.camera.transform, sizeRef.current);
    publishCameraReached(next);
    invalidateRef.current?.();
  }, [publishCameraReached]);

  useEffect(() => {
    if (!onSpatialAuthority) return;
    const authority: AuditSpatialAuthority = {
      resolveWorldPosition: (id) => engineRef.current?.resolveWorldPosition(id) ?? null,
      frameIds: (ids, options) => {
        const moved = engineRef.current?.frameIds(ids, sizeRef.current, options) ?? false;
        if (moved) invalidateRef.current?.();
        return moved;
      },
      fit: () => {
        engineRef.current?.fit(sizeRef.current);
        invalidateRef.current?.();
      },
      zoomBy: (factor) => {
        engineRef.current?.zoomBy(factor, sizeRef.current);
        publishCamera();
      },
      flyToCamera: (next) => {
        engineRef.current?.camera.flyTo(fromSignal(next, sizeRef.current));
        invalidateRef.current?.();
      },
      cancelFlight: () => engineRef.current?.camera.cancel(),
    };
    onSpatialAuthority(authority);
    return () => onSpatialAuthority(null);
  }, [onSpatialAuthority, publishCamera]);

  const setCursor = useCallback((cursor: "grab" | "grabbing" | "pointer") => {
    if (hostRef.current) hostRef.current.style.cursor = cursor;
  }, []);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const point = localPoint(e.clientX, e.clientY);
      if (!point || !engineRef.current) return;
      engineRef.current.wheel(e.deltaY, point);
      publishCamera();
    },
    [localPoint, publishCamera]
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const point = localPoint(e.clientX, e.clientY);
    const engine = engineRef.current;
    if (!point || !engine) return;
    const result = engine.pointerDown(point);
    setCursor(result.cursor);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no live pointer to capture — the drag still works inside the field */
    }
    invalidateRef.current?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const point = localPoint(e.clientX, e.clientY);
    const engine = engineRef.current;
    if (!point || !engine) return;
    const t0 = performance.now();
    const result = engine.pointerMove(point);
    const probe = (window.__signalCanvas ??= {
      stats: null,
      frames: [],
      hitTests: [],
      repaints: 0,
      ambient: true,
      layout: "rings",
      camera: "rubric",
    });
    probe.hitTests.push(performance.now() - t0);
    if (probe.hitTests.length > 400) probe.hitTests.shift();
    if (result.hover !== hoveredId) onHover(result.hover);
    if (result.cameraChanged) publishCamera();
    setCursor(result.cursor);
    invalidateRef.current?.();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const point = localPoint(e.clientX, e.clientY);
    const engine = engineRef.current;
    if (!point || !engine) return;
    const result = engine.pointerUp(point);
    setCursor(result.cursor);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* the browser may already have released it */
    }
    if (!result.clicked) {
      invalidateRef.current?.();
      return;
    }
    const cam = toSignal(engine.camera.transform, sizeRef.current);
    const project = (x: number, y: number) => ({
      x: (x - cam.x) * cam.k + sizeRef.current.w / 2,
      y: (y - cam.y) * cam.k + sizeRef.current.h / 2,
    });
    // The toggle sits under the lane's name, and the lane moves, so its hit
    // region is taken from the live position rather than the static seat.
    const live = livePositions.current;
    const toggle = clusterToggleAt(
      point,
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
    // Rubric's ordinary click selects in place and does not toggle, reheat the
    // field or fly the camera. Signal still decides what that id means.
    (onPointerSelect ?? onSelect)(result.hit);
    invalidateRef.current?.();
  };

  const onPointerCancel = () => {
    engineRef.current?.pointerCancel();
    setCursor("grab");
    invalidateRef.current?.();
  };

  const onPointerLeave = () => {
    const engine = engineRef.current;
    if (!engine || engine.pointerActive) return;
    const next = engine.pointerLeave();
    if (next !== hoveredId) onHover(next);
    setCursor("grab");
  };

  const onDoubleClick = () => {
    if (engineRef.current?.doubleClick(sizeRef.current)) invalidateRef.current?.();
  };

  // ── ACCESSIBLE MIRROR ────────────────────────────────────────────────
  const mirrorRows = useMemo(
    () =>
      scene.nodes
        .filter((n) => n.tabIndex >= 1 && rubricWorld.projectedCanonicalIds.has(n.id))
        .sort((a, b) => a.tabIndex - b.tabIndex)
        .map((n) => ({
          id: n.id,
          name: n.accessibleName,
          kind: n.kind as string,
          tabIndex: n.tabIndex,
          selected: n.selected,
        })),
    [scene.nodes, rubricWorld.projectedCanonicalIds]
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
      data-camera="rubric"
      data-zoom={level}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "block",
        cursor: "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={canvasRef} aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }} />

      {/* Rubric owns the layout mechanics; Audit owns the product-facing
          control around them. The compact MENU keeps the world dominant and
          replaces the reference demo's orange/retro chrome with Signal's
          raised graphite material. */}
      <div
        className={`absolute left-3 top-3 ${worldStyles.worldWidget}`}
        data-shoot="layout-switch"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          aria-expanded={menuOpen}
          data-shoot="world-menu-toggle"
          className="flex h-9 items-center gap-2 rounded-[9px] px-3 text-[9.5px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: menuOpen ? "var(--i-signal)" : "var(--i-text-soft)" }}
        >
          <span aria-hidden className="text-[13px] leading-none">☰</span>
          Menu
        </button>
        {menuOpen && (
          <div className="border-t px-2.5 pb-2.5 pt-2" style={{ borderColor: "var(--i-border)" }} data-shoot="world-menu-panel">
            <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>World layout</div>
            <div className="flex gap-1 rounded-md bg-black/20 p-1">
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
            className="rounded px-2 py-1 text-[10px] uppercase tracking-wider transition-colors"
            style={{
              color: layoutMode === m ? "var(--i-signal)" : "var(--i-text-faint)",
              background: layoutMode === m ? "var(--i-signal-soft)" : "transparent",
              border: `1px solid ${layoutMode === m ? "color-mix(in srgb, var(--i-signal) 48%, transparent)" : "transparent"}`,
            }}
          >
            {m === "rings" ? "Rings" : "Constellations"}
          </button>
            ))}
            </div>
          </div>
        )}
      </div>

      <A11yMirror
        nodes={mirror}
        label={`Signal Graph: ${rubricWorld.projectedCanonicalIds.size} of ${scene.stats.drawn} canonical nodes projected, ${scene.stats.opened} opened, ${rubricWorld.aggregateIds.size} aggregate regions, ${scene.stats.edges} relationships shown, ${level} zoom, ${layoutMode} layout`}
        onSelect={onPointerSelect ?? onSelect}
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
        onSelect(id);
      }}
    >
      {name}
    </button>
  );
});

function clusterToggleAt(
  point: { x: number; y: number },
  labels: { cluster: string; x: number; y: number; latent: number; flip: boolean }[],
  expanded: Set<string>,
  project: (x: number, y: number) => { x: number; y: number }
): string | null {
  const px = point.x;
  const py = point.y;
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
