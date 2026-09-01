// RUBRIC VIEWPORT ENGINE — the adapted chassis, not another Signal renderer.
//
// Directly adapted from Rubric Second Brain's `BrainCore` state/lifecycle,
// `_core.js` lines 1-38, 310-940 and 932-1069. Original work Copyright
// (c) 2026 Jay E | RoboNuggets, CC BY 4.0. See ATTRIBUTION.md.
//
// Rubric keeps layout, camera, hit testing, sprite caches and painter state in
// one `S` object. The previous Signal pass split those mechanics among React
// refs, which made React—not Rubric—the viewport substrate. This class restores
// the source boundary. React owns mounting and product callbacks; this object
// owns the visual world. Signal enters only through `setNodes`, whose input is
// produced by `lib/audit/rubricVisualAdapter.ts`.

import type { AuditScene } from "@/lib/audit/visualScene";
import { SpatialField, type FieldNodeInput, type LayoutMode } from "@/lib/audit/spatial/field";
import {
  RubricCamera,
  RUBRIC_MAX_ZOOM,
  RUBRIC_MIN_ZOOM,
  s2w,
  type RubricTransform,
} from "../../rubricCamera";
import { BackdropCache } from "./backdrop";
import { paintScene, SoftLayer, type PaintInput, type PaintStats } from "./painter";
import { RubricSprites } from "./sprites2";

type EnginePaintInput = Omit<PaintInput, "sprites" | "backdrop" | "softLayer">;
type ScreenPoint = { x: number; y: number };

export interface RubricPointerMove {
  kind: "hover" | "drag" | "pan";
  hover: string | null;
  cameraChanged: boolean;
  cursor: "grab" | "grabbing" | "pointer";
}

export interface RubricPointerUp {
  /** Rubric decides click vs drag on mouseup with a five-pixel radius. */
  clicked: boolean;
  /** The object hit at pointer-down, exactly as Rubric retains `downAt.hit`. */
  hit: string | null;
  cursor: "grab";
}

export class RubricViewportEngine {
  readonly field: SpatialField;
  readonly camera: RubricCamera;
  private readonly sprites = new RubricSprites();
  private readonly backdrop = new BackdropCache();
  private readonly softLayer = new SoftLayer();
  private hitScene: AuditScene | null = null;
  private hitPositions: ReadonlyMap<string, { x: number; y: number }> = new Map();
  private hitScale = 1;
  private nodeIds = new Set<string>();
  private routerIds = new Set<string>();
  private hover: string | null = null;
  private pointer: {
    start: ScreenPoint;
    hit: string | null;
    dragId: string | null;
    panFrom: RubricTransform;
  } | null = null;

  constructor(options: { mode: LayoutMode; reducedMotion: boolean; camera: RubricTransform }) {
    this.field = new SpatialField({ mode: options.mode, reducedMotion: options.reducedMotion });
    this.camera = new RubricCamera(options.camera);
    this.camera.setReducedMotion(options.reducedMotion);
  }

  setNodes(nodes: FieldNodeInput[]): void {
    this.field.setNodes(nodes);
    this.nodeIds = new Set(nodes.map((n) => n.id));
    this.routerIds = new Set(nodes.filter((n) => n.role === "router").map((n) => n.id));
  }

  setMode(mode: LayoutMode): void {
    this.field.setMode(mode);
  }

  setReducedMotion(reduced: boolean): void {
    this.field.setReducedMotion(reduced);
    this.camera.setReducedMotion(reduced);
  }

  setDpr(dpr: number): void {
    this.sprites.setDpr(dpr);
  }

  paint(input: EnginePaintInput): PaintStats {
    return paintScene({
      ...input,
      sprites: this.sprites,
      backdrop: this.backdrop,
      softLayer: this.softLayer,
    });
  }

  /**
   * Rubric reads live node coordinates directly inside every hit test. Keep
   * references to the current frame instead of maintaining a second,
   * throttled geometry structure that can disagree with what was painted.
   */
  updateHitFrame(scene: AuditScene, positions: ReadonlyMap<string, { x: number; y: number }>, k: number): void {
    this.hitScene = scene;
    this.hitPositions = positions;
    this.hitScale = k;
  }

  /** The exact current world position used by paint and hit testing. */
  resolveWorldPosition(id: string): { x: number; y: number } | null {
    const direct = this.hitPositions.get(id);
    if (direct) return { ...direct };
    const agg = this.hitScene?.aggregates.find((a) => a.id === id);
    if (!agg) return null;
    const members = agg.hub ? [...agg.members, agg.hub] : agg.members;
    let x = 0;
    let y = 0;
    let count = 0;
    for (const member of members) {
      const p = this.hitPositions.get(member);
      if (!p) continue;
      x += p.x;
      y += p.y;
      count++;
    }
    return count > 0 ? { x: x / count, y: y / count } : null;
  }

  /**
   * Frame canonical ids from the live Rubric world.
   *
   * Selection never zooms in: if the requested geometry already fits, the
   * camera stays exactly where the reader left it; otherwise it recentres and
   * only pulls back as far as required. Trace uses the same rule for every
   * endpoint, so a route can never become a floating wire.
   */
  frameIds(
    ids: readonly string[],
    viewport: { w: number; h: number },
    options: { padding?: number } = {}
  ): boolean {
    const scene = this.hitScene;
    if (!scene || ids.length === 0) return false;
    const padding = options.padding ?? 56;
    const points: { x: number; y: number; r: number }[] = [];
    for (const id of new Set(ids)) {
      const aggregate = scene.aggregates.find((a) => a.id === id);
      if (aggregate) {
        for (const member of aggregate.hub ? [...aggregate.members, aggregate.hub] : aggregate.members) {
          const p = this.hitPositions.get(member);
          const node = scene.nodes.find((n) => n.id === member);
          if (p && node) points.push({ ...p, r: node.identity === "latent" ? node.latentR : node.r });
        }
        continue;
      }
      const p = this.hitPositions.get(id);
      const node = scene.nodes.find((n) => n.id === id);
      if (p && node) points.push({ ...p, r: node.identity === "latent" ? node.latentR : node.r });
    }
    if (points.length === 0) return false;

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x - p.r);
      y0 = Math.min(y0, p.y - p.r);
      x1 = Math.max(x1, p.x + p.r);
      y1 = Math.max(y1, p.y + p.r);
    }

    const t = this.camera.transform;
    const sx0 = x0 * t.k + t.x;
    const sy0 = y0 * t.k + t.y;
    const sx1 = x1 * t.k + t.x;
    const sy1 = y1 * t.k + t.y;
    if (
      sx0 >= padding && sy0 >= padding &&
      sx1 <= viewport.w - padding && sy1 <= viewport.h - padding
    ) return false;

    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const fitK = Math.min(
      (viewport.w - padding * 2) / width,
      (viewport.h - padding * 2) / height
    );
    const k = Math.max(RUBRIC_MIN_ZOOM, Math.min(RUBRIC_MAX_ZOOM, t.k, fitK));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    this.camera.flyTo({ k, x: viewport.w / 2 - cx * k, y: viewport.h / 2 - cy * k });
    return true;
  }

  fit(viewport: { w: number; h: number }): void {
    this.camera.fitWorld(this.field.origin, this.field.viewRadius, viewport);
  }

  /** Layout changes preserve learned framing unless the new world clips. */
  fitIfClipped(viewport: { w: number; h: number }, padding = 36): boolean {
    const t = this.camera.transform;
    const o = this.field.origin;
    const r = this.field.viewRadius;
    if (
      (o.x - r) * t.k + t.x >= padding &&
      (o.y - r) * t.k + t.y >= padding &&
      (o.x + r) * t.k + t.x <= viewport.w - padding &&
      (o.y + r) * t.k + t.y <= viewport.h - padding
    ) return false;
    this.fit(viewport);
    return true;
  }

  zoomBy(factor: number, viewport: { w: number; h: number }): void {
    const t = this.camera.transform;
    const world = s2w({ x: viewport.w / 2, y: viewport.h / 2 }, t);
    const k = Math.max(RUBRIC_MIN_ZOOM, Math.min(RUBRIC_MAX_ZOOM, t.k * factor));
    this.camera.set({ k, x: viewport.w / 2 - world.x * k, y: viewport.h / 2 - world.y * k });
  }

  /** Rubric `_core.js` 918-929: drawn radius + 6 screen px; raw nearest centre wins. */
  hitAt(x: number, y: number, includeRouter = true): string | null {
    const scene = this.hitScene;
    if (!scene) return null;
    let hit: string | null = null;
    let best = Infinity;
    for (const n of scene.nodes) {
      if (!includeRouter && this.routerIds.has(n.id)) continue;
      if (n.opacity < 0.012) continue;
      const p = this.hitPositions.get(n.id);
      if (!p) continue;
      const drawn = n.identity === "latent" ? n.latentR : n.r;
      const radius = drawn + 6 / this.hitScale;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < radius * radius && d < best) {
        best = d;
        hit = n.id;
      }
    }
    // Aggregate shells are a Signal projection, not a Rubric node. They stay
    // click-selectable, but never become draggable objects or outrank a real
    // node under the pointer.
    if (hit) return hit;
    for (const a of scene.aggregates) {
      if (a.opacity <= 0.01) continue;
      const radius = a.discR + 6 / this.hitScale;
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < radius * radius && d < best) {
        best = d;
        hit = a.id;
      }
    }
    return hit;
  }

  hitAtScreen(point: ScreenPoint, includeRouter = true): string | null {
    const world = s2w(point, this.camera.transform);
    return this.hitAt(world.x, world.y, includeRouter);
  }

  /** Rubric `mousedown`: a node begins a drag; empty space begins a pan. */
  pointerDown(point: ScreenPoint): { hit: string | null; cursor: "grab" | "grabbing" } {
    this.camera.cancel();
    const hit = this.hitAtScreen(point, true);
    const dragId = hit && this.nodeIds.has(hit) ? hit : null;
    this.pointer = { start: { ...point }, hit, dragId, panFrom: { ...this.camera.transform } };
    if (dragId) this.field.grab(dragId);
    return { hit, cursor: dragId ? "grabbing" : "grab" };
  }

  /** Rubric `mousemove`: the hand cancels flight before moving node or camera. */
  pointerMove(point: ScreenPoint): RubricPointerMove {
    const active = this.pointer;
    if (active?.dragId) {
      this.camera.cancel();
      const world = s2w(point, this.camera.transform);
      this.field.dragTo(active.dragId, world.x, world.y);
      return { kind: "drag", hover: active.dragId, cameraChanged: false, cursor: "grabbing" };
    }
    if (active) {
      this.camera.set({
        k: active.panFrom.k,
        x: active.panFrom.x + point.x - active.start.x,
        y: active.panFrom.y + point.y - active.start.y,
      });
      return { kind: "pan", hover: null, cameraChanged: true, cursor: "grab" };
    }
    // Rubric deliberately excludes the router from hover, while mousedown
    // still includes it so every actual node remains draggable/clickable.
    this.hover = this.hitAtScreen(point, false);
    return {
      kind: "hover",
      hover: this.hover,
      cameraChanged: false,
      cursor: this.hover ? "pointer" : "grab",
    };
  }

  /** Rubric `mouseup`: only a <5px movement is a click; a drag never clicks. */
  pointerUp(point: ScreenPoint): RubricPointerUp {
    const active = this.pointer;
    if (!active) return { clicked: false, hit: null, cursor: "grab" };
    const clicked = Math.hypot(point.x - active.start.x, point.y - active.start.y) < 5;
    if (active.dragId) this.field.release(active.dragId);
    this.pointer = null;
    return { clicked, hit: clicked ? active.hit : null, cursor: "grab" };
  }

  pointerCancel(): void {
    if (this.pointer?.dragId) this.field.release(this.pointer.dragId);
    this.pointer = null;
  }

  pointerLeave(): string | null {
    if (this.pointer) return this.hover;
    this.hover = null;
    return null;
  }

  wheel(deltaY: number, point: ScreenPoint): void {
    this.camera.wheel(deltaY, point);
  }

  /** Rubric `dblclick`: release the object back to layout gravity, then fly. */
  doubleClick(viewport: { w: number; h: number }): string | null {
    const id = this.hover;
    if (!id || !this.nodeIds.has(id)) return null;
    this.field.resetHome(id);
    const p = this.hitPositions.get(id);
    if (p) this.camera.flyToPoint(p, viewport);
    return id;
  }

  get pointerActive(): boolean {
    return this.pointer != null;
  }

  dispose(): void {
    this.pointerCancel();
    this.field.dispose();
    this.softLayer.release();
    this.backdrop.release();
  }
}
