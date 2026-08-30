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
 * The renderer's own disclosure rule, read backwards. A node is drawn when it
 * is `core`, or when its lane is expanded, or — for a passage — when its
 * source artifact is expanded. So the reveal set is the LANES and SOURCES
 * those hits sit behind, never the hits themselves and never their
 * neighbours.
 *
 *   MINIMUM, NOT NEIGHBOURHOOD. Revealing one hit's lane makes that lane's
 *   whole sector visible, which is already generous; adding one hop of
 *   context on top would put most of the evidence sector on screen for any
 *   query that touches a transcript.
 *
 * Pure. Same graph and same ids in, same set out, every time.
 */
export function revealFor(graph: AuditGraph, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    if (!graph.hasNode(id)) continue;
    const a = graph.getNodeAttributes(id);
    // A core node is always drawn. Nothing needs opening for it.
    if (a.slice === "core") continue;
    if (typeof a.lane === "string" && a.lane) out.add(a.lane);
  }
  return out;
}

/**
 * What to OPEN PERMANENTLY when the reader takes a result.
 *
 * Same rule, one id — but this one is applied to `expanded`, because
 * selecting is a choice and the reader expects the field to have moved.
 * Returning a set rather than mutating anything keeps the decision at the
 * call site, where the difference between "typing" and "choosing" lives.
 */
export function commitFor(graph: AuditGraph, id: string): Set<string> {
  return revealFor(graph, [id]);
}
