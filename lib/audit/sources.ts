// WHERE WE LEARNED IT — source artifacts as first-class things.
//
// A SOURCE ARTIFACT IS NOT A SEMANTIC ENTITY. The graph already holds that
// line for Requirements; this file extends it downward, so the chain a person
// actually wants to walk is four distinct nodes rather than two:
//
//   Requirement   "Offline capture must work before field pilot"
//         │ evidenced_by
//   Passage       notion-scope-row-14
//         │ extracted_from
//   Notion page   "JSA delivery scope"          ← now a KIND, not "a source"
//
// ── WHY SPECIFIC KINDS ────────────────────────────────────────────────
//
// "Source" is a role, not a thing. A meeting transcript, a requirements page
// and a design frame answer completely different questions — what was said,
// what was written down, what was drawn — and a field that draws all three as
// the same document icon makes the reader open each one to find out which it
// is. The kind is the answer to "where did we learn this" at a glance.
//
// ── AND WHY THE RULE IS STRUCTURAL ────────────────────────────────────
//
//   THE TYPE COMES FROM A PERSISTED TYPE FIELD. NEVER FROM A TITLE.
//
// A source called "Delivery sync · 21 Aug" is not a transcript because it
// sounds like a meeting. It is a transcript because its manifest entry says
// `sourceType: "transcript"`, or because a `Source` row says
// `kind: "transcript"` — a documented enum ("transcript" | "notes" |
// "estimates"). Where the data only supports "a source", it stays a source.

import type { NodeKind } from "./graph";

/** The kinds a source artifact can take. `source` is the honest fallback. */
export const SOURCE_KINDS: NodeKind[] = ["source", "transcript", "notion_page", "figma_artifact"];

/**
 * The most specific truthful kind for a persisted source type.
 *
 * Deliberately the same normalisation `laneForSourceType` uses, and kept
 * beside it, so a source cannot be seated in Notion's sector while claiming
 * to be a transcript.
 */
export function sourceKindFor(sourceType: string | null | undefined): NodeKind {
  const t = (sourceType ?? "").toLowerCase();
  if (t.includes("transcript")) return "transcript";
  if (t.includes("notion")) return "notion_page";
  if (t.includes("figma")) return "figma_artifact";
  return "source";
}

/**
 * A source artifact the Scope DECLARES as context but which supplied nothing
 * to the current package.
 *
 * `Scope.notionPageIds` and `Scope.figmaRefs` are canonical columns — the
 * Truth Map already reads them for its Notion and Figma checkpoints — naming
 * pages and frames Signal is configured to pull in. When one of them appears
 * nowhere in the accepted snapshot's evidence, that is a real and useful
 * fact: **Signal is set up to read this and the current package contains
 * nothing from it.** The same "an absent edge is information" law the
 * unsupplied lanes and the unlinked requirements already run on.
 *
 * Declared artifacts that DID supply evidence get no node here — the manifest
 * already produced one, and a second would be the same artifact drawn twice.
 */
export interface DeclaredArtifact {
  /** `source:declared:notion:<pageId>` / `source:declared:figma:<ref>` */
  key: string;
  kind: NodeKind;
  /** The canonical identifier, which is all the Scope column carries. */
  ref: string;
  lane: string;
  field: string;
}

export interface DeclaredArtifactInput {
  notionPageIds: string[];
  figmaRefs: string[];
  /** Every `externalRef` present in the accepted snapshots' evidence. */
  evidenceExternalRefs: string[];
}

/**
 * Declared source artifacts that no evidence came from.
 *
 * COVERAGE IS MATCHED ON THE IDENTIFIER, NOT THE TITLE. A Notion page id
 * appears in evidence as `<pageId>#<blockId>`, so a prefix match on the id is
 * the grounded test; a Figma ref appears verbatim. Neither compares a name to
 * a name.
 */
export function declaredArtifacts(input: DeclaredArtifactInput): DeclaredArtifact[] {
  const refs = input.evidenceExternalRefs.filter(Boolean);
  const out: DeclaredArtifact[] = [];

  for (const pageId of input.notionPageIds) {
    const supplied = refs.some((r) => r === pageId || r.startsWith(`${pageId}#`));
    if (supplied) continue;
    out.push({
      key: `source:declared:notion:${pageId}`,
      kind: "notion_page",
      ref: pageId,
      lane: "notion",
      field: "Scope.notionPageIds",
    });
  }

  for (const figmaRef of input.figmaRefs) {
    const supplied = refs.some((r) => r === figmaRef || r.startsWith(`${figmaRef}#`));
    if (supplied) continue;
    out.push({
      key: `source:declared:figma:${figmaRef}`,
      kind: "figma_artifact",
      ref: figmaRef,
      lane: "figma",
      field: "Scope.figmaRefs",
    });
  }

  return out.sort((a, b) => a.key.localeCompare(b.key));
}
