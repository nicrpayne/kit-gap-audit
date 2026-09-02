// SEARCH IS A LENS, NOT A STRUCTURAL EDIT.
//
// ── THE VERIFIED PRODUCTION DEFECT ────────────────────────────────────
//
// The prior implementation opened a cluster whenever a match was inside it:
//
//     setExpanded((prev) => new Set([...prev, ...needed]))
//
// Correct in intent — a match nobody can see reads as broken — and wrong in
// mechanism. `expanded` is the field's PERSISTENT disclosure state, the thing
// the reader built up by choosing what to open, and that line writes to it
// with no route back. Escape clears the query; it does not close what the
// query opened. So every search left the field a little more open than it
// found it, and a UX run that searched a dozen times ended with 435 of 438
// nodes permanently expanded. At that point the graph is a hairball and the
// progressive-disclosure model that the whole layout depends on is gone.
//
// ── THE FIX: A SECOND, TEMPORARY CHANNEL ──────────────────────────────
//
//   `expanded`  what the READER opened. Persistent. Search never writes it.
//   `revealed`  what the QUERY needs visible. Derived from the current hits,
//               replaced wholesale on every query, and gone the moment the
//               query is empty.
//
// The renderer unions the two. Nothing has to be restored, because nothing
// was disturbed: clearing the search does not undo a mutation, it stops
// deriving a set. That is a stronger guarantee than a snapshot-and-restore,
// which can only be as correct as its most recently taken snapshot.
//
// The ONE case that legitimately persists is the reader choosing a result.
// Selecting is an act; it may open the minimum structure needed to hold that
// object in view, and `commitFor` is that minimum, computed with the same
// rule and applied to `expanded` deliberately. Typing is not an act.

import type { AuditGraph } from "./graph";

/**
 * What must be OPEN for `ids` to be visible on the field.
 *
 * The renderer's disclosure rule, read backwards. The exact hit is promoted,
 * plus the lane hub that locates it. A passage also promotes its own source
 * artifact so the quotation never appears without provenance. Crucially, the
 * lane KEY is not returned: lane keys mean "open every member" and Search is
 * never allowed to turn one match into a corpus-wide reveal.
 *
 * Pure. Same graph and same ids in, same set out, every time.
 */
export function revealFor(graph: AuditGraph, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    if (!graph.hasNode(id)) continue;
    const a = graph.getNodeAttributes(id);
    out.add(id);
    if (typeof a.lane === "string" && a.lane) {
      const laneId = `lane:${a.lane}`;
      if (graph.hasNode(laneId)) out.add(laneId);
    }
    if (a.kind === "passage") {
      graph.forEachOutboundEdge(id, (_edge, edge, _source, target) => {
        if (edge.rel === "extracted_from" && graph.hasNode(target)) out.add(target);
      });
    }
  }
  return out;
}

/**
 * What to OPEN PERMANENTLY when the reader takes a result.
 *
 * Same exact-promotion rule, one id — but this one is applied to `expanded`,
 * because selecting is a choice and the reader expects the object to remain
 * formed after the query clears.
 * Returning a set rather than mutating anything keeps the decision at the
 * call site, where the difference between "typing" and "choosing" lives.
 */
export function commitFor(graph: AuditGraph, id: string): Set<string> {
  return revealFor(graph, [id]);
}

/**
 * The two channels, unioned. The ONE answer to "why is this node showing its
 * name".
 *
 * Returns `expanded` ITSELF when there is nothing to reveal, which is not a
 * micro-optimisation: it makes "no search is running" referentially equal to
 * the reader's own state, so React skips the work and — more usefully — so
 * that a proof can assert set IDENTITY rather than only set equality.
 *
 * Shared by the instrument and by the proof deliberately. A proof that
 * simulates the component's arithmetic with its own copy of the arithmetic
 * proves nothing about the component.
 */
export function disclosedSet(
  expanded: ReadonlySet<string>,
  revealed: ReadonlySet<string>
): ReadonlySet<string> {
  if (revealed.size === 0) return expanded;
  return new Set<string>([...expanded, ...revealed]);
}
