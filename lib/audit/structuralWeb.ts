// THE CALM-STATE WEB — what the field says before anything is selected.
//
// ── THE MEASUREMENT THAT FORCED THIS ──────────────────────────────────
//
// A 20-minute production audit of the real JSA graph:
//
//   438 nodes · 543 relationships · 44 rendered at calm Fit.
//   91.9% of the graph's connectedness was invisible at rest.
//   Even Expand All drew 255 of 543.
//
// And a blind audit of 20 anonymous grey marks found 20/20 had a real
// identity, 18/20 had relationships, 16/20 had two or more. The field was
// telling a reader "here are some dots" about a body of knowledge that is
// densely and genuinely interconnected.
//
// The old policy was not wrong about hairballs. It was wrong about the
// alternative being nothing.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ──────────────────────────────────
//
// NOT 543 edges. Drawing them all is the hairball the whole layout exists to
// refuse, and it would be a worse lie than drawing none: 61 `related_to`
// links and 21 membership edges rendered at the same weight as a dependency
// would say the project is mostly noise.
//
// This is a BOUNDED STRUCTURAL WEB in two materials:
//
//   STRANDS   individual relationships with real authority. Every semantic
//             edge, every temporal edge, attested dependencies and
//             implementations, and the lane spine into Reality. 48 of them
//             on the real corpus. Each one is a fact worth a line.
//
//   SHEAVES   the provenance mesh, BUNDLED. 367 of the corpus's 480 edges
//             are provenance — 156 passages extracted from 45 source
//             artifacts, and 207 citations from 141 external objects into
//             those same passages. Drawn individually that is a grey fog
//             over three quarters of the field. Drawn as bundles it is the
//             true shape of the thing: a source artifact is a HUB, and what
//             hangs off it is what Signal read and who else quoted it.
//
// A sheaf is one `<path>` carrying many filaments that share a waist —
// hierarchical edge bundling, the standard answer to exactly this problem.
// Each filament still ends at its real endpoint; they simply travel
// together. 90 elements carry 363 relationships.
//
// ── AND IT MUST NEVER BE MISTAKEN FOR A FACT ──────────────────────────
//
// The web is drawn under everything, hairline, label-free, arrow-free, with
// no pointer events and its own subordinate tier. It answers "are these
// regions connected", which is a question about the shape of the corpus. It
// does not answer "what is this line", which is a question about one
// relationship — and that question is answered by selecting something.
//
// NOTHING HERE IS WOKEN THAT THE BRIEF EXCLUDES: no membership edges (they
// are position), no `related_to`, no checkpoint bookkeeping, no citation
// into superseded history.

import type { AuditGraph } from "./graph";
import { edgeFocusClass, type FocusClass } from "./focus";
import { FIELD, edgeControl, type GraphLayout } from "./graphLayout";

/** One relationship, drawn as itself because it carries authority. */
export interface WebStrand {
  id: string;
  d: string;
  cls: FocusClass;
  rel: string;
  basis: string;
  /** Both endpoints still live, for a temporal strand. History is drawn
      differently from the spine that is still standing. */
  current: boolean;
}

/** Many relationships, drawn as one bundled sheaf around a hub. */
export interface WebSheaf {
  id: string;
  d: string;
  /** How many real relationships this one path stands for. */
  count: number;
  kind: "extraction" | "citation";
}

export interface StructuralWeb {
  strands: WebStrand[];
  sheaves: WebSheaf[];
  /** Relationships the web accounts for, and the ones it deliberately does
      not. Reported by the proofs, and by the debug surface. */
  represented: number;
  suppressed: number;
  suppressedByClass: Record<string, number>;
}

/**
 * Which single relationships earn a line of their own at rest.
 *
 * SEMANTIC and TEMPORAL, always: 31 edges on the real corpus, and they are
 * the entire meaning of the project — what depends on what, what replaced
 * what. If any relationship deserves to be visible before you ask, it is
 * these.
 *
 * ATTESTED STRUCTURE: `depends_on`, `blocks`, `implements` and the lane
 * spine. Signal's own record of how the work hangs together, and all of it
 * attested rather than inferred.
 *
 * Everything else stays asleep: `related_to` (61) because it is the
 * producer's bulk and says nothing about this project in particular;
 * membership (21) because the layout already draws it as position;
 * provenance (367) because it belongs in the sheaves, where its density is
 * the information rather than the problem.
 */
const STRAND_RELS = new Set([
  "depends_on",
  "blocks",
  "implements",
  "supports",
  // SIGNAL'S OWN GROUNDING GETS A LINE, NOT A BUNDLE. `evidenced_by` is a
  // finding or a requirement pointing at the exact passage it rests on —
  // four of them on the real corpus, and each one is the answer to "why does
  // Signal believe this". Bundling four things is not bundling.
  "evidenced_by",
]);

function isStrand(attrs: { rel: string; basis: string; relClass?: string | null }): boolean {
  const cls = edgeFocusClass(attrs);
  if (cls === "semantic" || cls === "temporal") return true;
  return STRAND_RELS.has(attrs.rel) && attrs.basis !== "external";
}

/**
 * A bundled sheaf: many filaments from `leaves` to `hub`, sharing a waist.
 *
 * The waist sits between the hub and the leaves' own centre of mass, so the
 * filaments leave their endpoints separately, converge, and arrive together.
 * That convergence is what makes 26 passages read as ONE artifact's evidence
 * rather than as 26 unrelated strokes crossing the same space.
 *
 * `pull` moves the waist along that line. Nearer the hub bundles harder.
 */
function sheafPath(
  hub: { x: number; y: number },
  leaves: { x: number; y: number }[],
  pull: number
): string {
  if (leaves.length === 0) return "";
  let cx = 0;
  let cy = 0;
  for (const l of leaves) {
    cx += l.x;
    cy += l.y;
  }
  cx /= leaves.length;
  cy /= leaves.length;
  const wx = hub.x + (cx - hub.x) * pull;
  const wy = hub.y + (cy - hub.y) * pull;
  const parts: string[] = [];
  for (const l of leaves) {
    parts.push(
      `M ${l.x.toFixed(1)} ${l.y.toFixed(1)} Q ${wx.toFixed(1)} ${wy.toFixed(1)}, ${hub.x.toFixed(1)} ${hub.y.toFixed(1)}`
    );
  }
  return parts.join(" ");
}

/** The bowed chord the individual edges already use, so a strand and a
    focused edge between the same two seats trace the same route. */
function strandPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const c = edgeControl(a as never, b as never);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function structuralWeb(graph: AuditGraph, layout: GraphLayout): StructuralWeb {
  const strands: WebStrand[] = [];
  const sheaves: WebSheaf[] = [];
  const suppressedByClass: Record<string, number> = {};
  let represented = 0;
  let suppressed = 0;

  // Passages by the artifact they were extracted from, and the external
  // objects that cite each of those passages. One pass over the edges.
  const extraction = new Map<string, string[]>();
  const citation = new Map<string, { from: string; to: string }[]>();
  const sourceOfPassage = new Map<string, string>();

  graph.forEachEdge((_e, a, s, t) => {
    if (a.rel !== "extracted_from") return;
    if (!layout.has(s) || !layout.has(t)) return;
    sourceOfPassage.set(s, t);
    const list = extraction.get(t);
    if (list) list.push(s);
    else extraction.set(t, [s]);
  });

  graph.forEachEdge((_e, a, s, t) => {
    if (a.rel !== "cites") return;
    if (!layout.has(s) || !layout.has(t)) return;
    // A CITATION INTO HISTORY IS NOT PART OF THE LIVE WEB. The producer's
    // superseded objects keep their citations and their seats; drawing them
    // in the calm state would say the project currently rests on claims the
    // producer itself has withdrawn.
    if (graph.getNodeAttribute(s, "isCurrent") === false) {
      suppressed++;
      suppressedByClass.superseded = (suppressedByClass.superseded ?? 0) + 1;
      return;
    }
    // Grouped by the ARTIFACT behind the cited passage, which is what makes
    // the bundle mean something: "these external claims all come out of that
    // one meeting".
    const src = sourceOfPassage.get(t) ?? `orphan:${t}`;
    const list = citation.get(src);
    if (list) list.push({ from: s, to: t });
    else citation.set(src, [{ from: s, to: t }]);
  });

  for (const [source, passages] of extraction) {
    const hub = layout.get(source);
    if (!hub) continue;
    const leaves = passages.map((p) => layout.get(p)).filter(Boolean) as { x: number; y: number }[];
    if (leaves.length === 0) continue;
    sheaves.push({
      id: `web:extract:${source}`,
      // Bundled hard — 0.62 of the way to the leaves — because an artifact
      // and its passages are ONE thing, and the fan should read as a single
      // stem that opens rather than as a starburst.
      d: sheafPath(hub, leaves, 0.62),
      count: leaves.length,
      kind: "extraction",
    });
    represented += leaves.length;
  }

  for (const [source, cites] of citation) {
    const anchor = layout.get(source) ?? { x: FIELD.cx, y: FIELD.cy };
    const filaments: string[] = [];
    // The waist for a citation bundle sits on the artifact itself: every
    // claim that quotes this meeting travels through the meeting. That is
    // both the honest topology and the reason the outer band stops looking
    // like 155 unrelated chords.
    for (const c of cites) {
      const from = layout.get(c.from);
      const to = layout.get(c.to);
      if (!from || !to) continue;
      const wx = anchor.x + (from.x - anchor.x) * 0.34;
      const wy = anchor.y + (from.y - anchor.y) * 0.34;
      filaments.push(
        `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${wx.toFixed(1)} ${wy.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`
      );
    }
    if (filaments.length === 0) continue;
    sheaves.push({
      id: `web:cite:${source}`,
      d: filaments.join(" "),
      count: filaments.length,
      kind: "citation",
    });
    represented += filaments.length;
  }

  graph.forEachEdge((e, a, s, t) => {
    const cls = edgeFocusClass(a as { rel: string; relClass?: string | null });
    if (!cls) return; // membership is position
    // The bundled mesh, already accounted for above. Anything else in the
    // provenance class falls through to the strand test — which is how
    // `evidenced_by` gets its own line.
    if (a.rel === "extracted_from" || a.rel === "cites") return;
    const pa = layout.get(s);
    const pb = layout.get(t);
    if (!pa || !pb) return;
    if (!isStrand(a as { rel: string; basis: string; relClass?: string | null })) {
      suppressed++;
      suppressedByClass[cls] = (suppressedByClass[cls] ?? 0) + 1;
      return;
    }
    strands.push({
      id: e,
      d: strandPath(pa, pb),
      cls,
      rel: String(a.rel),
      basis: String(a.basis),
      current:
        graph.getNodeAttribute(s, "isCurrent") !== false && graph.getNodeAttribute(t, "isCurrent") !== false,
    });
    represented += 1;
  });

  return { strands, sheaves, represented, suppressed, suppressedByClass };
}
