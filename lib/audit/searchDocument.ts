// THE SEARCH DOCUMENT — WHAT A NODE LOOKS LIKE TO SOMEONE LOOKING FOR IT.
//
//   THIS IS A DERIVED READ MODEL. It holds no truth of its own. Every field
//   is copied from the graph, every document names the canonical node id it
//   projects, and nothing here writes, promotes, accepts or reorders anything
//   in Reality. Deleting this file would cost Signal its search and cost it
//   nothing else.
//
// ── THE BUG THIS EXISTS TO END ────────────────────────────────────────
//
// A transcript node is DISPLAYED through `humanizeRef` as
//
//   2026-08-19 · KE JSA Notifications Discussion
//
// and was INDEXED as its raw `label`,
//
//   ke://source/transcript/2026-08-19_KE-JSA-Notifications-Discussion
//
// so typing the words visible on screen returned zero results. Two
// projections of one node, and only one of them had been humanised.
//
// The fix is structural rather than a wider match: the document indexes the
// SAME humanised string the field draws, by calling the SAME function. They
// cannot drift, because there is only one of them.
//
// ── AND WHAT IT INDEXES BEYOND THE TITLE ──────────────────────────────
//
// A passage's label is its evidence id — `row-14`, `ke-ev-0132` — and the
// thing a reader has in their head is the QUOTE. Indexing the label alone is
// why a sentence plainly visible in an Evidence Passage could not be found by
// typing it. `excerpt` is a first-class field here for that reason.

import type { AuditGraph, AuditNodeAttributes, GraphSlice, NodeKind } from "./graph";
// THE DISPLAY RULE ITSELF, NOT A COPY OF IT. Importing the renderer's own
// humaniser is the whole point: a second implementation would drift, and the
// drift IS the defect. `KIND_LABEL` comes along for the same reason — a
// result must be named the way the inspector names it.
import { fieldLabel, humanizeRef, KIND_LABEL } from "@/components/audit/graphTokens";
import { compactSearchText, normalizeSearchText } from "./searchText";

/**
 * The weighted fields. Ordered here as they are ranked — see FIELD_WEIGHT.
 *
 * A field is a REASON A RESULT MATCHED, which is why the list is short and
 * every entry is something a reader would accept as an explanation. "It
 * matched your words in the quote" is an explanation; "it matched in the
 * concatenation of nine attributes" is not.
 */
export type SearchFieldName =
  | "title"
  | "statement"
  | "excerpt"
  | "source"
  | "identifier"
  | "person"
  | "type"
  | "alias"
  | "meta";

/**
 * WHAT KIND OF CLAIM THIS IS — the distinction Signal refuses to blur.
 *
 *   reality   Signal's own semantic model: findings, decisions, requirements,
 *             work, people, the project itself.
 *   external  an outside producer's structured intelligence. NOT Signal's
 *             claim, and a result list that reads as though it were would be
 *             a trust failure, not a UI one.
 *   evidence  a quoted passage — words someone actually wrote or said.
 *   source    the artifact those words came out of.
 */
export type SearchFamily = "reality" | "external" | "evidence" | "source";

export interface SearchDocumentField {
  field: SearchFieldName;
  /** As a human would read it. This is what a snippet is cut from. */
  text: string;
  /** As search compares it. See searchText.ts. */
  norm: string;
  /** `norm`, split. Held rather than recomputed — a query touches every
      document's every field, and re-splitting on each keystroke is the one
      avoidable cost at this scale. */
  tokens: string[];
}

export interface SearchDocument {
  /** THE CANONICAL GRAPH NODE ID, unchanged. The only handle back, and the
      reason a result can be focused without a second lookup table. */
  id: string;
  kind: NodeKind;
  /** The producer's or the model's own subtype, where one exists:
      `risk` for an external Risk, `missing_work` for a Finding,
      `transcript` for a source. Null when the data does not say. */
  subtype: string | null;
  /** What this is, in the reader's words. "External risk", "Transcript". */
  typeLabel: string;
  family: SearchFamily;
  /** The human title. NEVER a raw id when anything better exists — that
      choice is `titleFor` and it is the heart of this projection. */
  title: string;
  /** Whether `title` fell back to a raw identifier because the node genuinely
      carries no human name. Shown, not hidden: a passage with no quote is a
      data fact worth seeing. */
  titleIsRaw: boolean;
  /** The artifact this came out of, humanised, when it has one. */
  sourceTitle: string | null;
  /** The producer's own observation date, ISO, when it has one. Never a
      clock reading of this app's. */
  sourceDate: string | null;
  lane: string | null;
  slice: GraphSlice;
  fields: SearchDocumentField[];
  /** `id`, compacted — so a node id pasted whole still finds its node. */
  idCompact: string;
}

/**
 * How much each field is allowed to say about relevance.
 *
 * The ordering is the product requirement, stated as numbers:
 *
 *   human title > semantic statement > evidence quote > source title
 *     > ticket id > person > what-kind-of-thing > raw id > technical metadata
 *
 * Raw identifiers stay indexed at 0.34 rather than being dropped, and the
 * distinction matters: a Hermes operator pasting `KE-OBS-0042` must still
 * land on it, while `notifications` must never surface a raw id ahead of a
 * meeting actually called "JSA Notifications Discussion". Findable, not loud.
 */
export const FIELD_WEIGHT: Record<SearchFieldName, number> = {
  title: 1.0,
  statement: 0.92,
  excerpt: 0.86,
  source: 0.8,
  identifier: 0.72,
  person: 0.68,
  type: 0.42,
  alias: 0.34,
  meta: 0.22,
};

/** Signal's own semantic model, an outside producer's, a quote, or the thing
    a quote came out of. Four families, and the renderer marks all four. */
export function familyOf(kind: NodeKind): SearchFamily {
  if (kind === "intel" || kind === "intelligence") return "external";
  if (kind === "passage") return "evidence";
  if (kind === "source" || kind === "transcript" || kind === "notion_page" || kind === "figma_artifact") {
    return "source";
  }
  return "reality";
}

/**
 * What a result calls itself.
 *
 * `KIND_LABEL` is Signal's vocabulary and it is correct, but a list of nine
 * results each saying "External intelligence" tells the reader nothing. The
 * producer already types its objects; this shows that type — the same
 * decision `resultKind` made in the instrument, made once and shared.
 */
export function typeLabelFor(attrs: { kind: NodeKind } & Record<string, unknown>): string {
  if (attrs.kind === "intel") {
    const t = String(attrs.intelligenceType ?? "").trim();
    if (!t) return "External object";
    const spaced = t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
    return `External ${spaced.toLowerCase()}`;
  }
  if (attrs.kind === "finding") {
    const k = String(attrs.kindLabel ?? "").trim();
    return k.length > 0 ? k : KIND_LABEL.finding;
  }
  return KIND_LABEL[attrs.kind] ?? attrs.kind;
}

/** The producer's or the model's own subtype, where the data carries one. */
function subtypeOf(attrs: AuditNodeAttributes): string | null {
  if (attrs.kind === "intel") return String(attrs.intelligenceType ?? "") || null;
  if (attrs.kind === "finding") return String(attrs.type ?? "") || null;
  if (typeof attrs.sourceType === "string" && attrs.sourceType) return attrs.sourceType;
  return null;
}

/**
 * THE HUMAN NAME OF A NODE, and the single most important decision here.
 *
 * Three kinds carry a raw identifier in `label` because that is genuinely
 * what the row is keyed on, and all three are unreadable as a search result:
 *
 *   passage   labelled with its evidence id; the QUOTE is the name.
 *   source    labelled with its `ke://...` ref; the humanised ref is the name.
 *   work      labelled with `SOF-487`; the TITLE is the name, and the
 *             identifier is still indexed separately so typing it works.
 *
 * Returns the fallback flag alongside, because "this passage has no quote" is
 * a fact about the data and the result list says so rather than pretending.
 */
export function titleFor(attrs: AuditNodeAttributes): { title: string; raw: boolean } {
  const label = String(attrs.label ?? "");

  if (attrs.kind === "passage") {
    const q = String(attrs.excerpt ?? "").trim();
    // Matches the field's own rendering: the quote, stripped of the quote
    // marks a producer may or may not have included, then re-quoted once.
    if (q) return { title: `“${q.replace(/^["“”']+|["“”']+$/g, "").trim()}”`, raw: false };
    return { title: label, raw: true };
  }

  if (familyOf(attrs.kind) === "source") {
    const h = humanizeRef(label);
    return { title: h, raw: h === label && /^[a-z]+:\/\//.test(label) };
  }

  if (attrs.kind === "work") {
    const t = String(attrs.title ?? "").trim();
    return t ? { title: t, raw: false } : { title: label, raw: true };
  }

  if (attrs.kind === "intelligence") {
    // An intelligence PACKAGE is labelled with its package id, which is the
    // only name it has. Humanised so `jsa_structured_intel_v3` reads as words.
    return { title: humanizeRef(label), raw: false };
  }

  // A LABEL TRUNCATED FOR THE FIELD IS NOT A TITLE FOR A LIST.
  //
  // A requirement's label is its statement cut to 64 characters so it fits
  // beside a mark, and an external object's is its statement cut to 56. A
  // result row is two lines wide and has room for the whole sentence — and
  // the sentence is the only thing that distinguishes two requirements whose
  // first sixty characters agree. The full text is on the node; use it.
  if (typeof attrs.statement === "string" && attrs.statement.trim().length > 0) {
    const s = attrs.statement.trim().replace(/^["“”']+|["“”']+$/g, "");
    if (s.length > label.length) return { title: s, raw: false };
  }

  return { title: label, raw: label.length === 0 };
}

/**
 * THE NAME THE FIELD ACTUALLY PAINTS — which is what the `title` FIELD
 * indexes, and it is deliberately not always what a result row displays.
 *
 * The two differ in LENGTH ONLY, never in content, and the distinction earns
 * its keep at both ends:
 *
 *   INDEXING wants the short form. MiniSearch scores BM25, which normalises
 *   by field length; indexing a 140-character statement as a "title" makes
 *   every one-word title in the corpus outrank it. Measured: promoting the
 *   full statement into `title` pushed a Requirement from second to fourth
 *   on `offline`, behind a Notion page named after a file. The full text is
 *   already indexed at `statement` and `excerpt` weight, so nothing becomes
 *   unfindable.
 *
 *   DISPLAY wants the long form. A requirement cut at sixty characters is
 *   not distinguishable from the next requirement cut at sixty characters.
 *
 * `fieldLabel` is the renderer's own function. Calling it — rather than
 * reimplementing "what does the field show" — is the same anti-drift move
 * `humanizeRef` is here for, and it is the whole reason the original defect
 * cannot come back: the string on screen and the string in the index are
 * produced by one piece of code.
 */
function indexedTitleFor(attrs: AuditNodeAttributes): string {
  return fieldLabel(attrs as unknown as Record<string, unknown>);
}

/** A field entry, or nothing when the text is empty. Keeps the callers below
    to one line each and guarantees no empty field is ever indexed. */
function field(fieldName: SearchFieldName, text: unknown): SearchDocumentField | null {
  const s = typeof text === "string" ? text.trim() : "";
  if (s.length === 0) return null;
  const norm = normalizeSearchText(s);
  if (norm.length === 0) return null;
  return { field: fieldName, text: s, norm, tokens: norm.split(" ") };
}

/**
 * Every source artifact in the graph, by the ref a passage names it with.
 *
 * Built once per projection rather than per passage: resolving through
 * `outEdges` for each of several hundred passages is the one accidental
 * O(n*e) in this file, and the passage already carries the ref.
 */
function sourceIndexOf(graph: AuditGraph): Map<string, { title: string; date: string | null }> {
  const out = new Map<string, { title: string; date: string | null }>();
  graph.forEachNode((_n, a) => {
    if (familyOf(a.kind) !== "source") return;
    const ref = String(a.label ?? "");
    if (!ref) return;
    out.set(ref, {
      title: humanizeRef(ref),
      date: typeof a.observedAt === "string" ? a.observedAt : null,
    });
  });
  return out;
}

/**
 * Project one graph into the documents search reads.
 *
 * DETERMINISTIC: same graph in, same documents out, in graph order. Nothing
 * here reads a clock, a random source or the database — the same contract
 * `buildAuditGraph` holds, and for the same reason: a proof that has to
 * account for ordering is a proof nobody trusts.
 */
export function buildSearchDocuments(graph: AuditGraph): SearchDocument[] {
  const sources = sourceIndexOf(graph);
  const docs: SearchDocument[] = [];

  graph.forEachNode((id, a) => {
    const { title, raw } = titleFor(a);
    const typeLabel = typeLabelFor(a);
    const family = familyOf(a.kind);

    // Where this came from, when the node knows. A passage names its source
    // by ref; a Source row IS the artifact and dates itself.
    const ref = typeof a.sourceRef === "string" ? a.sourceRef : null;
    const src = ref ? sources.get(ref) ?? null : null;
    const sourceTitle = family === "source" ? null : src?.title ?? null;
    const sourceDate =
      src?.date ??
      (typeof a.observedAt === "string" ? a.observedAt : null) ??
      (typeof a.observedDate === "string" ? a.observedDate : null);

    const f: (SearchDocumentField | null)[] = [
      field("title", indexedTitleFor(a)),
      field("type", typeLabel),

      // ── THE SEMANTIC CLAIM ────────────────────────────────────────
      // One field name for what the object SAYS, whatever the kind calls it:
      // an external Decision's statement, a Requirement's wording, a
      // Finding's rationale, a Checkpoint's detail. A reader searching for
      // the words of a claim does not know or care which table it is in.
      field("statement", a.statement),
      field("statement", a.rationale),
      field("statement", a.detail),
      field("statement", a.quote),

      // ── THE QUOTE ─────────────────────────────────────────────────
      // The verified production failure: visible text that could not be
      // found. Indexed for passages, and for a requirement whose statement
      // IS its excerpt, this simply repeats at a different weight, which is
      // correct — the wording is both the claim and the quotation.
      field("excerpt", a.excerpt),

      field("source", sourceTitle),
      // A source artifact's own humanised name lands in `source` as well as
      // `title`, so a transcript ranks on it under either reading.
      family === "source" ? field("source", title) : null,

      // ── IDENTIFIERS PEOPLE ACTUALLY TYPE ──────────────────────────
      //
      // A WORK ITEM'S IDENTIFIER IS ITS LABEL. `SOF-487` is what the node is
      // labelled with and what a person types; the node carries no separate
      // `identifier` attribute, so without this line the one query a ticket
      // id is for would land in `alias` at a third of the weight. Measured:
      // before this, "SOF-487" reported its matched field as "raw id".
      field("identifier", a.kind === "work" ? String(a.label ?? "") : a.identifier),
      field("identifier", a.externalId),
      field("identifier", a.personId),

      // ── NAMED HUMANS ──────────────────────────────────────────────
      // A person's name is already their title; these are the OTHER places a
      // name appears, so "what is Lucija on" reaches the tickets too.
      a.kind === "person" ? field("person", title) : null,
      field("person", a.assignee),
      field("person", a.owner),

      // ── FALLBACK ALIASES ──────────────────────────────────────────
      // Raw ids stay findable and stay quiet. `ref` is the canonical row
      // pointer (`EvidenceItem:snap:row-14`), `label` is the raw label for
      // the kinds whose title replaced it, and `id` is the node id itself —
      // a support conversation that ends in someone pasting
      // `passage:snap-1:ke-ev-0132` must land somewhere.
      field("alias", a.ref),
      raw || a.kind === "work" || a.kind === "passage" || family === "source"
        ? field("alias", String(a.label ?? ""))
        : null,
      field("alias", id),
      field("alias", a.externalRef),
      field("alias", a.sourceRef),
      field("alias", a.snapshotId),
      field("alias", a.evidenceId),

      // ── TECHNICAL METADATA, LAST AND QUIETEST ─────────────────────
      // Findable — "what is on the capacity cluster", "which decisions are
      // committed" — without ever outranking a real name.
      field("meta", a.lane),
      field("meta", a.section),
      field("meta", a.dataStatus),
      field("meta", a.state),
      field("meta", a.status),
      // The cluster's own name, so a person is reachable by the sector they
      // sit in. Kept from the prior implementation, which was right about it.
      a.kind === "person" ? field("meta", "capacity") : null,
    ];

    // Deduplicated on field+norm. A requirement whose statement and excerpt
    // are the same string legitimately indexes both (different weights); two
    // IDENTICAL entries at the same weight are noise that would double-count
    // in scoring.
    const seen = new Set<string>();
    const fields: SearchDocumentField[] = [];
    for (const entry of f) {
      if (!entry) continue;
      const key = `${entry.field} ${entry.norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push(entry);
    }

    docs.push({
      id,
      kind: a.kind,
      subtype: subtypeOf(a),
      typeLabel,
      family,
      title,
      titleIsRaw: raw,
      sourceTitle,
      sourceDate,
      lane: typeof a.lane === "string" ? a.lane : null,
      slice: a.slice,
      fields,
      idCompact: compactSearchText(id),
    });
  });

  return docs;
}

/** Every token in the corpus, once. The typo-tolerance pass corrects a query
    token toward one of these rather than toward the whole dictionary — see
    searchQuery.ts. */
export function corpusVocabulary(docs: readonly SearchDocument[]): Set<string> {
  const out = new Set<string>();
  for (const d of docs) for (const f of d.fields) for (const t of f.tokens) out.add(t);
  return out;
}
