// THE SPATIAL FIELD — RINGS AND CONSTELLATIONS, AND THE MORPH BETWEEN THEM.
//
// ADAPTED FROM RUBRIC SECOND BRAIN — `public/_core.js`:
//   Rings subsystem              lines 339-545
//   `buildSim()` bounded branch  lines 547-736
//   layout lifecycle / retention lines 310-325
//
// Original work: Copyright (c) 2026 Jay E | RoboNuggets
// (https://skool.com/robonuggets), licensed CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/legalcode).
// Reference copy: lab/rubric-reference/second-brain/public/_core.js
//
// CHANGES MADE BY SIGNAL — the list matters, because most of them are laws:
//
//   · RANDOM SEEDING IS REPLACED BY A DETERMINISTIC ID HASH. Rubric seeds
//     with `Math.random()` (`seed()`, lines 93-96). Signal must reload to the
//     same field or spatial memory is a lie, so every start position is a
//     pure function of the canonical id.
//   · ARMS / filesystem semantics do not cross. Rubric's departments, layers,
//     byte sizes and file counts are replaced by Signal anchors and bands
//     (./anchors), and Rubric's `radiusOf` byte-size function is not ported
//     at all — the handoff marks it DO NOT TAKE and it has no Audit meaning.
//   · TRANSITIONS ARE ELAPSED-TIME, NOT FRAME-COUNT. Rubric's `transK()` uses
//     `26 + (1-spd)*110` FRAMES, which runs at a different speed on every
//     display. Signal uses milliseconds and honours reduced motion.
//   · GENERIC RELATIONSHIP SPRINGS ARE ZERO, as in Rubric's own shipped
//     bounded configuration (`index.html` skin, `g_link: 0`) — and here it is
//     a stated law rather than a dial, because a cross-lane citation must
//     never move either endpoint (protected law 12).
//   · The simulation is PRESENTATION ONLY. It reads a projection and writes
//     x/y into its own node objects. Graphology is never touched.

import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { FIELD } from "../graphLayout";
import { anchorPolicies, CORE_ANCHOR, type Band } from "./anchors";

export type LayoutMode = "rings" | "force" | "circle" | "hex" | "constellations";
/**
 * Rubric's actual structural vocabulary, with product-facing names kept out
 * of the UI.  This is intentionally not a generic renderer role list: these
 * values drive the same Skills / Memory / Routines / Applications branches
 * as `_core.js::computeRingTargets()` and `buildSim()`.
 */
export type RubricVisualRole =
  | "router" | "skill" | "memory" | "routine" | "app" | "hub"
  /** Read-only compatibility for older proof fixtures; the adapter emits none. */
  | "aggregate" | "artifact" | "leaf";
export type AuditTerritory = "model" | "delivery" | "evidence" | "external";

export interface FieldNodeInput {
  id: string;
  /** Drawn radius, world units. Signal presentation policy, never data. */
  r: number;
  anchor: string;
  band: Band;
  /** Stable sort key inside a sector. Semantic priority, never size. */
  order: number;
  /** Rubric visual role selected by the Signal adapter. */
  role: RubricVisualRole;
  /** A lane puck or Reality — seats the cell its members gather around. */
  isAnchorNode: boolean;
  isCore: boolean;
  /** First-level Audit geography. */
  territory: AuditTerritory;
  /** Second-level semantic lane, source artifact, or subtype/currentness cell. */
  cell: string;
  /** Canonical or projected local hub; never inferred from graph edges in the field. */
  parentId: string | null;
  /** The source-system/application hub which owns this artifact, if any. */
  sourceSystemId: string | null;
  /** Presentation-only Rubric app/hub, never a canonical Signal object. */
  presentationOnly: boolean;
}

interface FieldNode extends FieldNodeInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  /** Rings target: angle, radius, and how fast it rides the spin. */
  rA: number;
  rR: number;
  rSpin: number;
  /** Where this node was when the current morph started. */
  trX: number;
  trY: number;
  /** Held by the hand. Outranks every layout. */
  pin: { x: number; y: number } | null;
  /** Released from the hand: easing back to its seat. */
  spring: { x: number; y: number; t0: number } | null;
  /** Rubric bounded-layout free drop: the hand chose this temporary home. */
  userHome: boolean;
  /** Constellation scatter target, for nodes the cell does not gather. */
  bTx: number;
  bTy: number;
}

/**
 * TUNING, IN ONE PLACE, EACH TRACEABLE TO A RUBRIC CONSTANT.
 *
 * The handoff is explicit that Rubric's numbers are "starting calibration,
 * not product laws" (§4 Force). These are Signal's, stated proportionally to
 * Rubric's so a reader can see what moved and why.
 */
export const TUNING = {
  /** Rubric: `alphaDecay(.022)` for a normal simulation. */
  alphaDecay: 0.022,
  /**
   * Rubric offers .38 (orbit personality) or .52 (drift). The shipped skin
   * uses `transStyle: 'orbit'` → .38, and the handoff lists the two as an
   * explicit A/B (§16.6). .38 settles with a sweep, which is the reference
   * feel; Signal takes it.
   */
  velocityDecay: 0.38,
  /** Rubric tight-cluster collision: `radius + 0.6 + g_pad * 3.6`, str .7.
      Shipped `g_pad: 1` → radius + 4.2. */
  collidePad: 4.2,
  collideStrength: 0.7,
  /** Rubric tight-cluster charge range: `60 + g_reach * 180`. Shipped
      `g_reach: .53` → 155. */
  chargeDistanceMax: 155,
  chargeTheta: 0.95,
  /** Rubric charge by type, scaled by `gC = .3 + g_charge * 1.4`. Shipped
      `g_charge: .67` → 1.238. Signal maps router→Reality, hub→lane puck,
      dir→aggregate-ish, file→leaf. */
  chargeCore: -720,
  chargeAnchor: -300 * 0.15,
  chargeLeaf: -22 * 1.238,
  chargeStructure: -34 * 1.238,
  /**
   * Rubric hub orbit ring: radius 105, radial strength .85 (`_core.js` 667-678).
   *
   * AS A FRACTION OF THE BOUNDED RADIUS, NOT AS A WORLD CONSTANT. Rubric's
   * 105 sits at roughly a third of its own R, so its cells have room to form
   * AROUND their hubs. Pinning Signal's ring to a fixed 263 world units put
   * it at 88% of a computed R of ~300 — the pucks were against the wall and
   * every cell had to sprawl inward past its neighbours. Measured, 261 of 413
   * nodes ended up nearer a foreign lane's anchor than their own, which is
   * the spatial law failing outright even though the picture looked fine.
   */
  anchorRingFraction: 0.58,
  anchorRingStrength: 0.85,
  /**
   * How firmly a lane holds its own bearing.
   *
   * Strong enough that a 195-member cell cannot drag its lane across the
   * field; weak enough that the cell still settles organically around it.
   * This has no Rubric equivalent — see the note at its use.
   */
  anchorBearing: 0.35,
  /** Rubric deptPull: `v*v * .34 * (.4 + g_pull*1.2) * alpha`. Shipped
      `g_pull: 0` yields ≈.098. Signal's nested source/type cells need .22;
      this was already the live coefficient and is centralized here so the
      proof can state and sweep it rather than leaving a hidden literal. */
  groupPull: 0.22,
  /**
   * And how hard a cell holds together once the simulation has cooled.
   *
   * Rubric's `deptPull` is multiplied by alpha, so it vanishes as the field
   * settles and whatever it achieved while hot is the final arrangement.
   * That works at Rubric's densities; Signal's largest lane holds 195 seats
   * against a 1-seat neighbour, and charge plus collision push a cell that
   * big apart faster than a decaying pull can gather it. A small residual
   * keeps the cell coherent at rest without freezing it.
   */
  groupPullFloor: 0.085,
  /** A member stays within this fraction of its parent hub's nearest-hub gap. */
  cellOwnershipFactor: 0.55,
  /** Rubric bound force: `(lim/r - 1) * .22` applied to velocity. */
  boundStrength: 0.22,
  /** GENERIC RELATIONSHIP SPRINGS. Zero, and not a dial. */
  linkSpring: 0,
  /** Rubric Rings: `spin * .0014` per frame; shipped `spin: .17`. Converted
      to radians per second at 60fps. */
  ringSpin: 0.17 * 0.0014 * 60,
  /** Rubric Rings wobble: `sin(tick*.008 + r + a*7) * 1.5`. */
  ringWobble: 1.5,
  ringWobbleRate: 0.008 * 60,
  /** Rubric seats: roughly 15 world units per seat on a ring. Signal's marks
      are smaller, so seats are tighter. */
  seatWidth: 15,
  /** Rubric's Circle/Hex size control. The source exposes 0..1 and computes
      `R * (.55 + boundSize * .9)`. Signal's two 190+ member groups need the
      upper half of that native range to occupy a reviewable field. */
  boundSize: 0.9,
  /** Rubric's shipped `g_rim: .69` through `0.12 + g_rim * .36`. */
  rimHomeStrength: 0.12 + 0.69 * 0.36,
  /** Keep dense Ring sectors territorial instead of turning them into long
      radar arcs. This only changes angle; Signal's band radius remains law. */
  ringSectorCompactness: 1.55,
  /** Rubric transition: 26-136 FRAMES. Signal: milliseconds. */
  morphMs: 620,
  /** Rubric drag return: 36 frames, ease-out cubic. */
  returnMs: 600,
} as const;

/** Deterministic, id-derived, in [0,1). Replaces Rubric's `Math.random()`. */
function hash01(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
/** Rubric's orbit-style smoothstep — `ringBlend`, line 380. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export interface FieldOptions {
  mode: LayoutMode;
  reducedMotion: boolean;
}

/**
 * ONE WORLD, TWO ARRANGEMENTS.
 *
 * The same node objects serve both layouts, which is the whole reason a
 * morph is possible: Rubric's `setLayout()` (lines 310-325) stops the old
 * simulation but RETAINS every node's current x/y/vx/vy, so the new
 * arrangement starts from where the field actually is. Rebuilding from
 * scratch is what makes a layout switch read as a page change.
 */
export class SpatialField {
  private nodes = new Map<string, FieldNode>();
  private order: FieldNode[] = [];
  private sim: Simulation<FieldNode, undefined> | null = null;
  private mode: LayoutMode;
  private reduced: boolean;
  private ringRot = 0;
  private clock = 0;
  private morph: { t0: number } | null = null;
  /** Paint-only progress when entering Constellations; never feeds physics. */
  private morphK = 1;
  private ringsKey = "";
  private ringGuideValues: { id: string; label: string; r: number }[] = [];
  /** Reported upward so the painter can draw the boundary the physics uses. */
  boundR = 0;
  private territoryGeometry = new Map<AuditTerritory, { x: number; y: number; r: number }>();
  private focusId: string | null = null;
  private bloomTargets = new Set<string>();
  private bloom = new Map<string, number>();

  // ── THE ORIGIN ─────────────────────────────────────────────────────
  //
  // RUBRIC'S WORLD IS CENTRED ON (0,0); SIGNAL'S IS CENTRED ON FIELD.cx/cy.
  //
  // Every force, every ring target and every bound in the adapted code below
  // is written in Rubric's convention, because rewriting `forceRadial(0,0)`
  // and `Math.hypot(d.x, d.y)` into an offset frame is exactly how a faithful
  // port acquires bugs. So the offset is applied ONCE, on the way out, and
  // removed once on the way in.
  private readonly ox = FIELD.cx;
  private readonly oy = FIELD.cy;

  constructor(opts: FieldOptions) {
    this.mode = opts.mode;
    this.reduced = opts.reducedMotion;
  }

  get layout(): LayoutMode {
    return this.mode;
  }

  get morphing(): boolean {
    return this.morph != null;
  }

  /** Radius the Rubric camera should frame for the current arrangement. */
  get viewRadius(): number {
    if (this.mode !== "rings") {
      // Fit the geography that actually settled, not the empty outer safety
      // bound. The latter is intentionally generous so cells can breathe;
      // using it as the camera extent made four healthy territories read as
      // one small cloud stranded in the middle of the viewport.
      let occupied = 0;
      for (const node of this.order) occupied = Math.max(occupied, Math.hypot(node.x, node.y) + node.r);
      return Math.max(180, Math.min(this.boundR || 300, occupied + 28));
    }
    let r: number = FIELD.outerR;
    for (const node of this.order) r = Math.max(r, node.rR + node.r + 18);
    return r;
  }

  /** The exact guides produced by Rubric's ring geometry this epoch. */
  get ringGuides(): readonly { id: string; label: string; r: number }[] {
    return this.ringGuideValues;
  }

  /**
   * Whether the field is doing something OTHER than idling.
   *
   * The ambient governor needs to judge the cost of ambient motion alone, and
   * `tick()`'s return value cannot tell it: ambient motion makes `tick()`
   * report movement, so "is anything moving" was always true and the governor
   * never sampled a single frame.
   */
  get busy(): boolean {
    if (this.morph != null) return true;
    if (this.order.some((n) => n.spring || n.pin)) return true;
    if (this.mode !== "rings" && this.sim) return this.sim.alpha() > this.sim.alphaMin();
    return false;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) this.bloom.clear();
  }

  /**
   * B3 LOCAL WAKE: stable global topology, elastic local geometry.
   *
   * The semantic focus set supplies candidates, but only already-nearby,
   * non-anchor clutter is displaced. A related node on the other side of the
   * map is never pulled across the field. Offsets live in the output field;
   * resting homes, D3 state and Graphology remain untouched.
   */
  setFocus(id: string | null, related: readonly string[]): void {
    this.focusId = id && this.nodes.has(id) ? id : null;
    this.bloomTargets.clear();
    if (!this.focusId || this.reduced) return;
    const focus = this.nodes.get(this.focusId)!;
    const local = related
      .map((rid) => this.nodes.get(rid))
      .filter((n): n is FieldNode => !!n && n.id !== focus.id)
      .filter((n) => !n.isAnchorNode && n.role !== "router" && n.role !== "hub" && n.role !== "artifact" && n.role !== "aggregate")
      .map((n) => ({ n, distance: Math.hypot(n.x - focus.x, n.y - focus.y) }))
      .filter(({ n, distance }) => distance <= 190 || n.cell === focus.cell)
      .sort((a, b) => a.distance - b.distance || a.n.id.localeCompare(b.n.id))
      .slice(0, 36);
    for (const { n } of local) this.bloomTargets.add(n.id);
  }

  private advanceBloom(dt: number): boolean {
    if (this.reduced) return false;
    let moving = false;
    const ids = new Set([...this.bloom.keys(), ...this.bloomTargets]);
    for (const id of ids) {
      const from = this.bloom.get(id) ?? 0;
      const target = this.bloomTargets.has(id) ? 1 : 0;
      const step = dt / (target > from ? 180 : 260);
      const next = target > from ? Math.min(target, from + step) : Math.max(target, from - step);
      if (next <= 0.001 && target === 0) this.bloom.delete(id);
      else this.bloom.set(id, next);
      if (Math.abs(next - target) > 0.001) moving = true;
    }
    return moving;
  }

  /**
   * AMBIENT MOTION — the spin and the wobble that keep a settled field alive.
   *
   * Rubric's loop never stops and its rings never stop turning. On hardware
   * that composites a canvas on the GPU that is free; on hardware that does
   * not, every ambient frame re-rasterises the whole backing store, and a
   * field that is doing nothing costs more than a field being dragged.
   *
   * So it is governed rather than assumed — see the governor in
   * CanvasAuditRenderer. It stays on where it is affordable, which is the
   * reference feel, and turns itself off where it is not, which is the
   * difference between a slow instrument and a still one.
   */
  private ambient = true;

  setAmbient(on: boolean): void {
    this.ambient = on;
  }

  get ambientOn(): boolean {
    return this.ambient && !this.reduced;
  }

  /**
   * Install the population.
   *
   * Nodes already present KEEP their coordinates — that is the retention
   * contract. New ones are seeded deterministically near their anchor.
   */
  setNodes(input: FieldNodeInput[]): void {
    const seen = new Set<string>();
    const anchors = anchorPolicies();
    const byKey = new Map(anchors.map((a) => [a.key, a]));

    for (const n of input) {
      seen.add(n.id);
      const held = this.nodes.get(n.id);
      if (held) {
        held.r = n.r;
        held.anchor = n.anchor;
        held.band = n.band;
        held.order = n.order;
        held.role = n.role;
        held.isAnchorNode = n.isAnchorNode;
        held.isCore = n.isCore;
        held.territory = n.territory;
        held.cell = n.cell;
        held.parentId = n.parentId;
        held.sourceSystemId = n.sourceSystemId;
        held.presentationOnly = n.presentationOnly;
        continue;
      }
      const a = byKey.get(n.anchor);
      // DETERMINISTIC SEED. Rubric randomises; Signal cannot.
      const ang = (a?.angle ?? 0) + (hash01(n.id, 1) - 0.5) * 0.9;
      const rad = n.isCore
        ? hash01(n.id, 2) * FIELD.modelR
        : (a?.radius ?? FIELD.clusterR) * (0.55 + hash01(n.id, 3) * 0.5);
      this.nodes.set(n.id, {
        ...n,
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad,
        vx: 0,
        vy: 0,
        rA: 0,
        rR: 0,
        rSpin: 1,
        trX: 0,
        trY: 0,
        pin: null,
        spring: null,
        userHome: false,
        bTx: 0,
        bTy: 0,
      });
    }
    for (const id of [...this.nodes.keys()]) if (!seen.has(id)) this.nodes.delete(id);
    this.order = [...this.nodes.values()];
    this.ringsKey = "";
    if (this.mode !== "rings") this.buildSim(0.9);
  }

  /**
   * Switch arrangement, keeping the world.
   *
   * Rubric's `initRings()` (lines 341-350) stores every node's current
   * position into `_trX/_trY` and glides from there. Both directions get the
   * same treatment here, so Constellations → Rings is as continuous as
   * Rings → Constellations.
   */
  setMode(mode: LayoutMode): void {
    if (mode === this.mode) return;
    this.snapshot();
    this.mode = mode;
    if (mode !== "rings") this.buildSim(0.55);
    else this.sim?.stop();
    this.ringsKey = "";
  }

  private snapshot(): void {
    for (const n of this.order) {
      n.trX = n.x;
      n.trY = n.y;
    }
    // Reduced motion still SWITCHES — it simply arrives immediately, because
    // a morph is motion and someone has asked for less of it.
    this.morph = this.reduced ? null : { t0: this.clock };
    this.morphK = this.reduced ? 1 : 0;
  }

  // ── RINGS ────────────────────────────────────────────────────────────
  //
  // DIRECTLY MODULARISED FROM `ringsGeom()` / `computeRingTargets()` /
  // `placeRingNode()` (`_core.js` 394-545). Signal supplies only the role,
  // group and the constrained disagreement offset inside Memory.

  private computeRingTargets(): void {
    const anchors = anchorPolicies().filter((a) => a.key !== CORE_ANCHOR);

    for (const n of this.order) {
      n.rA = 0;
      n.rR = 0;
      n.rSpin = 1;
    }

    // SECTOR WIDTH BY SQRT OF POPULATION — Rubric line 461. Equal sectors
    // waste the field: Signal's evidence lane holds 194 seats and its figma
    // lane holds one, and giving them the same 45° makes one a smear and the
    // other a desert.
    const pools = anchors.map((a) =>
      this.order
        .filter((n) => n.role === "memory" && n.anchor === a.key)
        .sort((x, y) => x.order - y.order || (x.id < y.id ? -1 : 1))
    );
    const weights = pools.map((p) => Math.sqrt(Math.max(4, p.length)));
    const wSum = weights.reduce((s, w) => s + w, 0) || 1;

    // The core is not in a sector: Reality at the centre, the model around it.
    const reality = this.order.find((n) => n.role === "router");
    if (reality) {
      reality.rA = 0;
      reality.rR = 0;
      reality.rSpin = 0;
    }
    // Rubric Skills: innermost full-circle rings, fixed 15-unit seats.
    const skills = this.order
      .filter((n) => n.role === "skill")
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    let skillsR = 72;
    let skillIndex = 0;
    while (skillIndex < skills.length) {
      const cap = Math.max(6, Math.floor((Math.PI * 2 * skillsR) / TUNING.seatWidth));
      const count = Math.min(cap, skills.length - skillIndex);
      for (let j = 0; j < count; j++) {
        const n = skills[skillIndex + j];
        n.rA = -Math.PI / 2 + (j / Math.max(1, count)) * Math.PI * 2;
        n.rR = skillsR;
        n.rSpin = 1.6;
      }
      skillIndex += count;
      if (skillIndex < skills.length) skillsR += 17;
    }
    const skillsEnd = skills.length ? skillsR : 72;
    const hubR = skillsEnd + 30;
    const memR = skillsEnd + 62;

    let acc = -Math.PI / 2;
    let maxMemR = memR;
    anchors.forEach((a, ci) => {
      const width = (weights[ci] / wSum) * Math.PI * 2;
      const a0 = acc + width / 2;
      acc += width;
      // Rubric line 470: span is a fraction of the sector, clamped clear of
      // its neighbours. Shipped `span: .59` → spanBase .512.
      const span =
        Math.min(width * 0.42, width / 2 - 0.03) * (0.6 + 0.512) * TUNING.ringSectorCompactness;

      const hub = this.order.find((n) => n.isAnchorNode && n.anchor === a.key);
      if (hub) {
        hub.rA = a0;
        hub.rR = hubR;
        hub.rSpin = 1;
      }

      // Rubric Memory: one coherent outward-walking pool per department.
      // Signal disagreement is a bounded secondary offset inside each row.
      const pool = pools[ci];
      let r = memR;
      let idx = 0;
      while (idx < pool.length) {
        const cap = Math.max(3, Math.floor((2 * span * r) / TUNING.seatWidth));
        const count = Math.min(cap, pool.length - idx);
        for (let j = 0; j < count; j++) {
          const n = pool[idx + j];
          const frac = count === 1 ? 0.5 : j / (count - 1);
          const disagreement = n.band === "conflict" ? 12 : n.band === "drift" || n.band === "external" ? 6 : 0;
          n.rA = a0 - span + frac * 2 * span;
          n.rR = r + disagreement;
          n.rSpin = 1;
        }
        idx += count;
        r += 20;
      }
      maxMemR = Math.max(maxMemR, r);
    });

    // Rubric Routines, then Applications. These are independent full rings;
    // source systems are application-scale anchors, never artifact dots.
    const routines = this.order.filter((n) => n.role === "routine").sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const routineR = maxMemR + 46;
    routines.forEach((n, i) => {
      n.rA = -Math.PI / 2 + (i / Math.max(1, routines.length)) * Math.PI * 2;
      n.rR = routineR;
      n.rSpin = 0.7;
    });
    const apps = this.order.filter((n) => n.role === "app").sort((a, b) => a.id.localeCompare(b.id));
    const appR = routineR + 62;
    apps.forEach((n, i) => {
      n.rA = 0.52 + ((i + 0.5) / Math.max(1, apps.length) - 0.5) * Math.PI * 2;
      n.rR = appR;
      n.rSpin = 0;
    });
    this.ringGuideValues = [
      { id: "accepted-model", label: "Accepted model", r: skillsEnd },
      { id: "project-world", label: "Project world", r: Math.max(memR, maxMemR - 20) },
      { id: "attention", label: "Attention / open loops", r: routineR },
      { id: "source-systems", label: "Source systems", r: appR },
    ];
  }

  private ringsCacheKey(): string {
    return `${this.order.length}|${this.order.map((n) => n.id).join("").length}`;
  }

  private placeRings(dt: number): void {
    // Rubric line 419: `ringsState.rot += spin * .0014` per frame.
    // `ringSpin` is radians/second; the shared render clock is milliseconds.
    if (this.ambientOn) this.ringRot += TUNING.ringSpin * dt * 0.001;
    const key = this.ringsCacheKey();
    if (key !== this.ringsKey) {
      this.computeRingTargets();
      this.ringsKey = key;
    }
    const k = this.morphProgress();
    for (const n of this.order) {
      if (n.pin) {
        n.x = n.pin.x;
        n.y = n.pin.y;
        continue;
      }
      const ang = n.rA + this.ringRot * n.rSpin;
      // Rubric `placeRingNode` line 540: radial wobble, low amplitude, phase
      // from the seat itself so neighbours do not breathe in unison.
      const w = this.ambientOn
        ? Math.sin(this.clock * TUNING.ringWobbleRate * 0.001 + n.rR + ang * 7) * TUNING.ringWobble
        : 0;
      const tx = Math.cos(ang) * (n.rR + w);
      const ty = Math.sin(ang) * (n.rR + w);
      const [bx, by] = this.blend(n, tx, ty, k);
      n.x = bx;
      n.y = by;
      n.vx = 0;
      n.vy = 0;
    }
  }

  /**
   * ADAPTED FROM `ringBlend()` — lines 363-389, orbit style.
   *
   * Interpolating in POLAR coordinates rather than Cartesian is the detail
   * that makes a Rubric layout change read as one world reorganising rather
   * than as every dot taking the shortest path through the middle. Points
   * sweep around the centre on their way to their new seat.
   */
  private blend(n: FieldNode, tx: number, ty: number, k: number): [number, number] {
    if (n.spring) {
      const kk = (this.clock - n.spring.t0) / TUNING.returnMs;
      if (kk >= 1) n.spring = null;
      else {
        const e = easeOutCubic(kk);
        return [n.spring.x + (tx - n.spring.x) * e, n.spring.y + (ty - n.spring.y) * e];
      }
    }
    if (k >= 1) return [tx, ty];
    const r0 = Math.hypot(n.trX, n.trY);
    const a0 = Math.atan2(n.trY, n.trX);
    const r1 = Math.hypot(tx, ty);
    const a1 = Math.atan2(ty, tx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const e = smoothstep(k);
    return [Math.cos(a0 + da * e) * (r0 + (r1 - r0) * e), Math.sin(a0 + da * e) * (r0 + (r1 - r0) * e)];
  }

  private morphProgress(): number {
    if (!this.morph) return 1;
    const t = (this.clock - this.morph.t0) / TUNING.morphMs;
    if (t >= 1) {
      this.morph = null;
      return 1;
    }
    return t;
  }

  // ── CONSTELLATIONS ───────────────────────────────────────────────────
  //
  // ADAPTED FROM `buildSim()` circle branch — lines 574-736. The mechanism
  // that makes a Rubric field cohere is, in the handoff's own words, "the
  // combination of bounded space, group hubs, short-range charge, collision,
  // group pull, and nearly absent relationship springs — not automatic graph
  // clustering". All six are here. None of them reads an edge.

  private buildSim(alpha: number): void {
    this.sim?.stop();
    const nodes = this.order;
    if (nodes.length === 0) return;

    // Population means the CURRENT zoom-tier projection, not all hidden
    // canonical members. That is what prevents corpus volume from deciding
    // the size of the geography at Fit.
    // Rings teaches the reader a world roughly FIELD.outerR across. The
    // bounded view must inhabit that same learned scale; a 55-node far-tier
    // projection previously collapsed into a 360-unit island at the centre
    // while the preserved Rings camera kept looking at a 706-unit world.
    // Population may grow the bound, but progressive aggregation may not
    // shrink the whole instrument into a thumbnail.
    const R = Math.max(FIELD.outerR * 0.9, 68 * Math.sqrt(nodes.length / Math.PI));
    this.boundR = R;

    const territoryCentre: Record<AuditTerritory, { x: number; y: number; r: number }> = {
      model: { x: 0, y: 0, r: R * 0.22 },
      delivery: { x: -R * 0.42, y: R * 0.18, r: R * 0.29 },
      evidence: { x: R * 0.42, y: R * 0.18, r: R * 0.29 },
      external: { x: 0, y: -R * 0.48, r: R * 0.29 },
    };
    this.territoryGeometry = new Map(Object.entries(territoryCentre) as [AuditTerritory, { x: number; y: number; r: number }][]);

    // Second-level territories are semantic cells. A golden-angle packing is
    // deterministic, fills the allotted area, and never consults an edge.
    const cells = new Map<AuditTerritory, string[]>();
    for (const n of nodes) {
      const list = cells.get(n.territory) ?? [];
      if (!list.includes(n.cell)) list.push(n.cell);
      cells.set(n.territory, list);
    }
    for (const list of cells.values()) list.sort();
    const cellTarget = new Map<string, { x: number; y: number }>();
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (const [territory, list] of cells) {
      const t = territoryCentre[territory];
      list.forEach((cell, i) => {
        if (territory === "model" && cell === CORE_ANCHOR) {
          cellTarget.set(`${territory}|${cell}`, { x: 0, y: 0 });
          return;
        }
        const frac = Math.sqrt((i + 0.65) / Math.max(1, list.length));
        const angle = i * golden + hash01(`${territory}|${cell}`, 7) * 0.35;
        const radius = t.r * 0.78 * frac;
        cellTarget.set(`${territory}|${cell}`, {
          x: t.x + Math.cos(angle) * radius,
          y: t.y + Math.sin(angle) * radius,
        });
      });
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      n.fx = null;
      n.fy = null;
      if (n.userHome) continue;
      const target = cellTarget.get(`${n.territory}|${n.cell}`) ?? territoryCentre[n.territory];
      const jitter = n.role === "memory" ? Math.max(8, Math.min(28, n.r * 2.5)) : 0;
      const angle = hash01(n.id, 9) * Math.PI * 2;
      n.bTx = target.x + Math.cos(angle) * jitter;
      n.bTy = target.y + Math.sin(angle) * jitter;
    }

    // Reality is the sole router and the sole fixed node.
    const reality = nodes.find((n) => n.role === "router");
    if (reality) {
      reality.fx = 0;
      reality.fy = 0;
    }

    const sim = forceSimulation<FieldNode>(nodes)
      .force(
        "charge",
        forceManyBody<FieldNode>()
          .strength((d) =>
            d.role === "router" ? -520 :
            d.role === "hub" ? -115 :
            d.role === "app" || d.role === "routine" ? -60 :
            d.band === "structure" ? -26 : -18
          )
          .distanceMax(Math.max(155, R * 0.32))
          .theta(TUNING.chargeTheta)
      )
      .force("collide", forceCollide<FieldNode>((d) => d.r + TUNING.collidePad).strength(0.82))
      .force(
        "x",
        forceX<FieldNode>((d) => d.bTx).strength((d) =>
          d.fx != null || d.pin ? 0 : d.userHome ? 0.2 :
          d.role === "hub" || d.role === "app" || d.role === "routine" ? 0.32 : 0.045
        )
      )
      .force(
        "y",
        forceY<FieldNode>((d) => d.bTy).strength((d) =>
          d.fx != null || d.pin ? 0 : d.userHome ? 0.2 :
          d.role === "hub" || d.role === "app" || d.role === "routine" ? 0.32 : 0.045
        )
      )
      .alphaDecay(TUNING.alphaDecay)
      .velocityDecay(TUNING.velocityDecay);

    // Nested group pull. Passages pull to their own artifact; external claims
    // pull to their subtype/currentness aggregate; ordinary delivery objects
    // pull to their semantic lane hub. No generic relationship is consulted.
    sim.force("groupPull", (a2: number) => {
      for (const d of nodes) {
        if (d.fx != null || d.pin || d.userHome || !d.parentId) continue;
        const hub = byId.get(d.parentId);
        if (!hub) continue;
        const g = TUNING.groupPull * a2 + TUNING.groupPullFloor;
        d.vx += (hub.x - d.x) * g;
        d.vy += (hub.y - d.y) * g;
      }
    });

    // First-level territory bounds keep any one cloud from consuming the
    // field. Equal maximum radii cap the largest territory below 35% of the
    // four-territory area while preserving organic motion inside each cell.
    sim.force("territories", () => {
      for (const d of nodes) {
        if (d.fx != null || d.pin || d.userHome) continue;
        const t = territoryCentre[d.territory];
        const dx = d.x - t.x;
        const dy = d.y - t.y;
        const distance = Math.hypot(dx, dy);
        const limit = t.r - d.r - 4;
        if (distance > limit && distance > 0) {
          const f = (limit / distance - 1) * 0.28;
          d.vx += dx * f;
          d.vy += dy * f;
        }
      }
    });

    sim.force("bound", () => {
      for (const d of nodes) {
        if (d.fx != null || d.pin) continue;
        const distance = Math.hypot(d.x, d.y);
        const limit = R - d.r - 6;
        if (distance > limit && distance > 0) {
          const f = (limit / distance - 1) * TUNING.boundStrength;
          d.vx += d.x * f;
          d.vy += d.y * f;
        }
      }
    });

    sim.alpha(Math.max(0.35, alpha));
    sim.stop();
    this.sim = sim;
  }

  /**
   * Keep a semantic subcell inside its own hub's local territory.
   *
   * Rubric's bounded field constrains first-level territories. Signal has a
   * second level Rubric does not: source artifacts own passages and external
   * subtype/currentness cells own claims. A spring alone cannot state that
   * ownership at high cell counts; after alpha cools, collision can leave a
   * member just across a neighbouring hub's bisector. Constraining the member
   * near the bisector between its parent and the nearest competing hub makes
   * the ownership law geometric and independent of settlement time. The
   * constraint acts on the hidden live solution from its first fixed tick;
   * the painter's morph eases that solution in without feeding paint
   * interpolation back into physics.
   */
  private enforceCellOwnership(): void {
    const hubs = this.order.filter(
      (n) => n.role === "hub" || n.role === "app"
    );
    if (hubs.length < 2) return;
    const factor = TUNING.cellOwnershipFactor;
    for (const node of this.order) {
      if (!node.parentId || node.pin || node.userHome) continue;
      const own = this.nodes.get(node.parentId);
      if (!own) continue;
      let nearestHubGap = Infinity;
      for (const hub of hubs) {
        if (hub.id === own.id) continue;
        nearestHubGap = Math.min(nearestHubGap, Math.hypot(hub.x - own.x, hub.y - own.y));
      }
      if (!Number.isFinite(nearestHubGap)) continue;
      let dx = node.x - own.x;
      let dy = node.y - own.y;
      let distance = Math.hypot(dx, dy);
      const limit = nearestHubGap * factor;
      if (distance <= limit) continue;
      if (distance < 1e-6) {
        const angle = hash01(node.id, 23) * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      node.x = own.x + (dx / distance) * limit;
      node.y = own.y + (dy / distance) * limit;
      node.vx *= 0.35;
      node.vy *= 0.35;
    }
  }

  // ── THE HAND ─────────────────────────────────────────────────────────
  //
  // Protected law 13: the hand outranks animation. A dragged node is pinned
  // and every layout defers to it; Rubric does the same with `_pin` and
  // `fx/fy` (lines 832-899).

  grab(id: string): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.pin = { x: n.x, y: n.y };
    n.spring = null;
    if (this.mode !== "rings") {
      n.fx = n.x;
      n.fy = n.y;
      this.sim?.alphaTarget(0.28).alpha(Math.max(this.sim.alpha(), 0.28));
    }
  }

  /** `x`/`y` arrive in Signal world coordinates and are converted in. */
  dragTo(id: string, x: number, y: number): void {
    const n = this.nodes.get(id);
    if (!n?.pin) return;
    const lx = x - this.ox;
    const ly = y - this.oy;
    n.pin.x = lx;
    n.pin.y = ly;
    n.x = lx;
    n.y = ly;
    if (this.mode !== "rings") {
      n.fx = lx;
      n.fy = ly;
    }
  }

  /**
   * Release.
   *
   * Rubric's shipped skin enables `freeDrop` in bounded Circle/Hex layouts,
   * which is the source of Constellations. Rings still pulls a released node
   * back because radial position carries Signal's disagreement meaning.
   */
  release(id: string): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.pin = null;
    n.fx = null;
    n.fy = null;
    if (this.mode !== "rings" && n.role !== "router") {
      n.bTx = n.x;
      n.bTy = n.y;
      n.userHome = true;
      n.spring = null;
      // d3-force caches forceX/forceY accessors when a force is initialised.
      // Rebuild so Rubric's newly assigned `_userHome` and `_bT*` values are
      // actually adopted; merely reheating would keep the pre-drop target.
      this.buildSim(0.25);
    } else {
      n.spring = this.reduced ? null : { x: n.x, y: n.y, t0: this.clock };
      if (this.mode !== "rings") this.buildSim(0.5);
    }
  }

  /** Rubric double-click: forget a free-drop home and rejoin layout gravity. */
  resetHome(id: string): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.pin = null;
    n.fx = null;
    n.fy = null;
    n.userHome = false;
    n.spring = null;
    if (this.mode !== "rings") this.buildSim(0.3);
  }

  // ── THE CLOCK ────────────────────────────────────────────────────────

  /** Advance the world by `dt` milliseconds. Returns whether it still moves. */
  tick(dt: number): boolean {
    this.clock += dt;
    const blooming = this.advanceBloom(dt);
    if (this.mode === "rings") {
      this.placeRings(dt);
      // Rings is deterministic placement, so it is "moving" only while it
      // spins, wobbles, morphs or returns a dragged node.
      return this.ambientOn || this.morph != null || this.order.some((n) => n.spring) || blooming;
    }
    const sim = this.sim;
    if (!sim) return false;
    // Fixed-step, so physics does not change speed with frame rate.
    const steps = Math.min(3, Math.max(1, Math.round(dt / 16.67)));
    for (let i = 0; i < steps; i++) {
      if (sim.alpha() <= sim.alphaMin()) break;
      sim.tick();
      // Run once per FIXED physics step, not once per browser frame. A 30Hz
      // frame may contain two fixed steps and a 120Hz frame one; applying a
      // spatial law at frame cadence made the final field machine-dependent.
      this.enforceCellOwnership();
    }
    const k = this.morphProgress();
    // This is PAINT progress only. Mutating the D3 nodes with interpolated
    // positions here made the final solution depend on how many animation
    // frames occurred during the 620ms morph.
    this.morphK = k;
    return sim.alpha() > sim.alphaMin() || k < 1 || blooming;
  }

  /**
   * THE SAME MAP, MUTATED — not a fresh one every frame.
   *
   * A new Map plus 427 fresh point objects per frame is 25,600 allocations a
   * second whose only purpose is to be read once and discarded. Measured, it
   * was a material part of a frame budget that had nothing else wrong with
   * it. Callers read this within the frame and never retain it.
   */
  private readonly out = new Map<string, { x: number; y: number }>();

  positions(): Map<string, { x: number; y: number }> {
    const focus = this.focusId ? this.nodes.get(this.focusId) : null;
    for (const n of this.order) {
      let ox = 0;
      let oy = 0;
      const amount = this.bloom.get(n.id) ?? 0;
      if (focus && amount > 0) {
        let dx = n.x - focus.x;
        let dy = n.y - focus.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
          const angle = hash01(n.id, 41) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = Math.max(18, Math.min(36, 42 - distance * 0.12)) * easeOutCubic(amount);
        ox = (dx / distance) * push;
        oy = (dy / distance) * push;
      }
      const [baseX, baseY] = this.mode !== "rings" && this.morphK < 1
        ? this.blend(n, n.x, n.y, this.morphK)
        : [n.x, n.y];
      const held = this.out.get(n.id);
      if (held) {
        held.x = baseX + this.ox + ox;
        held.y = baseY + this.oy + oy;
      } else {
        this.out.set(n.id, { x: baseX + this.ox + ox, y: baseY + this.oy + oy });
      }
    }
    if (this.out.size !== this.order.length) {
      const live = new Set(this.order.map((n) => n.id));
      for (const id of [...this.out.keys()]) if (!live.has(id)) this.out.delete(id);
    }
    return this.out;
  }

  constellationMetrics(): {
    membersWithHub: number;
    nearestOwnHub: number;
    nearestOwnHubPct: number;
    largestTerritoryAreaShare: number;
    byTerritory: Record<AuditTerritory, { members: number; nearest: number; pct: number }>;
  } {
    const hubs = this.order.filter(
      (n) => n.role === "hub" || n.role === "app"
    );
    let membersWithHub = 0;
    let nearestOwnHub = 0;
    const counts: Record<AuditTerritory, { members: number; nearest: number }> = {
      model: { members: 0, nearest: 0 },
      delivery: { members: 0, nearest: 0 },
      evidence: { members: 0, nearest: 0 },
      external: { members: 0, nearest: 0 },
    };
    for (const node of this.order) {
      if (!node.parentId) continue;
      const own = this.nodes.get(node.parentId);
      if (!own) continue;
      membersWithHub++;
      counts[node.territory].members++;
      const ownDistance = Math.hypot(node.x - own.x, node.y - own.y);
      let best = Infinity;
      for (const hub of hubs) best = Math.min(best, Math.hypot(node.x - hub.x, node.y - hub.y));
      if (ownDistance <= best + 1e-6) {
        nearestOwnHub++;
        counts[node.territory].nearest++;
      }
    }
    const areas = [...this.territoryGeometry.values()].map((t) => Math.PI * t.r * t.r);
    const totalArea = areas.reduce((sum, area) => sum + area, 0);
    return {
      membersWithHub,
      nearestOwnHub,
      nearestOwnHubPct: membersWithHub > 0 ? (nearestOwnHub / membersWithHub) * 100 : 100,
      largestTerritoryAreaShare: totalArea > 0 ? Math.max(0, ...areas) / totalArea : 0,
      byTerritory: Object.fromEntries(
        (Object.entries(counts) as [AuditTerritory, { members: number; nearest: number }][]).map(([key, value]) => [
          key,
          { ...value, pct: value.members > 0 ? (value.nearest / value.members) * 100 : 100 },
        ])
      ) as Record<AuditTerritory, { members: number; nearest: number; pct: number }>,
    };
  }

  /** Where the field's centre sits in Signal world coordinates. */
  get origin(): { x: number; y: number } {
    return { x: this.ox, y: this.oy };
  }

  dispose(): void {
    this.sim?.stop();
    this.sim = null;
    this.nodes.clear();
    this.order = [];
    this.bloom.clear();
    this.bloomTargets.clear();
    this.territoryGeometry.clear();
  }
}
