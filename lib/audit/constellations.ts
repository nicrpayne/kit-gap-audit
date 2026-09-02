// CONSTELLATIONS - how a dense population is arranged so that it has a SHAPE.
//
// -- THE DEFECT THIS EXISTS TO END ------------------------------------
//
// The field could show that it was connected. It could not show what its
// dense regions were made of. Two populations dominate the real corpus and
// both resolved into rails:
//
//   HERMES    126 external objects fanned across one sector in three rows.
//             Five different KINDS of claim - 59 observations, 24
//             commitments, 20 unknowns, 17 risks, 6 climate notes - drawn as
//             one undifferentiated arc of marks.
//   EVIDENCE  45 source artifacts on one ring with 156 passages fanned in
//             slots outside them. Correct provenance, read as a rack.
//
// In both cases the arrangement carried NO information beyond membership,
// which position already said. Zoom enlarged the geometry and revealed
// nothing.
//
// -- WHAT REPLACES THEM -----------------------------------------------
//
// Deterministic local constellations. Two ideas, both pure functions:
//
//   THE PHYLLOTAXIS DISC. Members of one group are packed in a golden-angle
//   spiral - the arrangement a sunflower head uses. It is even at every
//   count, has no preferred axis, and is completely determined by (index,
//   count): the same corpus produces the same seats on every load, forever.
//   NO PHYSICS. Nothing relaxes, nothing settles, nothing depends on what
//   was rendered before.
//
//   THE WEDGE SHELF-PACKER. Those discs then have to live somewhere. Each
//   sector is a wedge; discs are shelved into it from the inside out, largest
//   first, wrapping along the arc. Deterministic, and it stays inside the
//   sector - which is the law that lets membership be position rather than
//   130 drawn lines.
//
// -- AND WHAT AN AGGREGATE IS -----------------------------------------
//
// A group is not a node. It has no row, no ref, no truth status, and Signal
// never stores one. It is a PROJECTION OF REAL MEMBERS: its count is their
// count, its label is their shared type or their shared source, and every
// mark inside it is a real node at a real seat. The shell the renderer draws
// around it is a way of saying "these N things" without drawing N labels -
// not a substitute for the things.

import type { AuditGraph, NodeKind } from "./graph";
import { SOURCE_KINDS } from "./sources";

const RAD = Math.PI / 180;

/** The golden angle. The only constant phyllotaxis needs. */
const GOLDEN = 137.5077640500378;

/**
 * The i-th of n seats in a unit disc, by golden-angle spiral.
 *
 * `sqrt` on the radius is what makes the packing EVEN rather than crowded at
 * the centre: equal area per ring. The half-step offset stops the first seat
 * landing exactly on the origin, where it would be hidden by the group's own
 * hub.
 */
export function vogel(i: number, n: number): { dx: number; dy: number } {
  const t = (i + 0.5) / Math.max(1, n);
  const r = Math.sqrt(t);
  const a = i * GOLDEN * RAD;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

/**
 * How wide a disc holding `count` marks needs to be.
 *
 * Area per mark is `spacing` squared, so the radius goes as sqrt(count). 0.62
 * is the constant that makes a Vogel spiral of that radius leave roughly
 * `spacing` between neighbours - derived by measurement, not by theory: at
 * 0.5 the marks touch and at 0.75 the disc reads as sparse.
 */
export function discRadius(count: number, spacing: number, min = 10): number {
  return Math.max(min, spacing * 0.62 * Math.sqrt(Math.max(1, count)));
}

export interface PackUnit {
  id: string;
  /** How much room this constellation needs, in world units. */
  radius: number;
}

export interface PackedUnit {
  id: string;
  /** Seat of the constellation's centre. */
  angle: number;
  radius: number;
  /** The disc radius actually granted, after any shrink to make it fit. */
  discR: number;
}

export interface Wedge {
  baseAngle: number;
  arcDeg: number;
  inner: number;
  outer: number;
}

/**
 * Shelve constellations into a sector, inside out, largest first.
 *
 * SHELVES RATHER THAN A GRID because the wedge's arc grows with radius: a
 * shelf 40 units further out holds meaningfully more, and a fixed grid throws
 * that away. Largest first because a big disc that arrives late has nowhere
 * to go but a shelf of its own, and the field ends up mostly gutter.
 *
 * IF IT DOES NOT FIT, EVERYTHING SHRINKS TOGETHER - never some things. A
 * population that outgrows its band should read as denser, not as a few
 * groups pushed out of the sector. The scale is solved by iteration rather
 * than algebra because shelf assignment changes when radii change; four
 * passes is comfortably enough at any real count, and the last one is
 * clamped so a pathological corpus produces a crowded sector rather than an
 * infinite loop.
 */
export function packWedge(units: PackUnit[], wedge: Wedge): PackedUnit[] {
  if (units.length === 0) return [];
  const ordered = [...units].sort((a, b) => b.radius - a.radius || a.id.localeCompare(b.id));
  const band = Math.max(1, wedge.outer - wedge.inner);

  let scale = 1;
  let shelves: { units: PackUnit[]; height: number }[] = [];
  for (let pass = 0; pass < 4; pass++) {
    shelves = [];
    let cursor = wedge.inner;
    let shelf: PackUnit[] = [];
    let shelfH = 0;
    let used = 0;
    const flush = () => {
      if (shelf.length === 0) return;
      shelves.push({ units: shelf, height: shelfH });
      cursor += shelfH;
      shelf = [];
      shelfH = 0;
      used = 0;
    };
    for (const u of ordered) {
      const r = u.radius * scale;
      const h = Math.max(shelfH, r * 2);
      // Arc available at the middle of the shelf this unit would join.
      const cap = wedge.arcDeg * RAD * (cursor + h / 2);
      if (shelf.length > 0 && used + r * 2 > cap) flush();
      shelf.push({ id: u.id, radius: r });
      shelfH = Math.max(shelfH, r * 2);
      used += r * 2;
    }
    flush();
    const needed = shelves.reduce((n, s) => n + s.height, 0);
    if (needed <= band || pass === 3) break;
    scale *= Math.sqrt(band / needed) * 0.98;
  }

  const out: PackedUnit[] = [];
  let cursor = wedge.inner;
  for (const s of shelves) {
    const rc = cursor + s.height / 2;
    const total = s.units.reduce((n, u) => n + u.radius * 2, 0);
    const arcLen = wedge.arcDeg * RAD * rc;
    // Centred in the wedge, with whatever slack the shelf has spread evenly
    // between its members - so a shelf of two does not hug one edge.
    const gap = s.units.length > 1 ? Math.max(0, (arcLen - total) / (s.units.length + 1)) : 0;
    let x = (arcLen - total - gap * (s.units.length + 1)) / 2 + gap;
    for (const u of s.units) {
      const centre = x + u.radius;
      out.push({
        id: u.id,
        angle: wedge.baseAngle - wedge.arcDeg / 2 + centre / Math.max(1, rc) / RAD,
        radius: rc,
        discR: u.radius,
      });
      x += u.radius * 2 + gap;
    }
    cursor += s.height;
  }
  return out;
}

// -- THE SEMANTIC GROUPS THEMSELVES -----------------------------------

export type AggregateKind = "type" | "source";

export interface Aggregate {
  id: string;
  kind: AggregateKind;
  cluster: string;
  /** What a person would call this group. */
  label: string;
  /** Canonical node ids, sorted. Every one of them is a real node. */
  members: string[];
  count: number;
  /**
   * The single producer type every member shares, or null when the group is
   * mixed. A homogeneous group may wear its type's colour; a mixed one may
   * not, because a single hue over mixed contents is a lie about what is
   * inside.
   */
  homogeneous: string | null;
  /**
   * The artifact this group hangs off, for a source constellation. The hub is
   * a real node with a real seat and is NOT counted among the members.
   */
  hub: string | null;
}

/**
 * Below this a group is not worth naming: three marks are three marks, and a
 * shell around them adds a word where the reader can already see the things.
 */
export const AGGREGATE_MIN = 4;

const normalizeType = (t: unknown) =>
  String(t ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Producer type as a person would say it: `availability_observation` becomes
    `Availability observation`. Never re-worded, only re-cased. */
export function typeLabel(t: string): string {
  const s = normalizeType(t).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Every aggregate the graph supports, deterministically.
 *
 * TYPE GROUPS: external objects sharing a producer type inside one sector.
 * This is the answer to "Hermes is not a semantic type" - a Decision is a
 * Decision, and the ones the producer sent that Signal has no sector for
 * (risk, commitment, unknown, observation) get sub-regions inside the Hermes
 * sector rather than one undifferentiated rail.
 *
 * SOURCE GROUPS: an artifact and the passages extracted from it. This is the
 * shape the corpus actually has - 367 of 480 edges are provenance - so it is
 * the shape the field should take.
 */
export function constellations(graph: AuditGraph): Aggregate[] {
  const out: Aggregate[] = [];

  // -- type groups ---------------------------------------------------
  const byTypeInCluster = new Map<string, string[]>();
  graph.forEachNode((n, a) => {
    if (a.kind !== "intel") return;
    const cluster = String(a.lane ?? "hermes");
    const type = normalizeType(a.intelligenceType);
    const currentness = a.isCurrent === false ? "previous" : "current";
    const key = `${cluster}\u0000${type}\u0000${currentness}`;
    const list = byTypeInCluster.get(key);
    if (list) list.push(n);
    else byTypeInCluster.set(key, [n]);
  });
  for (const [key, members] of byTypeInCluster) {
    if (members.length < AGGREGATE_MIN) continue;
    const [cluster, type, currentness] = key.split("\u0000");
    out.push({
      id: `agg:type:${cluster}:${type}:${currentness}`,
      kind: "type",
      cluster,
      label: `${currentness === "previous" ? "Previous" : "Current"} ${typeLabel(type)}`,
      members: [...members].sort(),
      count: members.length,
      homogeneous: type,
      hub: null,
    });
  }

  // -- source groups -------------------------------------------------
  const passagesOf = new Map<string, string[]>();
  graph.forEachEdge((_e, a, s, t) => {
    if (a.rel !== "extracted_from") return;
    const list = passagesOf.get(t);
    if (list) list.push(s);
    else passagesOf.set(t, [s]);
  });
  for (const [hub, members] of passagesOf) {
    if (!graph.hasNode(hub)) continue;
    if (members.length < AGGREGATE_MIN) continue;
    const attrs = graph.getNodeAttributes(hub);
    if (!SOURCE_KINDS.includes(attrs.kind as NodeKind)) continue;
    out.push({
      id: `agg:src:${hub}`,
      kind: "source",
      cluster: String(attrs.lane ?? "evidence"),
      label: String(attrs.label ?? hub),
      members: [...members].sort(),
      count: members.length,
      homogeneous: null,
      hub,
    });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}
