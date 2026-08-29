// WHERE SIGNAL GRAPH NODES SIT. PRESENTATION ONLY.
//
// Kept out of lib/audit/graph.ts for the reason the whole layer is split: an
// angle is a drawing decision, and a graph that knows about geometry is a
// graph a line-crossing can reach. Nothing here is stored, nothing is read
// back, and the semantic graph is complete without it.
//
// THE COMPOSITION, AND WHY IT IS THIS ONE
//
// Two independent axes, each carrying a different real fact:
//
//   ANGLE  = CATEGORY.  Each cluster owns a sector of the dial. Membership is
//            expressed by WHERE a node sits, never by a drawn line — which is
//            what stops 74 `attests` edges from becoming a hairball, and is
//            exactly how the reference communicates department membership.
//
//   RADIUS = DISAGREEMENT.  Reality is the centre. A finding sits at the band
//            its severity names: ALIGNED, DRIFT, CONFLICT.
//
// Combining them produces the one idea this layout has that a general graph
// tool does not: A FINDING IS DRAWN IN THE GAP BETWEEN REALITY AND ITS OWN
// CLUSTER. The Notion sector's findings sit between the Notion puck and the
// core, literally occupying the space between what that source claims and
// what Reality accepts. The further out, the wider the disagreement.
//
// So the field reads outward as: Reality · the disagreement bands · the
// cluster pucks · the project structure hanging off them.
//
// NO FORCE-DIRECTED LAYOUT. Every position below is a pure function of the
// node's semantic attributes and a stable ordering. Same graph in, same
// coordinates out — a node never changes seat because another appeared.

import type { AuditGraph, NodeKind } from "./graph";
import { SOURCE_KINDS } from "./sources";
import {
  constellations,
  discRadius,
  packWedge,
  vogel,
  type Aggregate,
  type PackedUnit,
} from "./constellations";

export const FIELD = {
  size: 1400,
  cx: 700,
  cy: 700,
  /** Reality's body. */
  coreR: 54,
  /** Where the project's own model sits — requirements, and the Scope chip's
      own ring. Inside the first disagreement band, because nothing here is a
      position on the disagreement axis. */
  modelR: 122,
  /** The three disagreement bands. */
  alignedR: 178,
  driftR: 262,
  conflictR: 346,
  /** Where a cluster's puck sits — just outside the field of disagreement,
      so the bands stay readable as bands rather than as cluster rings. */
  clusterR: 424,
  // Structure hanging off a cluster, kept CLOSE to its puck. With membership
  // edges deliberately undrawn, proximity is the only thing saying "these
  // belong to that" — at 508/590 the feature chips read as loose marks
  // floating past the Linear label rather than as its contents. The reference
  // groups by tight arcs for exactly this reason.
  //
  // Tightened again once every node was drawn rather than only the opened
  // ones. The outer stack used to run 474 / 548 / 592-600 / 640, which put a
  // cluster's checkpoints 216 units beyond its own name — far enough that
  // they read as specks near the edge of the field rather than as that
  // cluster's contents. The whole substrate now lives within 170 units of the
  // puck it belongs to. Disagreement radius is untouched: every one of these
  // rings is outside the bands, so what the geometry MEANS has not moved.
  featureR: 470,
  childR: 512,
  /** THE EDGE OF SIGNAL'S OWN RECORD. Everything inside this ring is
      something Signal holds: its lanes, its findings, its work, the passages
      it read and the artifacts it read them from. */
  edgeR: 594,
  /**
   * EXTERNAL INTELLIGENCE, BEYOND THE RECORD'S EDGE — the first band on this
   * field that is not Signal's.
   *
   * Radius on this field already reads outward as distance from accepted
   * Reality: the core, the project's own model, the disagreement bands, the
   * sources. External structured intelligence extends that same gradient one
   * step further rather than adding a new meaning to it. A reader who has
   * learned "further out is further from what Reality has accepted" reads
   * this band correctly without being told.
   *
   * ANGLE STILL MEANS CATEGORY. A Hermes Decision sits on the Decisions
   * axis, outside the boundary — semantically where it belongs, epistemically
   * where it belongs, both at once.
   *
   * The band is BOUNDED, and that is a density decision. The corpus is
   * several times the size of Signal's own record for the same project; a
   * band that grew without limit would make the field say "this project is
   * mostly external intelligence", which is false about Signal's record. It
   * packs into at most three rows and reads as a dense rim, which is what a
   * large external corpus honestly looks like.
   */
  /**
   * WHERE SOURCE CONSTELLATIONS LIVE.
   *
   * The sources layer used to be one ring at `childR` with passages fanned 52
   * units outside it. A constellation needs AREA, not a ring, so the layer
   * became a band — the same layer of the world, given room to have a shape.
   * It sits outside the disagreement rings and inside the record's edge:
   * where knowledge came from is not a position on the disagreement axis, and
   * it is unambiguously Signal's own.
   */
  sourceInner: 440,
  sourceOuter: 584,
  intelR: 622,
  intelRowStep: 36,
  /** Closes the field when external intelligence is present. */
  outerR: 706,
} as const;

/** At most this many rows in the external band. See FIELD.intelR. */
export const INTEL_ROWS = 3;

/**
 * HOW FAR SIGNAL'S OWN RECORD REACHES — the radius the default zoom was
 * chosen against.
 *
 * `edgeR` is where the outermost ring's CENTRES sit; a checkpoint seated on
 * it has a body that extends past it. This is that ring plus a node, and it
 * is the number `fitCamera` compares an actual extent to, so a field that has
 * not grown fits at exactly the zoom it always has.
 */
export const RECORD_EXTENT = FIELD.edgeR + 8;

export const BANDS = [
  { id: "aligned", label: "Aligned", r: FIELD.alignedR },
  { id: "drift", label: "Drift", r: FIELD.driftR },
  { id: "conflict", label: "Conflict", r: FIELD.conflictR },
] as const;

/** Radius a finding of each tier sits at. Categorical by design: there is no
    continuous "distance from truth" metric in the model and inventing one
    would be fake precision. */
const TIER_RADIUS: Record<string, number> = {
  critical: FIELD.conflictR,
  high: (FIELD.conflictR + FIELD.driftR) / 2,
  medium: FIELD.driftR,
  low: (FIELD.driftR + FIELD.alignedR) / 2,
};

/** A handled finding has stopped being a live disagreement, so it collapses
    to the aligned band whatever its severity once was. */
const HANDLED_RADIUS = FIELD.alignedR - 22;

/** Drawn size per kind. Size means importance in the reading order, not a
    measured quantity. */
export const NODE_SIZE: Record<NodeKind, number> = {
  reality: FIELD.coreR,
  scope: 15,
  // Between the Scope chip and a finding: a requirement is structural, and
  // structure should not shout louder than a disagreement.
  requirement: 11,
  // EQUAL-SIZED ON PURPOSE. Size could encode allocation fraction, and the
  // first version tried it: a 0.4 and a 1.0 person differ by a factor the eye
  // reads as importance rather than as commitment, and the sector stopped
  // looking like a team. Allocation is a number, so it is shown as one — in
  // the inspector, where it can carry its units. Size stays what it is
  // everywhere else on this field: position in the reading order.
  person: 10,
  lane: 13,
  dependency: 12,
  decision: 10,
  decisionGate: 7,
  finding: 9,
  feature: 8,
  intelligence: 8,
  // Smaller than a source and larger than a passage: an external object is a
  // statement, not an artifact, and there are hundreds of them. Size is
  // position in the reading order, and external intelligence does not
  // outrank the project's own record.
  intel: 4.6,
  // Source artifacts share one size whatever their kind: a transcript is not
  // more important than a Notion page, it is a different KIND of thing, and
  // shape is the channel that says so.
  source: 5,
  transcript: 5,
  notion_page: 5,
  figma_artifact: 5,
  work: 4.2,
  passage: 4.2,
  checkpoint: 3.2,
};

/** Sector order around the dial, clockwise from due north. Fixed rather than
    derived, so a lane keeps its seat between renders and between Scopes —
    "Decisions is at the top" has to stay learnable. */
export const CLUSTER_ORDER = [
  "decisions",
  "dependencies",
  "capacity",
  "linear",
  "notion",
  "figma",
  "hermes",
  "evidence",
] as const;

const RAD = Math.PI / 180;
const SECTOR = 360 / CLUSTER_ORDER.length;

/**
 * How much room one mark gets inside its constellation, in world units.
 *
 * A passage's body is 4.2 across and an external object's 4.6, so these are
 * roughly two body-widths — dense enough that a group reads as one mass at a
 * distance, open enough that individual marks stay countable when you close
 * in. Denser than this and the disc becomes a blob you cannot resolve; looser
 * and the sector runs out of room and the packer shrinks everything anyway.
 */
const SOURCE_SPACING = 10;
const INTEL_SPACING = 10;

/**
 * THE GUTTER BETWEEN CONSTELLATIONS, and the floor on how small one gets.
 *
 * `GUTTER` pads every disc before packing, so neighbouring constellations
 * never touch and each reads as its own object. `DISC_MIN` stops a source
 * with one passage from collapsing to a point.
 *
 * The provenance law — a passage nearer its own hub than any other — is NOT
 * enforced by these. It is enforced per hub, from the distance to its actual
 * nearest neighbour, where the seating happens. A constant here could only be
 * tuned for the worst pair in the corpus, which packed every isolated
 * constellation as tightly as the most crowded one; measured, that cost the
 * densest transcript's 26 passages two units of separation each.
 */
const GUTTER = 1.1;
const DISC_MIN = 9;
/** Usable arc inside a sector, leaving a gutter so neighbouring clusters do
    not visually merge. */
const SECTOR_ARC = SECTOR - 9;

/**
 * The arc a CONSTELLATION field may use, wider than a ring's.
 *
 * A ring is narrowed so a cluster holds its own tightly and its labels do not
 * collide with the next sector's. A constellation field has no labels of its
 * own at the level it is drawn and its members are packed rather than fanned,
 * so it can safely take almost the whole sector — and it needs to: the
 * Evidence sector alone holds 45 artifacts and 156 passages, half the corpus.
 *
 * Still comfortably inside the half-sector the layout proof enforces, because
 * `packWedge` keeps each disc's full extent within the arc it is given.
 */
const WEDGE_ARC = SECTOR - 5;

export interface Placement {
  x: number;
  y: number;
  /** Drawn radius of the node itself. */
  r: number;
  angle: number;
  radius: number;
  cluster: string | null;
}

export type GraphLayout = Map<string, Placement>;

function sectorAngle(cluster: string): number {
  const i = CLUSTER_ORDER.indexOf(cluster as (typeof CLUSTER_ORDER)[number]);
  // An unknown cluster parks due north rather than throwing — a new lane
  // should degrade to "somewhere sensible", not to a crash.
  return -90 + (i < 0 ? 0 : i) * SECTOR;
}

function polar(angleDeg: number, radius: number) {
  return {
    x: FIELD.cx + Math.cos(angleDeg * RAD) * radius,
    y: FIELD.cy + Math.sin(angleDeg * RAD) * radius,
  };
}

/**
 * Seat `count` items across a sector, centred on its axis.
 *
 * A single item sits ON the axis rather than at one end, so one finding does
 * not read as "the first of several".
 */
function fanAngle(baseAngle: number, index: number, count: number, arc = SECTOR_ARC): number {
  if (count <= 1) return baseAngle;
  const t = index / (count - 1);
  return baseAngle - arc / 2 + arc * t;
}

/**
 * Deterministic radial-cluster layout.
 *
 * Pure: takes the graph, returns coordinates, touches nothing. The graph is
 * never mutated — positions live in the returned map, not on the nodes, so
 * the semantic layer stays free of geometry.
 */
export function layoutGraph(graph: AuditGraph): GraphLayout {
  const out: GraphLayout = new Map();
  const place = (id: string, angle: number, radius: number, cluster: string | null) => {
    const p = polar(angle, radius);
    out.set(id, {
      x: p.x,
      y: p.y,
      r: NODE_SIZE[graph.getNodeAttribute(id, "kind")] ?? 5,
      angle,
      radius,
      cluster,
    });
  };

  /**
   * Seat a node at a CARTESIAN point, deriving its polar coordinates.
   *
   * Everything on this field used to be placed by (angle, radius) because
   * everything sat on a ring. A constellation is a disc, and a member of one
   * is at an offset from the disc's centre — so the cartesian point is the
   * primary fact and the polar pair is computed from it. `angle` and `radius`
   * stay correct and still mean what they always meant, which is what lets
   * the sector proof and the disagreement proof go on working unchanged.
   */
  const placeXY = (id: string, x: number, y: number, cluster: string | null) => {
    const dx = x - FIELD.cx;
    const dy = y - FIELD.cy;
    out.set(id, {
      x,
      y,
      r: NODE_SIZE[graph.getNodeAttribute(id, "kind")] ?? 5,
      angle: (Math.atan2(dy, dx) / RAD + 540) % 360 - 180,
      radius: Math.hypot(dx, dy),
      cluster,
    });
  };

  // The groups this corpus supports, and a member-to-group index so the
  // seating passes below can ask "which constellation is this in" in O(1).
  const aggregates = constellations(graph);
  const aggregateOfMember = new Map<string, Aggregate>();
  for (const agg of aggregates) for (const m of agg.members) aggregateOfMember.set(m, agg);
  const constellationSeats = new Map<string, PackedUnit & { cluster: string }>();

  // Stable ordering everywhere below: node ids are sorted before seating, so
  // insertion order in the graph cannot move anything on screen.
  const byKind = (kind: NodeKind) =>
    graph.filterNodes((_n, a) => a.kind === kind).sort();

  // ── THE CENTRE, AND THE PROJECT'S OWN MODEL ──────────────────────────
  for (const id of byKind("reality")) place(id, 0, 0, null);
  // The Scope sits inside the aligned band rather than against the core: at
  // coreR + 30 its chip overlapped Reality's own rings and read as a stray
  // mark on the hero. Here its depends_on edges visibly leave the project.
  for (const id of byKind("scope")) place(id, -90, FIELD.alignedR - 34, null);

  // REQUIREMENTS ARE NOT IN A SECTOR, AND THAT IS THE POINT.
  //
  // A sector means "this came from that source system". A requirement did
  // come from somewhere — its provenance edges run outward to the passage and
  // the source, which DO sit in Notion's sector — but the requirement itself
  // is what the project says must be true, and seating it inside Notion would
  // make it look like Notion's property. Adding a ninth sector was the other
  // option and is worse: every existing cluster would rotate, and "Decisions
  // is at the top" has to stay learnable.
  //
  // So they take the structural layer the Scope chip already occupies — the
  // band between the core and the first disagreement ring, which holds
  // nothing else. Read outward, the field now says: Reality · what the
  // project says must be true · where it disagrees · the sources.
  //
  // This is INSIDE alignedR, so it is not a position on the disagreement
  // axis. A requirement is not "aligned"; it simply is not on that axis at
  // all — the same reason Reality itself has no band.
  //
  // THE RING GROWS WITH ITS POPULATION, IN THAT ORDER: arc first, then a
  // second row. A previous pass fanned every requirement across a fixed 150
  // degrees and noted in passing that it was "comfortable to about a dozen";
  // measured at 47, that ring is a solid fence of overlapping tablets sitting
  // on Reality's doorstep — 47 statements rendered as one green wall. Widening
  // the arc before adding a row keeps the ring reading as a ring, and both
  // rows stay inside `alignedR`, so nothing here becomes a position on the
  // disagreement axis.
  //
  // Small counts are untouched: two requirements still fan across 52 degrees
  // on the Scope's own axis, exactly as before.
  {
    const reqs = byKind("requirement");
    const n = Math.max(1, reqs.length);
    // Body plus a gap, in world units. What "fits" means on this ring.
    const pitch = NODE_SIZE.requirement * 2.2;
    // How many fit on one row at a given arc and radius.
    const capacity = (arcDeg: number, radius: number) => Math.max(1, Math.floor((arcDeg * RAD * radius) / pitch));
    // Grow the arc only as far as the count needs, and never past 300 — the
    // remaining gap is where the Scope chip's own edges leave the project.
    let arc = Math.min(150, 26 * n);
    if (n > capacity(arc, FIELD.modelR)) arc = Math.min(300, (n * pitch) / (FIELD.modelR * RAD));
    const rows = Math.min(2, Math.ceil(n / capacity(arc, FIELD.modelR)));
    const perRow = Math.ceil(n / rows);
    reqs.forEach((id, i) => {
      const row = Math.floor(i / perRow);
      const inRow = i % perRow;
      const rowCount = Math.min(perRow, reqs.length - row * perRow);
      place(id, fanAngle(-90, inRow, rowCount, arc), FIELD.modelR + row * 28, null);
    });
  }

  // ── CLUSTER PUCKS ────────────────────────────────────────────────────
  for (const id of byKind("lane")) {
    const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? id.replace("lane:", "");
    place(id, sectorAngle(cluster), FIELD.clusterR, cluster);
  }

  // ── FINDINGS: cluster angle, disagreement radius ─────────────────────
  //
  // Grouped by (cluster, band) so several findings sharing both fan across
  // the sector instead of stacking on one point.
  {
    const groups = new Map<string, string[]>();
    for (const id of byKind("finding")) {
      const a = graph.getNodeAttributes(id);
      const cluster = (a.lane as string) ?? "evidence";
      const radius = a.handled ? HANDLED_RADIUS : (TIER_RADIUS[a.tier as string] ?? FIELD.driftR);
      const key = `${cluster}|${radius}`;
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    for (const [key, ids] of groups) {
      const [cluster, radiusStr] = key.split("|");
      const base = sectorAngle(cluster);
      const radius = Number(radiusStr);
      // A tighter arc than the sector's full width: findings belong to the
      // cluster's axis, and fanning them the full width would make them read
      // as belonging to the neighbouring sector.
      ids.forEach((id, i) => place(id, fanAngle(base, i, ids.length, SECTOR_ARC * 0.62), radius, cluster));
    }
  }

  // ── MODEL ENTITIES, on their cluster's puck ring ─────────────────────
  const onClusterRing = (kind: NodeKind, radius: number, arcScale = 1) => {
    const groups = new Map<string, string[]>();
    for (const id of byKind(kind)) {
      const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "evidence";
      groups.set(cluster, [...(groups.get(cluster) ?? []), id]);
    }
    for (const [cluster, ids] of groups) {
      const base = sectorAngle(cluster);
      ids.forEach((id, i) => place(id, fanAngle(base, i, ids.length, SECTOR_ARC * arcScale), radius, cluster));
    }
  };

  // ARC WIDTHS ARE A DENSITY DECISION, NOT A SPACING ONE.
  //
  // These were roughly twice as wide, and with every node now drawn at every
  // zoom the cost showed: three checkpoints fanned across 27 degrees at the
  // outermost radius sit 150 units apart and read as three unrelated specks
  // near the edge of the field, not as "this cluster has substance". Narrow
  // arcs turn the same three rows into a legible constellation sitting where
  // its cluster label is — which is the same argument that pulled the feature
  // ring in from 508 to 474, applied to everything outboard of it.
  //
  // Nothing here changes WHICH nodes exist or WHERE their cluster is. Only
  // how tightly a cluster holds its own.
  // People sit on the feature ring inside their own sector — close enough to
  // the Capacity puck to read as its contents, in a tight arc so four of them
  // read as a group rather than as four unrelated marks.
  onClusterRing("person", FIELD.featureR, 0.5);
  onClusterRing("dependency", FIELD.featureR, 0.42);
  onClusterRing("decision", FIELD.featureR, 0.42);
  onClusterRing("decisionGate", FIELD.childR, 0.36);
  onClusterRing("intelligence", FIELD.featureR, 0.42);

  // ── FEATURES, and the work that implements them ──────────────────────
  //
  // The reason this layer exists: without it, dozens of tickets seat directly
  // on one puck. A Feature gives each ticket a local anchor, so execution
  // reads as groups of work rather than as a cloud.
  {
    const features = byKind("feature");
    const cluster = "linear";
    const base = sectorAngle(cluster);
    features.forEach((fid, i) => {
      const fAngle = fanAngle(base, i, features.length, SECTOR_ARC * 0.5);
      place(fid, fAngle, FIELD.featureR, cluster);

      // Its own work items fan around it, in a slice of the sector
      // proportional to how many features are sharing the arc.
      const kids = graph
        .inEdges(fid)
        .filter((e) => graph.getEdgeAttribute(e, "rel") === "implements")
        .map((e) => graph.source(e))
        .sort();
      const kidArc = Math.min(11, (SECTOR_ARC * 0.5) / Math.max(1, features.length) - 1);
      kids.forEach((kid, k) => place(kid, fanAngle(fAngle, k, kids.length, kidArc), FIELD.childR, cluster));
    });

    // Work with no feature above it still needs a seat — pushed one ring out
    // so it is visibly ungrouped rather than pretending to belong.
    const orphans = byKind("work").filter((id) => !out.has(id));
    orphans.forEach((id, i) =>
      place(id, fanAngle(base, i, orphans.length, SECTOR_ARC * 0.45), FIELD.childR + 44, cluster)
    );
  }

  // ── SOURCE CONSTELLATIONS — an artifact and what came out of it ──────
  //
  // 367 of the real corpus's 480 edges are provenance. That is the shape the
  // knowledge actually has, so it is the shape the field takes: a source
  // artifact is a HUB, and the passages extracted from it are its satellites,
  // packed in a phyllotaxis disc around it.
  //
  // WHAT THIS REPLACES was correct and unreadable. Sources sat on one ring
  // and each fanned its passages into an angular slot outside it: provenance
  // was answerable by position, but 45 artifacts and 156 passages resolved
  // into a rack of marks, and no amount of zoom made it anything else.
  //
  // The law it was protecting is kept and strengthened. It used to be
  // "a passage sits angularly nearer its own source than any other", which
  // was the right question while every source shared one radius. Now that a
  // sector is an AREA the honest form is euclidean: a passage is nearer its
  // own hub than any other hub, full stop. A proof asserts exactly that.
  {
    const childrenOf = new Map<string, string[]>();
    for (const id of byKind("passage")) {
      const src = graph
        .outEdges(id)
        .filter((e) => graph.getEdgeAttribute(e, "rel") === "extracted_from")
        .map((e) => graph.target(e))[0];
      const key = src ?? "__unsourced";
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), id]);
    }

    const byCluster = new Map<string, string[]>();
    for (const id of SOURCE_KINDS.flatMap((k) => byKind(k))) {
      const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "evidence";
      byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), id]);
    }

    // Packed per sector, then seated together — because the provenance law
    // is GLOBAL. A passage must be nearer its own hub than any other hub in
    // the field, including one in the next sector along, so the orbit each
    // hub may use cannot be decided until every hub has a seat.
    const seated: { unit: PackedUnit; cluster: string; x: number; y: number }[] = [];
    for (const [cluster, ids] of byCluster) {
      const units = ids.map((sid) => ({
        id: sid,
        radius: discRadius((childrenOf.get(sid) ?? []).length + 1, SOURCE_SPACING, DISC_MIN) * GUTTER,
      }));
      const packed = packWedge(units, {
        baseAngle: sectorAngle(cluster),
        arcDeg: WEDGE_ARC,
        inner: FIELD.sourceInner,
        outer: FIELD.sourceOuter,
      });
      for (const unit of packed) {
        const centre = polar(unit.angle, unit.radius);
        seated.push({ unit, cluster, x: centre.x, y: centre.y });
      }
    }

    for (const { unit, cluster, x, y } of seated) {
      placeXY(unit.id, x, y, cluster);
      constellationSeats.set(`agg:src:${unit.id}`, { ...unit, cluster });
      const kids = (childrenOf.get(unit.id) ?? []).sort();
      if (kids.length === 0) continue;
      // HOW FAR A SATELLITE MAY ORBIT, DERIVED RATHER THAN ASSUMED.
      //
      // Half the distance to the nearest other hub, less a hair. Inside that
      // radius a satellite is provably nearer its own artifact than any
      // other, which is the law — "which meeting did this quote come from"
      // answerable by position, before a single line is drawn.
      //
      // A constant could only ever be tuned for the worst pair in the corpus,
      // which meant every isolated constellation was packed as tightly as the
      // most crowded one. This lets a hub with room use it.
      let nearest = Infinity;
      for (const other of seated) {
        if (other.unit.id === unit.id) continue;
        nearest = Math.min(nearest, Math.hypot(other.x - x, other.y - y));
      }
      const orbit = Math.min(
        // Its own disc, less the gutter it was padded with.
        (unit.discR / GUTTER) * 0.94,
        Number.isFinite(nearest) ? nearest * 0.47 : Infinity
      );
      kids.forEach((kid, k) => {
        const v = vogel(k, kids.length);
        placeXY(kid, x + v.dx * orbit, y + v.dy * orbit, cluster);
      });
    }

    // A passage whose source is not in this graph still gets a seat, on its
    // own cluster's axis — absent provenance is a fact about the data, not a
    // reason to drop the passage.
    const strays = byKind("passage").filter((id) => !out.has(id));
    const strayByCluster = new Map<string, string[]>();
    for (const id of strays) {
      const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "evidence";
      strayByCluster.set(cluster, [...(strayByCluster.get(cluster) ?? []), id]);
    }
    for (const [cluster, ids] of strayByCluster) {
      const base = sectorAngle(cluster);
      ids.forEach((id, i) =>
        place(id, fanAngle(base, i, ids.length, SECTOR_ARC * 0.42), FIELD.sourceOuter + 10, cluster)
      );
    }
  }

  // ── CHECKPOINTS, the outermost detail ────────────────────────────────
  // The largest single kind, and the one that most needed tightening: at the
  // widest radius a wide fan scatters them further than any other ring.
  onClusterRing("checkpoint", FIELD.edgeR, 0.28);

  // ── EXTERNAL INTELLIGENCE, AS TYPE CONSTELLATIONS ────────────────
  //
  // Seated by SECTOR (what the object means), by CONSTELLATION (which kind of
  // claim it is), and outside `edgeR` (whose intelligence it is). Three facts,
  // three channels, no channel doing two jobs.
  //
  // THIS USED TO BE THREE ROWS ACROSS THE SECTOR, and that was the defect the
  // constellations exist to end: 126 objects of five different kinds fanned
  // into one arc, so the arrangement said nothing that position had not
  // already said, and zoom enlarged the geometry without revealing anything.
  //
  //   HERMES IS A PRODUCER, NOT A MEANING.
  //
  // A Decision is a Decision and already sits on the Decisions axis; the four
  // kinds Signal has no sector for - risk, commitment, unknown, observation -
  // now get their own sub-regions inside the Hermes sector instead of being
  // one undifferentiated rail. Each is a phyllotaxis disc: even at any count,
  // no preferred axis, and a function of (index, count) alone.
  //
  // CURRENT MATERIAL SITS NEARER THE CENTRE OF ITS OWN DISC. Superseded and
  // resolved objects are the producer's history, and the same gradient the
  // rest of the field runs on puts history further out. Nothing is dropped: a
  // historical object keeps a real seat because the temporal chain that
  // reaches it has to land somewhere.
  {
    const byCluster = new Map<string, string[]>();
    for (const id of byKind("intel")) {
      const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "hermes";
      byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), id]);
    }
    // Head first, then by key - deterministic, and the ordering IS the
    // radial meaning inside each disc.
    const rank = (id: string) => (graph.getNodeAttribute(id, "isCurrent") === false ? 1 : 0);
    const order = (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b);

    for (const [cluster, all] of byCluster) {
      const groups = new Map<string, string[]>();
      for (const id of all) {
        const agg = aggregateOfMember.get(id);
        // A type with fewer than four members is not a constellation; those
        // objects share one group per sector, so a lone Availability
        // observation is still seated with its neighbours rather than given a
        // disc of its own.
        const key = agg ? agg.id : `loose:${cluster}`;
        groups.set(key, [...(groups.get(key) ?? []), id]);
      }
      const units = [...groups].map(([key, ids]) => ({
        id: key,
        radius: discRadius(ids.length, INTEL_SPACING, DISC_MIN),
      }));
      const packed = packWedge(units, {
        baseAngle: sectorAngle(cluster),
        arcDeg: WEDGE_ARC,
        inner: FIELD.edgeR + 10,
        outer: FIELD.outerR - 6,
      });
      for (const unit of packed) {
        const ids = (groups.get(unit.id) ?? []).sort(order);
        const centre = polar(unit.angle, unit.radius);
        constellationSeats.set(unit.id, { ...unit, cluster });
        ids.forEach((id, i) => {
          const v = vogel(i, ids.length);
          placeXY(id, centre.x + v.dx * unit.discR, centre.y + v.dy * unit.discR, cluster);
        });
      }
    }
  }

  // Anything the passes above missed still gets a seat rather than vanishing.
  for (const id of graph.nodes()) {
    if (out.has(id)) continue;
    const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "evidence";
    place(id, sectorAngle(cluster), FIELD.edgeR, cluster);
  }

  // THE GROUPS' OWN SEATS, carried on the same map the nodes use.
  //
  // A constellation is not a node and never becomes one — it has no row, no
  // ref and no truth status — but the renderer has to know where to draw its
  // shell and its count, and the camera has to be able to frame it. Keyed by
  // the aggregate's id, which no node can collide with.
  LAYOUT_AGGREGATES.set(out, { aggregates, seats: constellationSeats });

  return out;
}

/**
 * The constellations behind a layout.
 *
 * A WeakMap rather than a second return value: `layoutGraph` returns a
 * `Map<string, Placement>` in a dozen call sites and proofs, and widening its
 * signature to carry a second thing would touch all of them for a fact only
 * the renderer and the camera need. The layout owns its groups; ask it.
 */
const LAYOUT_AGGREGATES = new WeakMap<
  GraphLayout,
  { aggregates: Aggregate[]; seats: Map<string, PackedUnit & { cluster: string }> }
>();

export interface SeatedAggregate extends Aggregate {
  x: number;
  y: number;
  /** Radius of the disc its members are packed into. */
  discR: number;
}

/** Every group in this layout, with the seat its members are packed around. */
export function layoutAggregates(layout: GraphLayout): SeatedAggregate[] {
  const held = LAYOUT_AGGREGATES.get(layout);
  if (!held) return [];
  const out: SeatedAggregate[] = [];
  for (const agg of held.aggregates) {
    const seat = held.seats.get(agg.id);
    if (!seat) continue;
    const x = FIELD.cx + Math.cos(seat.angle * RAD) * seat.radius;
    const y = FIELD.cy + Math.sin(seat.angle * RAD) * seat.radius;
    out.push({ ...agg, x, y, discR: seat.discR });
  }
  return out;
}

/**
 * An edge as a curve bowed toward the centre.
 *
 * Straight chords across a radial field read as a cat's cradle; arcs that
 * follow the field's own curvature read as routing. The bow is proportional
 * to the angular distance travelled, so a short local edge stays nearly
 * straight and a long one sweeps.
 */
export function edgeControl(a: Placement, b: Placement): { x: number; y: number } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = mx - FIELD.cx;
  const dy = my - FIELD.cy;
  const midR = Math.hypot(dx, dy) || 1;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  // Pull the control point inward by a fraction of the chord — the longer the
  // span, the deeper the bow.
  const pull = Math.min(0.34, chord / 1600) * midR;
  return { x: FIELD.cx + (dx / midR) * (midR - pull), y: FIELD.cy + (dy / midR) * (midR - pull) };
}

export function edgePath(a: Placement, b: Placement): string {
  const c = edgeControl(a, b);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/**
 * WHERE A VERB GOES, AND WHICH WAY IT POINTS.
 *
 * Law 3 asks for the relation to be readable on the line when the line wakes.
 * A quadratic's midpoint is not the average of its endpoints — putting the
 * word there floats it off the curve on any long span — so it is evaluated
 * properly at t=0.5, and the tangent comes from the same curve so the word
 * lies along the stroke rather than across it.
 *
 * `angle` is degrees, already flipped when it would otherwise be upside down:
 * a label the reader has to tilt their head for is not a label.
 */
export function edgeLabelAnchor(
  a: Placement,
  b: Placement
): { x: number; y: number; angle: number; tx: number; ty: number } {
  const c = edgeControl(a, b);
  const x = (a.x + 2 * c.x + b.x) / 4;
  const y = (a.y + 2 * c.y + b.y) / 4;
  // dP/dt at t = 0.5 for a quadratic is (b - a), which is also the chord —
  // the bow is symmetric, so at the midpoint the tangent is parallel to it.
  let tx = b.x - a.x;
  let ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  let angle = (Math.atan2(ty, tx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return { x, y, angle, tx, ty };
}

/** The unit tangent AT THE TARGET END — where an arrowhead has to sit. */
export function edgeEndTangent(a: Placement, b: Placement): { x: number; y: number } {
  const c = edgeControl(a, b);
  const x = b.x - c.x;
  const y = b.y - c.y;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

/**
 * HOW FAR THE FIELD ACTUALLY REACHES.
 *
 * `Fit` used to be a constant, which was correct only while the field's
 * extent was one. External intelligence seats outside `edgeR`, so a fixed
 * zoom would push the outermost band off screen at the one moment the user
 * asked to see everything — and "Fit" that does not fit is worse than no Fit.
 *
 * Derived from the seats themselves rather than from a flag, so it stays
 * right for whatever the next tranche adds. Compared against `RECORD_EXTENT`
 * rather than floored at it: a field that has not grown past Signal's own
 * record fits at exactly the zoom it always has.
 */
export function layoutExtent(layout: GraphLayout): number {
  let max = 0;
  for (const p of layout.values()) max = Math.max(max, p.radius + p.r);
  return max;
}

/** Where a cluster's name sits — outside its puck, on the sector axis. */
export function clusterLabelPoint(cluster: string) {
  const angle = sectorAngle(cluster);
  return { ...polar(angle, FIELD.clusterR + 30), angle };
}
