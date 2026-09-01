// THE RENDERER BOUNDARY.
//
// One contract, two painters. Everything the field needs in order to be drawn
// arrives through this interface, and everything a reader does to it leaves
// through the same callbacks — so swapping SVG for Canvas swaps a PAINTER and
// nothing else.
//
// ── WHAT A PAINTER OWNS, AND WHAT IT MUST NOT ──────────────────────────
//
// A painter owns the visual world: pixels, sprites, the render loop, hit
// geometry, and the pointer gestures that move the camera. That is all.
//
// React and Signal keep everything else, and the list is deliberately long
// because the temptation with a canvas is to let it grow a second product
// inside itself: Audit state, Graphology, selection, Search, the inspector,
// Findings, actions, Reality controls, provenance, source and evidence
// panels, keyboard commands, reduced motion, Back/Forward and routing all
// stay outside. A painter receives a READ-ONLY scene description and a set of
// callbacks; it never stores what is selected, never decides what a Finding
// means, and never writes to the graph.
//
// The practical test: deleting a painter must lose nothing but pixels.

import type { AuditGraph } from "@/lib/audit/graph";
import type { ZoomLevel } from "../graphTokens";
import type { Camera } from "../cameraMotion";

export type RendererId = "svg" | "canvas";

export const RENDERERS: RendererId[] = ["svg", "canvas"];

/** The renderer that ships. Canvas is opt-in for as long as this slice is an
    experiment — an A/B you have to ask for is an A/B nobody is exposed to by
    accident. */
export const DEFAULT_RENDERER: RendererId = "canvas";

export type SpatialFrameReason = "selection" | "search" | "trace" | "history" | "cluster";

/**
 * The Canvas viewport's imperative spatial seam.
 *
 * Product code supplies canonical ids and intent. It never supplies a world
 * coordinate: only the Rubric viewport knows where those ids are *now*.
 * SVG keeps its legacy camera path and simply never registers this API.
 */
export interface AuditSpatialAuthority {
  resolveWorldPosition(id: string): { x: number; y: number } | null;
  frameIds(ids: readonly string[], options?: { reason?: SpatialFrameReason; padding?: number }): boolean;
  fit(): void;
  zoomBy(factor: number): void;
  flyToCamera(camera: Camera): void;
  cancelFlight(): void;
}

/**
 * WHICH PAINTER, FROM THE URL.
 *
 * `?renderer=canvas` / `?renderer=svg`. Deliberately a query parameter rather
 * than a build flag or a stored preference: the whole value of this slice is
 * being able to put two tabs side by side on the same graph, at the same
 * camera, and flip between them without a rebuild or a reload of state.
 *
 * An unrecognised value falls back to the default rather than throwing. A
 * typo in a URL should show you the product, not an error page.
 */
export function resolveRenderer(search: string | null | undefined): RendererId {
  if (!search) return DEFAULT_RENDERER;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const asked = params.get("renderer");
  return (RENDERERS as string[]).includes(asked ?? "") ? (asked as RendererId) : DEFAULT_RENDERER;
}

/**
 * EXACTLY WHAT BOTH PAINTERS TAKE.
 *
 * This is the SVG renderer's existing prop list, promoted to a contract. It
 * is stated here rather than in either painter so that neither can quietly
 * grow a prop the other does not honour — which is how "same product, two
 * renderers" becomes "two products" without anybody deciding to.
 */
export interface AuditRendererProps {
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
  /** The detail tier, decided upstream WITH HYSTERESIS. */
  level: ZoomLevel;
  /** The LIVE camera, not the last rendered one. Wheel and drag events arrive
      faster than React commits and each must chain off the previous result. */
  getCamera: () => Camera;
  onCamera: (c: Camera) => void;
  onSelect: (id: string | null) => void;
  /** Direct surface selection. Rubric clicks select in place; product
      navigation such as Search may still use `onSelect` to frame a result. */
  onPointerSelect?: (id: string | null) => void;
  onHover: (id: string | null) => void;
  /** Cluster ids the user has expanded. */
  expanded: Set<string>;
  onToggleCluster: (cluster: string) => void;
  /** Degrees, or null when no audit sweep is running. */
  sweepAngle: number | null;
  /** Clusters the sweep has already tested this pass. */
  swept: Set<string>;
  /** The measured viewport, in CSS pixels, reported upward whenever it
      changes. The framing law lives in the instrument, but only the element
      being resized knows how big the field actually is on screen. */
  onViewport?: (vp: { w: number; h: number }) => void;
  /** Canvas registers the sole live geometry/camera authority here. */
  onSpatialAuthority?: (authority: AuditSpatialAuthority | null) => void;
}

/**
 * THE CAMERA, BEHIND A SEAM.
 *
 * Signal's camera is not being replaced in this slice — see the study in
 * docs/SIGNAL-RENDERER.md for why, and for what would have to be true before
 * it was. This exists so that decision stays reversible: everything a painter
 * needs from a camera is these six methods, so a different implementation
 * behind them is a swap rather than a rewrite of both painters.
 *
 * It is deliberately NARROW. No inertia, no gesture state, no easing curve,
 * no queue — those are the camera's own business, and putting them in the
 * interface would bake today's answers into the seam meant to outlive them.
 */
export interface CameraAdapter {
  getTransform(): Camera;
  /** Direct write. Cancels any move in flight — the hand outranks the
      animation, always. */
  setTransform(c: Camera): void;
  /** Eased move. Retargets from wherever the camera has actually reached
      rather than restarting, and resolves when it arrives or is cancelled. */
  animateTo(c: Camera, ms?: number): void;
  cancel(): void;
  screenToWorld(p: { x: number; y: number }): { x: number; y: number };
  worldToScreen(p: { x: number; y: number }): { x: number; y: number };
}

/**
 * The pure half of the adapter — the two projections, with no ownership of
 * the camera at all.
 *
 * Both painters need these on every frame and every pointer event, and both
 * would otherwise write the same four lines slightly differently. `vp` is the
 * viewport in CSS pixels; the origin of screen space is the element's own top
 * left corner, which is what a pointer event reports against.
 */
export function screenToWorld(
  p: { x: number; y: number },
  camera: Camera,
  vp: { w: number; h: number }
): { x: number; y: number } {
  return {
    x: camera.x + (p.x - vp.w / 2) / camera.k,
    y: camera.y + (p.y - vp.h / 2) / camera.k,
  };
}

export function worldToScreen(
  p: { x: number; y: number },
  camera: Camera,
  vp: { w: number; h: number }
): { x: number; y: number } {
  return {
    x: (p.x - camera.x) * camera.k + vp.w / 2,
    y: (p.y - camera.y) * camera.k + vp.h / 2,
  };
}
