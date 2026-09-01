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
import { RubricCamera, s2w, type RubricTransform } from "../../rubricCamera";
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
