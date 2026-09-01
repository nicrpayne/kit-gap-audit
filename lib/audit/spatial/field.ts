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
import { anchorPolicies, BANDS, CORE_ANCHOR, type Band } from "./anchors";

export type LayoutMode = "rings" | "constellations";
export type RubricVisualRole = "router" | "hub" | "aggregate" | "artifact" | "rim" | "leaf";
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
      `g_pull: 0` → .4 multiplier; v is the per-department gravity, shipped
      ~.85 → .85² * .34 * .4 ≈ .098. */
  groupPull: 0.098,
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
  groupPullFloor: 0.08,
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
  ringSectorCompactness: 0.68,
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
  private ringsKey = "";
  /** Reported upward so the painter can draw the boundary the physics uses. */
  boundR = 0;
  private territoryGeometry = new Map<AuditTerritory, { x: number; y: number; r: number }>();

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
    if (this.mode === "constellations") return this.boundR || 300;
    let r: number = FIELD.outerR;
    for (const node of this.order) r = Math.max(r, node.rR + node.r + 18);
    return r;
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
    if (this.mode === "constellations" && this.sim) return this.sim.alpha() > this.sim.alphaMin();
    return false;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
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
    if (this.mode === "constellations") this.buildSim(0.9);
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
    if (mode === "constellations") this.buildSim(0.55);
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
  }

  // ── RINGS ────────────────────────────────────────────────────────────
  //
  // ADAPTED FROM `computeRingTargets()` (lines 445-504) and `placeRingNode()`
  // (lines 538-545). What is Rubric's: sqrt-weighted sector allocation,
  // arithmetic row capacity, target caching by epoch, spin, radial wobble,
  // and the blend. What is Signal's: which band a thing sits in and what that
  // distance MEANS.

  private computeRingTargets(): void {
    const anchors = anchorPolicies().filter((a) => a.key !== CORE_ANCHOR);

    // SECTOR WIDTH BY SQRT OF POPULATION — Rubric line 461. Equal sectors
    // waste the field: Signal's evidence lane holds 194 seats and its figma
    // lane holds one, and giving them the same 45° makes one a smear and the
    // other a desert.
    const pools = anchors.map((a) =>
      this.order
        .filter((n) => n.anchor === a.key && !n.isAnchorNode)
        .sort((x, y) => x.order - y.order || (x.id < y.id ? -1 : 1))
    );
    const weights = pools.map((p) => Math.sqrt(Math.max(4, p.length)));
    const wSum = weights.reduce((s, w) => s + w, 0) || 1;

    // The core is not in a sector: Reality at the centre, the model around it.
    const core = this.order.filter((n) => n.isCore);
    const reality = core.find((n) => n.band === "core");
    if (reality) {
      reality.rA = 0;
      reality.rR = 0;
      reality.rSpin = 0;
    }
    const model = core.filter((n) => n !== reality).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    model.forEach((n, i) => {
      n.rA = -Math.PI / 2 + (i / Math.max(1, model.length)) * Math.PI * 2;
      n.rR = BANDS.model.r;
      n.rSpin = 1.4;
    });

    let acc = -Math.PI / 2;
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
        hub.rR = BANDS.cluster.r;
        hub.rSpin = 1;
      }

      // SEATED BY BAND, NOT BY ONE RUNNING RADIUS. This is the Signal
      // departure that matters: Rubric walks one pool outward from a single
      // start radius, which is correct when radius means nothing. Here radius
      // MEANS distance from agreement, so each band starts at its own radius
      // and only overflows outward within itself.
      const byBand = new Map<Band, FieldNode[]>();
      for (const n of pools[ci]) {
        const arr = byBand.get(n.band);
        if (arr) arr.push(n);
        else byBand.set(n.band, [n]);
      }
      for (const [band, pool] of byBand) {
        const policy = BANDS[band];
        let r = policy.r;
        let idx = 0;
        while (idx < pool.length) {
          // Rubric line 476: capacity is arithmetic — how many seats of a
          // fixed width fit the arc this sector owns at this radius.
          const cap = Math.max(3, Math.floor((2 * span * r) / TUNING.seatWidth));
          const count = Math.min(cap, pool.length - idx);
          for (let j = 0; j < count; j++) {
            const n = pool[idx + j];
            const frac = count === 1 ? 0.5 : j / (count - 1);
            n.rA = a0 - span + frac * 2 * span;
            n.rR = r;
            n.rSpin = 1;
          }
          idx += count;
          r += policy.rowStep || 20;
        }
      }
    });
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
    const R = Math.max(360, 68 * Math.sqrt(nodes.length / Math.PI));
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
      const jitter = n.role === "leaf" ? Math.max(8, Math.min(28, n.r * 2.5)) : 0;
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
            d.role === "artifact" || d.role === "aggregate" ? -58 :
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
          d.role === "hub" || d.role === "artifact" || d.role === "aggregate" ? 0.32 : 0.045
        )
      )
      .force(
        "y",
        forceY<FieldNode>((d) => d.bTy).strength((d) =>
          d.fx != null || d.pin ? 0 : d.userHome ? 0.2 :
          d.role === "hub" || d.role === "artifact" || d.role === "aggregate" ? 0.32 : 0.045
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
        const g = 0.22 * a2 + 0.085;
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
    if (this.mode === "constellations") {
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
    if (this.mode === "constellations") {
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
    if (this.mode === "constellations" && n.role !== "router") {
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
      if (this.mode === "constellations") this.buildSim(0.5);
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
    if (this.mode === "constellations") this.buildSim(0.3);
  }

  // ── THE CLOCK ────────────────────────────────────────────────────────

  /** Advance the world by `dt` milliseconds. Returns whether it still moves. */
  tick(dt: number): boolean {
    this.clock += dt;
    if (this.mode === "rings") {
      this.placeRings(dt);
      // Rings is deterministic placement, so it is "moving" only while it
      // spins, wobbles, morphs or returns a dragged node.
      return this.ambientOn || this.morph != null || this.order.some((n) => n.spring);
    }
    const sim = this.sim;
    if (!sim) return false;
    // Fixed-step, so physics does not change speed with frame rate.
    const steps = Math.min(3, Math.max(1, Math.round(dt / 16.67)));
    for (let i = 0; i < steps; i++) sim.tick();
    const k = this.morphProgress();
    if (k < 1) {
      // Morphing INTO constellations: physics proposes, the blend disposes,
      // so the field arrives from where it was rather than snapping.
      for (const n of this.order) {
        if (n.pin) continue;
        const e = smoothstep(k);
        n.x = n.trX + (n.x - n.trX) * e;
        n.y = n.trY + (n.y - n.trY) * e;
      }
    }
    return sim.alpha() > sim.alphaMin() || k < 1;
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
    for (const n of this.order) {
      const held = this.out.get(n.id);
      if (held) {
        held.x = n.x + this.ox;
        held.y = n.y + this.oy;
      } else {
        this.out.set(n.id, { x: n.x + this.ox, y: n.y + this.oy });
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
      (n) => n.role === "hub" || n.role === "artifact" || (n.role === "aggregate" && n.parentId == null)
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
    this.territoryGeometry.clear();
  }
}
