// WHERE THINGS SIT ON THE TRUTH MAP. PRESENTATION ONLY.
//
// Kept out of lib/audit/truth.ts for the reason lib/orbit/layout.ts is kept
// out of lib/orbit/graph.ts: an angle is a drawing decision, and persisting
// one would turn a picture into a fact. Nothing here is stored or read back,
// and the truth model is complete without it.
//
// THE ONE RULE: POSITION MUST MEAN SOMETHING, or the radial form is
// decoration.
//
//   RADIUS is disagreement with Reality. The core is accepted Reality; the
//   further out something sits, the further it is from agreeing with it.
//   Three named bands — ALIGNED, DRIFT, CONFLICT — because the model
//   supports categories honestly and does not support a continuous
//   "distance from truth" metric. Inventing one would be exactly the fake
//   precision docs/CONTROL-ROOM-TRUTH-AUDIT.md refuses.
//
//   ANGLE is seating, not rank. Each lane owns a port on the Reality bus.
//   Lane order (top to bottom in the gutter) maps monotonically onto a
//   counter-clockwise sweep of ports, so lanes nest instead of tangling and
//   a lane never changes seat because another appeared.
//
//   THE RIGHT-FACING ARC IS DELIBERATELY EMPTY. No lane docks there. It is
//   the reading side: the eye travels from the dense left gutter, through
//   the core, and out into clear space where the inspector begins.
//
// A CROSSING IS NOT A RELATIONSHIP. Lanes may pass over one another on their
// way to a port. Meaning is carried ONLY by a rendered junction node, never
// by incidental geometry.

import type { TruthLane, TruthMapModel, TruthState, FindingTier } from "./truth";

// The viewBox is shaped to the column it lives in (about 900x800 at the
// 1600x1000 target), so `meet` scaling leaves almost no letterbox and the
// field genuinely fills the space it is given. A squarer box was the first
// version's mistake: it fit the width and left dead bands top and bottom.
export const FIELD = {
  width: 1000,
  height: 880,
  /** Reality's centre. Right of the gutter, left of the reading side. */
  cx: 560,
  cy: 440,
  /** The Reality body itself. */
  coreR: 52,
  /** Where lanes dock. The instrument bus. */
  busR: 108,
  /** The three named bands. */
  alignedR: 196,
  driftR: 288,
  conflictR: 378,
  /** Nothing is drawn past this. */
  edgeR: 400,
  /** Lane labels live left of this and are never crossed by a track. */
  gutterX: 132,
  /** Tracks begin here — the protected gap after the label. */
  trackX: 162,
  /** Where the straight run ends and the lane turns for its port. */
  fanX: 262,
  laneTop: 62,
  laneBottom: 818,
} as const;

/** Radius a finding of each tier sits at. Categorical by design — see the
    header note on fake precision. */
export const TIER_RADIUS: Record<FindingTier, number> = {
  critical: FIELD.conflictR,
  high: (FIELD.conflictR + FIELD.driftR) / 2,
  medium: FIELD.driftR,
  low: (FIELD.driftR + FIELD.alignedR) / 2,
};

/** A handled finding has stopped being a live disagreement, so it collapses
    to the aligned band regardless of how severe it once was. Severity is a
    property of the gap; distance is a property of whether it is still open. */
export const HANDLED_RADIUS = FIELD.alignedR - 16;

/** The band a radius falls in, for the ring labels. */
export const BANDS = [
  { id: "aligned", label: "Aligned", r: FIELD.alignedR },
  { id: "drift", label: "Drift", r: FIELD.driftR },
  { id: "conflict", label: "Conflict", r: FIELD.conflictR },
] as const;

export interface Point {
  x: number;
  y: number;
}

export interface LanePlacement {
  laneId: string;
  /** Seat in the left gutter. */
  label: Point;
  /** Where the track starts, after the protected gutter. */
  start: Point;
  /** Port on the bus, and the angle that put it there. */
  port: Point;
  portAngle: number;
  /** The full path, as an SVG `d`. */
  d: string;
  /** The run that carries intact signal — from the gutter to the break (or
      all the way into the bus when the lane is intact). */
  dIntact: string;
  /** The continuation PAST the break, drawn as an unverified ghost. Empty
      when the lane reaches Reality intact. */
  dGhost: string;
  /** Densely sampled points along `d`, for anchoring by radius. */
  samples: Point[];
  /** Where this lane stops carrying intact signal. Everything past this is
      drawn as unverified continuation. Null when the lane is intact. */
  breakAt: Point | null;
  /** Junction seats, outermost first. */
  checkpoints: { id: string; at: Point }[];
}

const RAD = Math.PI / 180;

/** Ports sweep counter-clockwise from upper-right, over the top, down the
    left, to lower-right — leaving the right-facing arc clear. */
const PORT_FROM = -62;
const PORT_SPAN = 236;

function pointOnCircle(angleDeg: number, r: number): Point {
  return {
    x: FIELD.cx + Math.cos(angleDeg * RAD) * r,
    y: FIELD.cy + Math.sin(angleDeg * RAD) * r,
  };
}

function radiusOf(p: Point): number {
  return Math.hypot(p.x - FIELD.cx, p.y - FIELD.cy);
}

function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/** Where a lane's signal stops being intact. Verified lanes run all the way
    into the bus; anything else is interrupted at the band its state names,
    which is what makes "this signal does not reach Reality" readable at a
    glance rather than from a legend. */
function breakRadiusFor(state: TruthState): number | null {
  switch (state) {
    case "verified":
      return null;
    case "drift":
      return FIELD.driftR;
    case "missing":
      return FIELD.alignedR;
    case "conflict":
      return FIELD.conflictR;
  }
}

/** Index of the sample nearest a target radius. Returns -1 when nothing on
    the path comes close enough — better to place nothing than to place a
    junction at a radius that means something else. */
function indexAtRadius(samples: Point[], targetR: number, tolerance = 34): number {
  let best = -1;
  let bestErr = Infinity;
  samples.forEach((s, i) => {
    const err = Math.abs(radiusOf(s) - targetR);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  });
  return bestErr > tolerance ? -1 : best;
}

function sampleAtRadius(samples: Point[], targetR: number, tolerance = 34): Point | null {
  const i = indexAtRadius(samples, targetR, tolerance);
  return i < 0 ? null : samples[i];
}

/** A polyline `d` over a slice of samples. Used to draw the intact run and
    the ghost continuation as two separate strokes. */
function polyline(points: Point[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

export function layoutLanes(lanes: TruthLane[]): Map<string, LanePlacement> {
  const out = new Map<string, LanePlacement>();
  const n = lanes.length;
  if (n === 0) return out;

  const step = n === 1 ? 0 : (FIELD.laneBottom - FIELD.laneTop) / (n - 1);
  const angleStep = n === 1 ? 0 : PORT_SPAN / (n - 1);

  lanes.forEach((lane, i) => {
    const y = n === 1 ? (FIELD.laneTop + FIELD.laneBottom) / 2 : FIELD.laneTop + step * i;
    // Counter-clockwise sweep: negative direction in SVG's y-down convention.
    const portAngle = PORT_FROM - angleStep * i;
    const port = pointOnCircle(portAngle, FIELD.busR);
    const normal = { x: Math.cos(portAngle * RAD), y: Math.sin(portAngle * RAD) };

    const start: Point = { x: FIELD.trackX, y };
    const turn: Point = { x: FIELD.fanX, y };

    // How far the lane has to travel around the dial decides how much room
    // its curve is given. A lane docking on the near side gets a tight
    // curve; one crossing the top gets a wide, calm sweep instead of a kink.
    const travel = Math.abs(portAngle + 180) / 180; // 0 near due-west, 1 at the extremes
    const lead = 90 + travel * 210;
    const approach = 70 + travel * 165;

    const c1: Point = { x: turn.x + lead, y };
    const c2: Point = { x: port.x + normal.x * approach, y: port.y + normal.y * approach };

    const d = `M ${start.x} ${start.y} L ${turn.x} ${turn.y} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${port.x.toFixed(1)} ${port.y.toFixed(1)}`;

    // Sample the straight run and the curve together so radius lookups work
    // over the whole lane.
    const samples: Point[] = [start, turn];
    const STEPS = 160;
    for (let s = 1; s <= STEPS; s++) samples.push(cubicAt(turn, c1, c2, port, s / STEPS));

    // THE BREAK. A lane that disagrees with Reality stops carrying intact
    // signal at the band its state names; past that it is drawn as an
    // unverified ghost rather than as a line confidently reaching the core.
    const breakR = breakRadiusFor(lane.state);
    const breakIdx = breakR == null ? -1 : indexAtRadius(samples, breakR);
    const breakAt = breakIdx < 0 ? null : samples[breakIdx];
    const dIntact = breakIdx < 0 ? d : polyline(samples.slice(0, breakIdx + 1));
    const dGhost = breakIdx < 0 ? "" : polyline(samples.slice(breakIdx));

    // Checkpoints seat outermost-first along the lane's approach, spread
    // across the bands. Only junctions that land near a real band radius are
    // drawn — a dot that could not be placed truthfully is not placed.
    const cps = lane.checkpoints;
    const checkpoints: { id: string; at: Point }[] = [];
    const spread = [FIELD.conflictR, FIELD.driftR, FIELD.alignedR];
    cps.forEach((cp, idx) => {
      const targetR =
        cps.length === 1
          ? FIELD.driftR
          : spread[Math.min(idx, spread.length - 1)] ??
            FIELD.alignedR;
      const at = sampleAtRadius(samples, targetR);
      if (at) checkpoints.push({ id: cp.id, at });
    });

    out.set(lane.id, {
      laneId: lane.id,
      label: { x: FIELD.gutterX, y },
      start,
      port,
      portAngle,
      d,
      dIntact,
      dGhost,
      samples,
      breakAt,
      checkpoints,
    });
  });

  return out;
}

export interface FindingPlacement {
  findingId: string;
  /** Where on the lane the anomaly actually is. */
  anchor: Point;
  /** Where the callout card sits, or null when the perimeter ran out of
      seats. An unseated finding is NOT dropped — it keeps its anchor and
      stays selectable, because a finding the map silently omits is worse
      than one without a label. */
  card: Point | null;
  /** Which side the card's stem leaves from. */
  side: "left" | "right" | "top" | "bottom";
}

export const CARD = { w: 222, h: 58 } as const;

/**
 * Findings are seated in DELIBERATE PERIMETER SLOTS, not wherever their
 * anchor happens to fall — the mockup's floating cards are a picture, and a
 * card sitting in traffic is unreadable. Each finding anchors to the real
 * point on its lane where the disagreement is, then the card is placed in
 * the free perimeter slot nearest that anchor's direction, and a short stem
 * connects the two.
 *
 * Deterministic: seats are assigned in a stable order (tier, then id), so a
 * finding does not jump seats between renders.
 */
export function layoutFindings(
  model: TruthMapModel,
  lanePlacements: Map<string, LanePlacement>
): Map<string, FindingPlacement> {
  const out = new Map<string, FindingPlacement>();

  // Perimeter slots, walked clockwise from the top-left. The right-facing
  // arc carries fewer seats on purpose: it is the reading side.
  // Seat centres, walked clockwise from the top-left. Two hard constraints,
  // both learned from seeing the first version render:
  //
  //   NO CARD MAY LEAVE THE FIELD. A centre past `width - CARD.w/2` clips the
  //   card against the viewBox edge, which is how the right-hand column lost
  //   half of a finding's title.
  //
  //   NO TWO SEATS IN A ROW MAY BE CLOSER THAN CARD.w + a gutter. Four seats
  //   across the top at 198px apart overlapped a 214px card three times over.
  //
  // Three per row rather than four is what those two rules leave room for,
  // and the right-facing arc — where no lane docks — carries the rest.
  // A THIRD CONSTRAINT, also learned from a render: the leftmost seat must
  // clear the label gutter. At x=196 a 214px card reached back to x=89 and
  // sat on top of "DECISIONS" and "EVIDENCE", which is the exact collision
  // the protected gutter exists to prevent.
  const maxX = FIELD.width - CARD.w / 2 - 10;
  const minX = FIELD.trackX + CARD.w / 2 + 8;
  const slots: { p: Point; side: FindingPlacement["side"] }[] = [
    { p: { x: minX, y: 40 }, side: "top" },
    { p: { x: (minX + maxX) / 2, y: 32 }, side: "top" },
    { p: { x: 804, y: 40 }, side: "top" },
    { p: { x: maxX, y: 208 }, side: "right" },
    { p: { x: maxX, y: 300 }, side: "right" },
    { p: { x: maxX, y: 392 }, side: "right" },
    { p: { x: maxX, y: 484 }, side: "right" },
    { p: { x: maxX, y: 576 }, side: "right" },
    { p: { x: 804, y: 812 }, side: "bottom" },
    { p: { x: (minX + maxX) / 2, y: 826 }, side: "bottom" },
    { p: { x: minX, y: 812 }, side: "bottom" },
  ];
  const taken = new Set<number>();

  const ordered = [...model.findings].sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  // ANCHORS FIRST.
  //
  // Several findings can share a lane AND a tier — three unresolved
  // decisions on the Decisions lane is an ordinary Tuesday — and seating
  // them all at the identical radius stacked three anchors on one dot with
  // three stems fanning out of it. Each subsequent finding at the same
  // radius steps one notch further out, so they read as separate readings
  // on the same signal while staying inside their band.
  const anchors = new Map<string, Point>();
  const usedRadii = new Map<string, number>();
  for (const f of ordered) {
    const lane = lanePlacements.get(f.laneId);
    if (!lane) continue;
    const baseR = f.handled ? HANDLED_RADIUS : TIER_RADIUS[f.tier];
    const key = `${f.laneId}:${Math.round(baseR)}`;
    const n = usedRadii.get(key) ?? 0;
    usedRadii.set(key, n + 1);
    const targetR = baseR + n * 25;
    anchors.set(f.id, sampleAtRadius(lane.samples, targetR, 40) ?? lane.port);
  }

  // THEN SEATS, IN ANGULAR ORDER.
  //
  // Greedy nearest-free seating sent a finding whose neighbours had taken
  // the near slots all the way across the field, and the stem then crossed
  // the whole map to reach it. Walking both the findings and the seats in
  // angular order around Reality keeps every card on the same side as the
  // thing it labels.
  const angleOf = (p: Point) => Math.atan2(p.y - FIELD.cy, p.x - FIELD.cx);
  const seatAngles = slots.map((s) => angleOf(s.p));

  const byAngle = [...ordered]
    .filter((f) => anchors.has(f.id))
    .sort((a, b) => angleOf(anchors.get(a.id)!) - angleOf(anchors.get(b.id)!));

  for (const f of byAngle) {
    const anchor = anchors.get(f.id)!;
    const a = angleOf(anchor);
    let bestIdx = -1;
    let bestDiff = Infinity;
    seatAngles.forEach((sa, idx) => {
      if (taken.has(idx)) return;
      // Shortest way round the dial, so a seat just past due-west is not
      // treated as being most of a turn away from an anchor just before it.
      let diff = Math.abs(sa - a);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    if (bestIdx < 0) {
      // Out of seats: keep the anchor, lose only the label.
      out.set(f.id, { findingId: f.id, anchor, card: null, side: "right" });
      continue;
    }
    taken.add(bestIdx);
    out.set(f.id, { findingId: f.id, anchor, card: slots[bestIdx].p, side: slots[bestIdx].side });
  }

  return out;
}

const TIER_ORDER: Record<FindingTier, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Where a stem leaves a card — the edge midpoint facing the field, so a
    stem never crosses the card it belongs to. */
export function stemOrigin(card: Point, side: FindingPlacement["side"]): Point {
  switch (side) {
    case "top":
      return { x: card.x, y: card.y + CARD.h / 2 };
    case "bottom":
      return { x: card.x, y: card.y - CARD.h / 2 };
    case "right":
      return { x: card.x - CARD.w / 2, y: card.y };
    case "left":
      return { x: card.x + CARD.w / 2, y: card.y };
  }
}

/**
 * The stem itself, as a routed curve rather than a straight diagonal.
 *
 * The gutter occupies the west side of the field, so a finding anchored on a
 * west-facing lane genuinely cannot be seated beside itself — its card has to
 * sit on the top or bottom rail, and a straight line to it cuts a long
 * diagonal across the whole map. Leaving the card perpendicular first and
 * then curving in reads as routed cable instead: it states which card owns
 * the stem before it travels, and it stays clear of the field's middle.
 */
export function stemPath(card: Point, side: FindingPlacement["side"], anchor: Point): string {
  const from = stemOrigin(card, side);
  const lead = 34;
  const control: Point =
    side === "top"
      ? { x: from.x, y: from.y + lead }
      : side === "bottom"
        ? { x: from.x, y: from.y - lead }
        : side === "right"
          ? { x: from.x - lead, y: from.y }
          : { x: from.x + lead, y: from.y };
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)}, ${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}`;
}
