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
  /** Nothing is drawn past this. */
  edgeR: 594,
} as const;

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
  source: 5,
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
/** Usable arc inside a sector, leaving a gutter so neighbouring clusters do
    not visually merge. */
const SECTOR_ARC = SECTOR - 9;

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
  {
    const reqs = byKind("requirement");
    // Fanned across the top of the model ring, centred on the Scope's own
    // axis so the chip and its requirements read as one group. Comfortable to
    // about a dozen; past that this ring needs its own radius.
    const arc = Math.min(150, 26 * Math.max(1, reqs.length));
    reqs.forEach((id, i) => place(id, fanAngle(-90, i, reqs.length, arc), FIELD.modelR, null));
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

  // ── EVIDENCE CHAIN — a source expands into its OWN passages ──────────
  //
  // Sources are seated first and each is given a SLOT of its cluster's arc;
  // its passages then fan inside that slot and nowhere else. The previous
  // pass fanned every passage across a fixed 14 degrees regardless of how
  // many sources shared the sector, so with three sources 14.4 degrees apart
  // one source's evidence sat under its neighbour — the provenance chain read
  // backwards at exactly the zoom where you go looking for it.
  //
  // Because a passage now always lands nearer its own source than any other,
  // "which source is this quote from" is answerable by position before the
  // extracted_from edge is drawn at all. A proof asserts that.
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
    for (const id of byKind("source")) {
      const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "evidence";
      byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), id]);
    }

    for (const [cluster, ids] of byCluster) {
      const base = sectorAngle(cluster);
      // Wider than the other rings on purpose: a source carries a long,
      // human label ("Delivery sync · 21 Aug"), and three of them packed into
      // a narrow arc collide as text long before they collide as marks.
      const arc = SECTOR_ARC * 0.66;
      const slot = arc / Math.max(1, ids.length);
      ids.forEach((sid, i) => {
        const sAngle = fanAngle(base, i, ids.length, arc);
        place(sid, sAngle, FIELD.childR, cluster);
        const kids = (childrenOf.get(sid) ?? []).sort();
        // Never wider than the slot the source owns, so two sources in one
        // sector cannot interleave their evidence.
        const kidArc = Math.min(9, slot * 0.72);
        kids.forEach((kid, k) =>
          place(
            kid,
            // A LONE PASSAGE STEPS OFF ITS SOURCE'S RAY. Everywhere else a
            // single child sits on the axis, but source and passage are only
            // 52 units apart radially, so exactly collinear their two labels
            // land on one baseline and print over each other. The nudge is
            // what makes them read as a pair rather than as a smear.
            kids.length === 1 ? sAngle + 3.2 : fanAngle(sAngle, k, kids.length, kidArc),
            FIELD.childR + 52,
            cluster
          )
        );
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
        place(id, fanAngle(base, i, ids.length, SECTOR_ARC * 0.42), FIELD.childR + 52, cluster)
      );
    }
  }

  // ── CHECKPOINTS, the outermost detail ────────────────────────────────
  // The largest single kind, and the one that most needed tightening: at the
  // widest radius a wide fan scatters them further than any other ring.
  onClusterRing("checkpoint", FIELD.edgeR, 0.28);

  // Anything the passes above missed still gets a seat rather than vanishing.
  for (const id of graph.nodes()) {
    if (out.has(id)) continue;
    const cluster = (graph.getNodeAttribute(id, "lane") as string) ?? "evidence";
    place(id, sectorAngle(cluster), FIELD.edgeR, cluster);
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
export function edgePath(a: Placement, b: Placement): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = mx - FIELD.cx;
  const dy = my - FIELD.cy;
  const midR = Math.hypot(dx, dy) || 1;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  // Pull the control point inward by a fraction of the chord — the longer the
  // span, the deeper the bow.
  const pull = Math.min(0.34, chord / 1600) * midR;
  const cx = FIELD.cx + (dx / midR) * (midR - pull);
  const cy = FIELD.cy + (dy / midR) * (midR - pull);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** Where a cluster's name sits — outside its puck, on the sector axis. */
export function clusterLabelPoint(cluster: string) {
  const angle = sectorAngle(cluster);
  return { ...polar(angle, FIELD.clusterR + 30), angle };
}
