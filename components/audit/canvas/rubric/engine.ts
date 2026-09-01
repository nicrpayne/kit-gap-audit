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
import { RubricCamera, type RubricTransform } from "../../rubricCamera";
import { HitIndex } from "../hitTest";
import { BackdropCache } from "./backdrop";
import { paintScene, SoftLayer, type PaintInput, type PaintStats } from "./painter";
import { RubricSprites } from "./sprites2";

type EnginePaintInput = Omit<PaintInput, "sprites" | "backdrop" | "softLayer">;

export class RubricViewportEngine {
  readonly field: SpatialField;
  readonly camera: RubricCamera;
  private readonly hits = new HitIndex();
  private readonly sprites = new RubricSprites();
  private readonly backdrop = new BackdropCache();
  private readonly softLayer = new SoftLayer();

  constructor(options: { mode: LayoutMode; reducedMotion: boolean; camera: RubricTransform }) {
    this.field = new SpatialField({ mode: options.mode, reducedMotion: options.reducedMotion });
    this.camera = new RubricCamera(options.camera);
    this.camera.setReducedMotion(options.reducedMotion);
  }

  setNodes(nodes: FieldNodeInput[]): void {
    this.field.setNodes(nodes);
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

  rebuildHits(scene: AuditScene, positions: ReadonlyMap<string, { x: number; y: number }>, k: number): void {
    this.hits.buildFrom(scene, positions, k);
  }

  hitAt(x: number, y: number): string | null {
    return this.hits.at(x, y);
  }

  dispose(): void {
    this.field.dispose();
    this.softLayer.release();
    this.backdrop.release();
  }
}
