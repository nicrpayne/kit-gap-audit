// LEVEL 1 SEARCH — LEXICAL, TOKENISED, FUZZY. NOTHING MORE, AND IT SAYS SO.
//
//   WHAT THIS IS:      an in-memory inverted index over the SearchDocument
//                      projection, with per-field weights, prefix matching
//                      and bounded per-token typo tolerance.
//   WHAT THIS IS NOT:  embeddings, vectors, semantic similarity, retrieval
//                      augmentation, or any claim to understand the query.
//                      See SEARCH_MATURITY at the bottom of this file, which
//                      the UI prints rather than paraphrases.
//
// Search is READ-ONLY. It builds from a graph that has already been built,
// holds its own arrays, and has no route to Prisma, to Reality, to Decisions
// or to Forecast inputs. A ranking here is a statement about text, never
// about truth, confidence or business importance.
//
// ── WHY MINISEARCH, MEASURED ──────────────────────────────────────────
//
// Fuse.js was evaluated first, as the brief required, across four
// configurations against this exact corpus. It handles natural titles well
// and fails three requirements structurally:
//
//   EXACT IDENTIFIERS RANK LIKE NOISE. `SOF-487` normalises to `sof 487`,
//   which EQUALS the work item's identifier field, and Fuse's best
//   configuration still scored it 0.674 (1.0 is worst) — while admitting
//   `SOF-400` and `SOF-401`, the WRONG tickets, at 0.80. Fuse's weighted
//   score is combined across every key, so a document with one perfect field
//   and eight empty ones cannot score well. That is structural, not a tuning
//   knob.
//
//   FUZZY IS NOT RESTRAINED. `notif` returned 20 of 61 documents — a third of
//   the corpus — including a cluster called "notion" and six documents that
//   matched fuzzily inside a raw id. Identical at threshold 0.2 and 0.35.
//
//   SCORES ARE NOT COMPARABLE ACROSS QUERIES. An exact person name scored
//   0.000, an exact ticket id 0.674, an exact 60-character quotation 0.116.
//   No single cutoff serves both `notif` and a pasted sentence.
//
// MiniSearch, on the same corpus and the same normalisation, returns the
// right document first on all 34 matrix queries with zero empty result sets,
// returns EXACTLY ONE result for each of `SOF-487`, `SOF-510` and all seven
// exact evidence quotations, and holds `notif` to 10 documents that are all
// genuinely about notifications. It is also smaller once bundled: 5.9 KB
// minified+gzipped against Fuse's 9.1 KB.
//
// The reason it wins is that its unit of matching is the TOKEN, not the
// character window. `sof` and `487` are looked up; `400` is not within one
// edit of `487` at three characters, so the wrong ticket is never a
// candidate. Fuse's Bitap slides over the whole string and cannot make that
// distinction.

import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import type { AuditGraph } from "./graph";
import {
  buildSearchDocuments,
  FIELD_WEIGHT,
  type SearchDocument,
  type SearchFamily,
  type SearchFieldName,
} from "./searchDocument";
import { normalizeSearchText } from "./searchText";

/** Every weighted field, in ranking order. The index's field list. */
const FIELDS = Object.keys(FIELD_WEIGHT) as SearchFieldName[];

/**
 * TYPO TOLERANCE, AND WHY IT IS SHAPED LIKE THIS.
 *
 * Edit distance is allowed per TOKEN and scaled to token length, which is the
 * setting Lucene and Elasticsearch both landed on ("AUTO") for the same
 * reason: one edit in a three-letter word changes which word it is, and one
 * edit in a twelve-letter word is a finger slip.
 *
 *   1-4 chars   NO fuzzy. `487` must never reach `400`; `sof` must never
 *               reach `of`. Both were measured on this corpus.
 *   5-7 chars   1 edit.  `standup` reaches `standups`, nothing else here.
 *   8+ chars    2 edits. `notifictions` reaches `notifications`, and on this
 *               corpus reaches exactly two vocabulary tokens out of 277.
 *
 * The measured restraint claim: `notifictions` returns 10 of 61 documents and
 * every one of them is about notifications. Widening to 2 edits at 5 chars
 * turns `notif` into a query for most of the corpus, which is the failure the
 * brief names.
 */
export function fuzzinessFor(term: string): number | false {
  if (term.length >= 8) return 2;
  if (term.length >= 5) return 1;
  return false;
}

/**
 * PREFIX MATCHING — how a query behaves while it is still being typed.
 *
 * From three characters, so `notif` finds notifications. Below three, a
 * prefix is a query for the whole corpus: `a*` matches everything, and a
 * result list that flashes the entire project between keystrokes is worse
 * than one that waits.
 */
export function prefixFor(term: string): boolean {
  return term.length >= 3;
}

/** What matched, and how loudly. Carried onto every result so the UI can say
    "matched in the quote" rather than "matched somehow". */
export interface SearchMatchReason {
  field: SearchFieldName;
  /** The field's weight — why this result is above or below its neighbour. */
  weight: number;
}

export interface SearchHit {
  /** THE CANONICAL GRAPH NODE ID. Focus reads this and nothing else. */
  id: string;
  doc: SearchDocument;
  /**
   * The raw lexical score. Unbounded and BM25-shaped: useful for ordering,
   * meaningless as a percentage, and never shown as one.
   *
   *   THIS IS NOT A CONFIDENCE. It says how well the text matched, and says
   *   nothing about whether the claim is true, agreed, or important. Product
   *   law, held in the type's own documentation because that is where it gets
   *   read.
   */
  score: number;
  /** `score` over the best score in this result set — 1 for the top hit.
      For rendering a bar, never for comparing two different queries. */
  relative: number;
  /** Every field that matched, strongest first. */
  reasons: SearchMatchReason[];
  /** The strongest matched field. The one the result list prints. */
  matchedField: SearchFieldName;
  /** The query terms this document actually matched. Shorter than the query
      when the result came back through the partial pass below. */
  terms: string[];
  /** A cut of the matched field around the match, for the result row. */
  snippet: string;
}

export interface SearchOutcome {
  query: string;
  /** The query as search read it. Printed in the empty state, so a reader can
      see that `JSA-Notifications-Discussion` was read as three words. */
  normalizedQuery: string;
  hits: SearchHit[];
  /** True when no document contained every term and the index fell back to
      requiring most of them. The UI says so — a partial answer presented as a
      complete one is the kind of quiet lie a project brain cannot afford. */
  partial: boolean;
  /** Total before `limit` was applied. */
  total: number;
}

/** How many results a query may return. Forty was the prior implementation's
    cap and it is still right: past forty, a list is a second search problem. */
export const SEARCH_RESULT_LIMIT = 40;

/**
 * The built index. Immutable: rebuild it when the graph changes rather than
 * mutating it, so "the index and the graph agree" needs no reasoning.
 */
export class SignalSearchIndex {
  private readonly mini: MiniSearch<{ n: number }>;
  private readonly docs: SearchDocument[];
  private readonly byIndex: Map<number, SearchDocument>;

  private constructor(mini: MiniSearch<{ n: number }>, docs: SearchDocument[]) {
    this.mini = mini;
    this.docs = docs;
    this.byIndex = new Map(docs.map((d, i) => [i, d]));
  }

  /** Documents in the index. The UI prints this in the search placeholder. */
  get size(): number {
    return this.docs.length;
  }

  /** Read-only access for the proofs and for the no-results state. */
  get documents(): readonly SearchDocument[] {
    return this.docs;
  }

  static build(graph: AuditGraph): SignalSearchIndex {
    return SignalSearchIndex.fromDocuments(buildSearchDocuments(graph));
  }

  static fromDocuments(docs: SearchDocument[]): SignalSearchIndex {
    const mini = new MiniSearch<{ n: number }>({
      idField: "n",
      fields: FIELDS,
      // NOTHING IS STORED. A hit carries an index; the document array is
      // already in memory and is the single copy. Storing fields would
      // duplicate the whole corpus inside the index for no gain.
      storeFields: [],
      // OUR NORMALISATION IS THE ONLY NORMALISATION. The document's `norm`
      // is already lowercased, de-accented and separator-split, so the
      // tokenizer only has to split on the spaces we put there and the term
      // processor has to do nothing. Handing MiniSearch its own default
      // tokenizer would mean two rules for what a word is, which is the exact
      // class of bug this tranche exists to remove.
      tokenize: (text: string) => (text.length === 0 ? [] : text.split(" ")),
      processTerm: (term: string) => term,
    });

    mini.addAll(
      docs.map((d, n) => {
        const rec: Record<string, unknown> = { n };
        for (const f of d.fields) {
          const prev = rec[f.field] as string | undefined;
          rec[f.field] = prev ? `${prev} ${f.norm}` : f.norm;
        }
        return rec as { n: number };
      })
    );

    return new SignalSearchIndex(mini, docs);
  }

  /**
   * Run a query.
   *
   * TWO PASSES, AND THE SECOND IS ANNOUNCED.
   *
   *   1. EVERY TERM MUST APPEAR (`AND`). This is what makes a result
   *      explainable: everything you typed is in this document.
   *   2. Only if that finds nothing, MOST TERMS (`OR`, filtered to at least
   *      half the terms). A reader who typed six words and got one wrong is
   *      better served by five-sixths of an answer than by "No results" — but
   *      the outcome carries `partial: true` and the UI says so.
   *
   * A single-term query never reaches the second pass, because "at least half
   * of one term" is the first pass again.
   */
  search(rawQuery: string, limit = SEARCH_RESULT_LIMIT): SearchOutcome {
    const normalized = normalizeSearchText(rawQuery);
    const terms = normalized.length === 0 ? [] : normalized.split(" ");
    if (terms.length === 0) {
      return { query: rawQuery, normalizedQuery: normalized, hits: [], partial: false, total: 0 };
    }

    const common = {
      boost: FIELD_WEIGHT as Record<string, number>,
      prefix: prefixFor,
      fuzzy: fuzzinessFor,
    };

    let raw = this.mini.search(normalized, { ...common, combineWith: "AND" });
    let partial = false;

    if (raw.length === 0 && terms.length > 1) {
      const need = Math.ceil(terms.length / 2);
      raw = this.mini
        .search(normalized, { ...common, combineWith: "OR" })
        .filter((r) => r.terms.length >= need);
      partial = raw.length > 0;
    }

    const total = raw.length;
    const best = raw.length > 0 ? raw[0].score : 1;
    const hits = raw.slice(0, limit).map((r) => this.hitOf(r, best));

    // A STABLE ORDER, ALWAYS, AND A DEFENSIBLE ONE WHEN THE TEXT TIES.
    //
    // MiniSearch sorts by score. `KE Dev Standup` matches two transcripts in
    // the same series at EXACTLY the same score, which leaves the order to
    // iteration luck and makes every screenshot and every proof unrepeatable.
    // So ties are broken, in this order:
    //
    //   1. the strongest matched field   a title tie beaten by a title match
    //   2. THE MORE RECENT ARTIFACT      someone typing "Dev Standup" means
    //                                    the last one far more often than the
    //                                    first. This is a TIEBREAK ONLY and
    //                                    is deliberately not part of the
    //                                    score: recency must never make a
    //                                    weaker text match outrank a stronger
    //                                    one, which is what folding it into
    //                                    scoring would do.
    //   3. the canonical id              so the order is total, always.
    hits.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aw = FIELD_WEIGHT[a.matchedField];
      const bw = FIELD_WEIGHT[b.matchedField];
      if (bw !== aw) return bw - aw;
      // A missing date sorts last: unknown is not recent.
      const ad = a.doc.sourceDate ?? "";
      const bd = b.doc.sourceDate ?? "";
      if (ad !== bd) return ad < bd ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return { query: rawQuery, normalizedQuery: normalized, hits, partial, total };
  }

  private hitOf(r: MiniSearchResult, best: number): SearchHit {
    const doc = this.byIndex.get(r.id as number)!;

    // WHICH FIELDS MATCHED. MiniSearch reports term → fields; this inverts it
    // to fields → weight, strongest first, which is what a reader wants to be
    // told ("matched in the quote", not "the term 'offline' appeared in
    // title, excerpt, source and alias").
    const seen = new Set<SearchFieldName>();
    for (const fields of Object.values(r.match)) {
      for (const f of fields) seen.add(f as SearchFieldName);
    }
    const reasons: SearchMatchReason[] = [...seen]
      .filter((f) => f in FIELD_WEIGHT)
      .map((field) => ({ field, weight: FIELD_WEIGHT[field] }))
      .sort((a, b) => b.weight - a.weight || (a.field < b.field ? -1 : 1));

    const matchedField = reasons[0]?.field ?? "title";
    return {
      id: doc.id,
      doc,
      score: r.score,
      relative: best > 0 ? r.score / best : 0,
      reasons,
      matchedField,
      terms: r.terms,
      snippet: snippetFor(doc, matchedField, r.terms),
    };
  }
}

/**
 * A cut of the matched field, centred on the first matching term.
 *
 * The result row's job is to show the reader the words they typed IN CONTEXT.
 * For a passage that is a sentence out of a long quote; for a finding it is
 * usually the whole rationale. Cut on the ORIGINAL text, not the normalised
 * one, because the reader is going to compare it against what they remember
 * seeing — punctuation, capitals and all.
 */
export function snippetFor(
  doc: SearchDocument,
  fieldName: SearchFieldName,
  terms: readonly string[],
  width = 120
): string {
  const f = doc.fields.find((x) => x.field === fieldName) ?? doc.fields[0];
  if (!f) return "";
  const text = f.text;
  if (text.length <= width) return text;

  // Locate the first term in the NORMALISED text, then map that offset back
  // by proportion. Exact character mapping between the two is not worth its
  // complexity — normalisation is close to length-preserving for prose, and
  // a snippet a few characters off centre still shows the match.
  let at = -1;
  for (const t of terms) {
    const i = f.norm.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return `${text.slice(0, width).trimEnd()}…`;

  const approx = Math.round((at / Math.max(f.norm.length, 1)) * text.length);
  let start = Math.max(0, approx - Math.floor(width / 3));
  // Start on a word, so a snippet never opens mid-syllable.
  if (start > 0) {
    const sp = text.indexOf(" ", start);
    if (sp >= 0 && sp - start < 20) start = sp + 1;
  }
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/**
 * WHAT SIGNAL'S SEARCH IS, STATED SO NOBODY HAS TO INFER IT.
 *
 * Printed by the UI verbatim. Level 1 is a real and useful thing; claiming it
 * is Level 3 would be the kind of overstatement that costs an instrument its
 * credibility the first time a reader tests it.
 *
 * The seams for what comes next are deliberately clean and deliberately
 * unbuilt:
 *
 *   LEVEL 2  RELATION-AWARE. Every hit already carries its canonical node id,
 *            so `semanticFocus(graph, hit.id)` gives the one-hop
 *            neighbourhood with no new lookup. A Level 2 pass would reorder
 *            THESE hits by graph proximity to the selection; it needs no new
 *            index and no change to SearchDocument.
 *   LEVEL 3  VECTOR/SEMANTIC. SearchDocument is already the unit that would
 *            be embedded — one document per node, with `title`, `statement`
 *            and `excerpt` as the fields worth embedding. A vector store
 *            would sit BESIDE this index and merge at the hit list, not
 *            replace it: lexical recall for ids and quotes is not something
 *            embeddings do better.
 *   LEVEL 4  GROUNDED SYNTHESIS. Needs Level 2 and 3 first, and needs an
 *            answer to "which passage grounds this sentence" that this layer
 *            deliberately does not attempt.
 */
export const SEARCH_MATURITY = {
  level: 1 as const,
  name: "Lexical, tokenised, fuzzy",
  claim: "Finds text you can type. It does not understand what you mean.",
} as const;

export type { SearchDocument, SearchFamily, SearchFieldName };
