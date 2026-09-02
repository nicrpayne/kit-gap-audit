// ONE HOP, FOUR KINDS OF HOP.
//
// Selection used to light "the edges this node actually has, membership
// excluded" and hand the renderer one undifferentiated set. Measured against
// real JSA that set is honest but useless: a Finding wakes its lane, its work
// item, its passages and — once external intelligence is in the graph — a
// fistful of `related_to` claims, all at the same brightness. The eye is
// given eleven things and no reason to look at any of them first.
//
// So a neighbourhood is now CLASSIFIED, and the class is the whole product:
//
//   SEMANTIC     what this thing means for the project. depends_on, blocks,
//                supports, concerns, implements, missing_from. The answer to
//                "what does this affect".
//   TEMPORAL     what happened to it. supersedes, resolves, reopens. The
//                answer to "is this still true".
//   PROVENANCE   where the knowledge came from. evidenced_by, extracted_from,
//                cites. The answer to "why does anyone believe this".
//   CONTEXTUAL   `related_to` and everything unrecognised. The producer's
//                bulk. Present, reachable, listed — and never allowed to set
//                the brightness of the field.
//
// MEMBERSHIP IS NOT A CLASS. `attests` and `belongs_to` are seat assignments;
// the layout already draws them as position. Lighting them would mean every
// selection wakes its whole sector, which is the density failure this module
// exists to end.
//
// ── AND THIS IS NOT A TRAVERSAL ───────────────────────────────────────
//
// One hop. Never two. There is no queue in this file and there must never be
// one: a BFS over `related_to` reaches most of the outer band in three hops,
// and a "neighbourhood" that contains half the graph is the hairball under a
// different name. Following a relation further is a CLICK, in the panel that
// names it — which is what Selection Transfer is for.

import type { AuditGraph } from "./graph";
import { SOURCE_KINDS } from "./sources";

export type FocusClass = "semantic" | "temporal" | "provenance" | "contextual";

/** What a node is to the current selection. `anchor` is the selection itself. */
export type FocusRank = "anchor" | FocusClass;

/**
 * Signal's own relations, sorted into the same four classes the producer's
 * relations already carry on `relClass`.
 *
 * Written out rather than derived so that adding a relation to `EdgeRel` and
 * forgetting it here is a visible omission — an unlisted relation falls to
 * `contextual`, which is the quiet tier, not a crash and not a promotion.
 */
export const TEMPORAL_EDGE_RELS: ReadonlySet<string> = new Set(["supersedes", "resolves"]);

export const PROVENANCE_EDGE_RELS: ReadonlySet<string> = new Set([
  "evidenced_by",
  "extracted_from",
  "cites",
]);

export const SEMANTIC_EDGE_RELS: ReadonlySet<string> = new Set([
  "supports",
  "concerns",
  "missing_from",
  "linked_to",
  "depends_on",
  "blocks",
  "implements",
  "allocated_to",
]);

/** Seat assignment, not relationship. Kept identical to the renderer's set. */
export const MEMBERSHIP_EDGE_RELS: ReadonlySet<string> = new Set(["attests", "belongs_to"]);

/**
 * Which class an edge belongs to, or `null` when it is membership.
 *
 * EXTERNAL RELATIONS ARE CLASSED BY THE PRODUCER, NOT BY US. Every
 * `intel_relation` carries the class the package declared, normalised once at
 * ingest in lib/audit/intelligence.ts. Re-deriving it from the relation name
 * here would be a second opinion about somebody else's vocabulary, and the
 * two would drift the first time the producer adds a verb.
 */
export function edgeFocusClass(attrs: { rel: string; relClass?: string | null }): FocusClass | null {
  if (MEMBERSHIP_EDGE_RELS.has(attrs.rel)) return null;
  if (attrs.rel === "intel_relation") {
    const c = attrs.relClass;
    return c === "temporal" || c === "semantic" || c === "provenance" ? c : "contextual";
  }
  if (TEMPORAL_EDGE_RELS.has(attrs.rel)) return "temporal";
  if (PROVENANCE_EDGE_RELS.has(attrs.rel)) return "provenance";
  if (SEMANTIC_EDGE_RELS.has(attrs.rel)) return "semantic";
  return "contextual";
}

/**
 * Emphasis order, and the only place it is written down.
 *
 * A node reached by two classes takes the louder one — a passage that both
 * grounds the selection and is named by it should read as the meaning, not as
 * the citation. Lower number is louder.
 */
const RANK_ORDER: Record<FocusRank, number> = {
  anchor: 0,
  semantic: 1,
  temporal: 2,
  provenance: 3,
  contextual: 4,
};

export function louderRank(a: FocusRank, b: FocusRank): FocusRank {
  return RANK_ORDER[a] <= RANK_ORDER[b] ? a : b;
}

export interface FocusModel {
  anchor: string;
  /** Every node in the one-hop neighbourhood, including the anchor. */
  nodes: Map<string, FocusRank>;
  edges: Map<string, FocusClass>;
  /**
   * What the camera is allowed to be asked to show.
   *
   * CONTEXTUAL NEIGHBOURS ARE DELIBERATELY ABSENT. A single `related_to` to
   * the far side of the outer band would otherwise force a zoom-out on every
   * selection, and the producer's corpus is overwhelmingly `related_to` — the
   * framing law would become "always fit everything", which is no law.
   */
  frame: string[];
  counts: Record<FocusClass, number>;
}

/**
 * The one-hop neighbourhood of `anchorId`, classified.
 *
 * Returns null when there is no anchor or the anchor is not in the graph —
 * callers treat that as "no focus", which is the resting field.
 */
export function semanticFocus(graph: AuditGraph, anchorId: string | null): FocusModel | null {
  if (!anchorId || !graph.hasNode(anchorId)) return null;

  const nodes = new Map<string, FocusRank>();
  nodes.set(anchorId, "anchor");
  const edges = new Map<string, FocusClass>();
  const counts: Record<FocusClass, number> = { semantic: 0, temporal: 0, provenance: 0, contextual: 0 };

  graph.forEachEdge(anchorId, (edge, attrs, source, target) => {
    const cls = edgeFocusClass(attrs as { rel: string; relClass?: string | null });
    if (!cls) return;
    edges.set(edge, cls);
    counts[cls] += 1;
    const other = source === anchorId ? target : source;
    if (other === anchorId) return; // a self-edge lights nothing new
    const prev = nodes.get(other);
    nodes.set(other, prev ? louderRank(prev, cls) : cls);
  });

  // Rubric wakes the section represented by a grabbed hub. Signal's lane
  // membership is intentionally not drawn as edges, but it is still the
  // semantic content of that hub and should participate in the optical/local
  // wake. Keep it out of `frame`: clicking a hub must not trigger a global
  // refit merely because the lane is large.
  const anchor = graph.getNodeAttributes(anchorId);
  if (anchor.kind === "lane" && typeof anchor.lane === "string") {
    graph.forEachNode((id, attrs) => {
      if (id !== anchorId && attrs.lane === anchor.lane && !nodes.has(id)) nodes.set(id, "semantic");
    });
  }

  const frame: string[] = [anchorId];
  for (const [id, rank] of nodes) {
    if (id === anchorId) continue;
    if (rank === "contextual") continue;
    frame.push(id);
  }

  return { anchor: anchorId, nodes, edges, frame, counts };
}

// ── WHETHER A TRACE EXISTS AT ALL ──────────────────────────────────────
//
// Law 10: Trace may not enter an active route state without a route. The
// tested defect is a button that turns on, dims the entire field, and lights
// exactly one node — the node you already had selected. That reads as the
// instrument being broken rather than as the object being ungrounded, and it
// is worse than the button being unavailable, because it costs a click and a
// full re-read of the screen to learn nothing.
//
// `evidenceSolo` already answers this exactly: a route exists when the
// guarded traversal reaches something other than where it started.

export function hasTraceRoute(
  solo: { nodes: ReadonlySet<string> } | null | undefined,
  anchorId: string | null
): boolean {
  if (!solo || !anchorId) return false;
  for (const n of solo.nodes) if (n !== anchorId) return true;
  return false;
}

/**
 * AND WHETHER THE ROUTE IS A ROUTE, RATHER THAN A FIRST STEP.
 *
 * "Reaches something" was too weak. A finding whose only outbound edge is
 * `concerns` to its own lane passes it, and Trace then dims the whole field
 * to light a finding and a cluster puck — which answers nothing about where
 * the knowledge came from, and reads as the instrument being broken.
 *
 * A provenance trace is complete when it lands on an ARTIFACT:
 *
 *   semantic object → evidence passage → source artifact
 *
 * Anything short of that is a chain that stops in mid-air, and the honest
 * response is to say so in words rather than to animate it.
 */
export function traceIsComplete(
  graph: AuditGraph,
  solo: { nodes: ReadonlySet<string> } | null | undefined,
  anchorId: string | null
): boolean {
  if (!solo || !anchorId) return false;
  let passage = false;
  let artifact = false;
  for (const n of solo.nodes) {
    if (n === anchorId || !graph.hasNode(n)) continue;
    const kind = graph.getNodeAttribute(n, "kind");
    if (kind === "passage") passage = true;
    else if (SOURCE_KINDS.includes(kind)) artifact = true;
  }
  // The anchor may itself BE a passage — tracing one back to its transcript
  // is a legitimate, complete, two-node route.
  if (!passage && graph.hasNode(anchorId) && graph.getNodeAttribute(anchorId, "kind") === "passage") {
    passage = true;
  }
  return passage && artifact;
}

// ── THE VERBS ──────────────────────────────────────────────────────────
//
// Law 3: when an edge wakes, the reader must be able to say WHY the two
// objects are joined. The relation name is already on the edge; what was
// missing is that it was never rendered. These are the human forms — the same
// words the inspector uses, so the label on the line and the row in the panel
// cannot disagree.
//
// The producer's own verb wins where it has one. `intel_relation` is a
// carrier, not a meaning: showing "intel relation" on a line whose real name
// is `supersedes` would be Signal hiding somebody else's vocabulary behind
// its own transport.

const REL_VERB: Record<string, string> = {
  supports: "supports",
  concerns: "concerns",
  evidenced_by: "evidenced by",
  extracted_from: "extracted from",
  linked_to: "tracked as",
  depends_on: "depends on",
  blocks: "blocks",
  resolves: "resolves",
  implements: "implements",
  missing_from: "missing from",
  supersedes: "supersedes",
  allocated_to: "allocated to",
  cites: "cites",
  // Producer verbs, in their own words.
  caused_by: "caused by",
  contradicts: "contradicts",
  refines: "refines",
  reopens: "reopens",
  derived_from: "derived from",
  sourced_from: "sourced from",
  related_to: "related to",
  resolved_by: "resolved by",
  superseded_by: "superseded by",
};

/** The readable verb for an edge, in the producer's words where it has any. */
export function edgeVerb(attrs: { rel: string; intelRel?: string | null }): string {
  const own = attrs.rel === "intel_relation" ? (attrs.intelRel ?? "").toString() : "";
  const key = own || attrs.rel;
  return REL_VERB[key] ?? key.replace(/_/g, " ");
}

/**
 * Whether the verb reads in the direction the edge is drawn.
 *
 * Every relation in this graph is stored source → target and every verb above
 * is written to be read that way ("A depends on B"), so direction is always
 * meaningful — but only worth DRAWING where the reverse would say something
 * different. `related_to` and `contradicts` are symmetric; an arrowhead on
 * them is a claim the data does not make.
 */
const SYMMETRIC_VERBS: ReadonlySet<string> = new Set(["related to", "contradicts", "linked to"]);

export function verbIsDirectional(verb: string): boolean {
  return !SYMMETRIC_VERBS.has(verb);
}
