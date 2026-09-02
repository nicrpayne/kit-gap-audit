# Signal Search

**Maturity: LEVEL 1 — lexical, tokenised, fuzzy.**
Signal's search finds text you can type. **It does not understand what you
mean.** That sentence is printed in the product's own empty state, and this
document exists so nobody has to infer the boundary from behaviour.

---

## 1. What went wrong, and why

Verified production testing found search below a dependable Level 1. Three
failures, all real, all with the same shape:

| Query | Result | Cause |
| --- | --- | --- |
| `JSA Notifications Discussion` | 0 | indexed the raw ref, drew the humanised name |
| `KE Dev Standup` | 0 | same |
| an exact visible Evidence quote | 0 | the quote was never indexed at all |
| `notifictions` | 0 | no typo tolerance |

Plus a fourth, worse than any of them: **repeated searches progressively
opened the graph**, one tested run ending at 435 of 438 nodes expanded.

### The root cause of the natural-title failure

One node had **two projections, and only one of them had been humanised.**

The renderer draws a source through `humanizeRef`:

```
ke://source/transcript/2026-08-19_KE-JSA-Notifications-Discussion
  →  2026-08-19 · KE JSA Notifications Discussion
```

Search indexed `node.label` — the raw ref — and matched with
`haystack.includes(query.toLowerCase())`. A plain substring test over a
concatenation of eight attributes.

So `"jsa notifications discussion"` was compared against
`"...2026-08-19_ke-jsa-notifications-discussion..."`, where the separators are
underscores and hyphens. Not a substring. Zero results.

`JSA-Notifications-Discussion` "worked" for the same reason it failed: it
happened to share the raw string's separator convention. **The user was being
asked to know that a separator is an underscore.**

The Evidence-quote failure is the same defect one level down: a passage node's
`label` is its evidence id (`ke-ev-0132`), the quote lives in `excerpt`, and
`excerpt` was not in the indexed field list. The field displayed the quote;
search had never seen it.

---

## 2. The model

```
AuditGraph  ──buildSearchDocuments──▶  SearchDocument[]  ──▶  SignalSearchIndex
   canonical            derived, read-only              MiniSearch, in-memory
```

**`SearchDocument` is a derived read model.** It holds no truth of its own,
every document carries the canonical node id it projects, and the whole search
layer contains no database handle, no network call, no graph mutation and no
write verb. A proof asserts that against the source with comments stripped.

Each document carries what a result row needs to render:

- canonical node id, kind, semantic subtype, human type label
- **family** — `reality` / `external` / `evidence` / `source`, a trust
  boundary rather than a decoration
- human title, and whether it had to fall back to a raw id
- source title and date
- the weighted fields, each pre-normalised and pre-tokenised

### Titles

Three kinds are keyed on a raw identifier and are unreadable as results:

| Kind | `label` is | Title becomes |
| --- | --- | --- |
| passage | evidence id | the **quote** |
| source / transcript | `ke://…` ref | `humanizeRef(ref)` |
| work | `SOF-487` | the ticket **title** (the id stays indexed) |

`humanizeRef` and `fieldLabel` are **imported from the renderer**, not
reimplemented. That is the whole anti-drift guarantee: the string on screen
and the string in the index are produced by one piece of code, so the original
defect cannot come back.

### Index vs display

They differ in **length only, never in content**:

- The `title` **field** indexes what the field paints (`fieldLabel`).
  MiniSearch scores BM25, which normalises by field length; indexing a
  140-character statement as a "title" makes every one-word title outrank it.
  Measured: promoting full statements into `title` pushed a Requirement from
  2nd to 4th on `offline`, behind a Notion page named after a file.
- The **displayed** title is the full statement. A requirement cut at sixty
  characters is not distinguishable from the next requirement cut at sixty.

The full text stays fully searchable at `statement` / `excerpt` weight.

---

## 3. Normalisation

One function, applied to **both sides** of every comparison
(`lib/audit/searchText.ts`):

1. NFKD, then strip combining marks — `Jovanovská` = `Jovanovska`
2. lowercase
3. apostrophes **removed**, not spaced — `don't` → `dont`, so both forms match
4. **every** non-alphanumeric becomes a space — written as "keep letters and
   digits" (`\p{L}\p{N}`) rather than a punctuation blocklist, so a character
   nobody anticipated cannot stay glued to a word
5. collapse whitespace

```
ke://source/transcript/2026-08-19_KE-JSA-Notifications-Discussion
  →  ke source transcript 2026 08 19 ke jsa notifications discussion
2026-08-19 · KE JSA Notifications Discussion
  →  2026 08 19 ke jsa notifications discussion          ← a suffix of the above
SOF-487  →  sof 487           (and `compactSearchText` → sof487)
```

Deliberately **not** here: stemming, synonyms, stop-word removal, phonetics.
Each makes a match harder to explain, and an unexplainable match in a project
brain is worse than a missing one.

---

## 4. Library: MiniSearch, after rejecting Fuse.js

Fuse.js was evaluated first, as required, in four configurations against this
corpus. It handles natural titles well and **fails three requirements
structurally**:

| Failure | Measurement |
| --- | --- |
| Exact identifiers rank like noise | `SOF-487` normalises to `sof 487`, which **equals** the work item's identifier field. Best Fuse config scored it **0.674** (1.0 = worst) while admitting `SOF-400` and `SOF-401` — the **wrong tickets** — at 0.80. Fuse combines its weighted score across every key, so a document with one perfect field and eight empty ones cannot score well. Not a tuning knob. |
| Fuzzy is not restrained | `notif` returned **20 of 61 documents** — a third of the corpus — including a cluster called "notion" and six documents matched fuzzily inside a raw id. Identical at threshold 0.2 and 0.35. |
| Scores incomparable across queries | exact person name **0.000**, exact ticket id **0.674**, exact 60-char quotation **0.116**. No single cutoff serves both `notif` and a pasted sentence. |

MiniSearch, same corpus and same normalisation: **zero empty result sets
across the 38-query matrix, and every query with a named expectation ranks it
first**. Exactly one result for each of `SOF-487`, `SOF-510` and all seven
exact quotations; `notif` held to 10 documents all genuinely about
notifications. Smaller bundled too — **5.9 KB min+gz against Fuse's 9.1 KB**.

It wins because its unit of matching is the **token**, not a character window.
`400` is not within one edit of `487` at three characters, so the wrong ticket
is never a candidate. Fuse's Bitap slides over the whole string and cannot make
that distinction.

---

## 5. Field weights

```
title 1.00 > statement 0.92 > excerpt 0.86 > source 0.80
  > identifier 0.72 > person 0.68 > type 0.42 > alias 0.34 > meta 0.22
```

Raw ids stay indexed at `alias` weight rather than dropped — **findable, not
loud**. A Hermes operator pasting `KE-OBS-0042` lands on it; `notifications`
never surfaces a raw id ahead of a meeting actually called "JSA Notifications
Discussion".

### Ties

Score, then strongest matched field, then **recency**, then canonical id.

Recency is a **tiebreak and never a score component**. `KE Dev Standup` matches
two transcripts in the same series at an identical score, and someone typing
that means the last one. Folding recency into scoring would let a weaker text
match outrank a stronger one; a proof pins that an older, better match still
wins.

---

## 6. Typo tolerance

Per-token edit distance scaled to token length — the setting Lucene and
Elasticsearch both landed on, for the same reason:

| Token length | Edits allowed | Why |
| --- | --- | --- |
| 1–4 | **none** | one edit in a three-letter word changes which word it is. `487` must never reach `400`; `sof` must never reach `of`. Both measured on this corpus. |
| 5–7 | 1 | `standup` reaches `standups`, nothing else here |
| 8+ | 2 | `notifictions` reaches `notifications` — and on this corpus reaches exactly **two** vocabulary tokens out of 277 |

Prefix matching starts at **3 characters**. Below that a prefix is a query for
the whole corpus, and a list that flashes the entire project between
keystrokes is worse than one that waits.

Measured restraint: `notifictions` returns 10 of 61 documents and **every one
is about notifications**.

---

## 7. Search is a lens, not an edit

The disclosure defect was one line:

```ts
setExpanded((prev) => new Set([...prev, ...needed]))   // ← the bug
```

Right in intent — a match nobody can see reads as broken — and wrong in
mechanism. `expanded` is what the **reader** opened. It is persistent, nothing
took those additions back, and Escape clears the query without closing what the
query opened. Every search left the field more open than it found it.

**Two channels now:**

| | Owner | Lifetime | Written by search? |
| --- | --- | --- | --- |
| `expanded` | the reader | persistent | **never** |
| `revealed` | the current query | replaced every keystroke, empty when the query is | derived, not accumulated |

The renderer unions them in exactly one place (`disclosedSet`). **Nothing needs
restoring, because nothing was disturbed** — clearing the search does not undo
a mutation, it stops deriving a set. That is a stronger guarantee than
snapshot-and-restore, which is only ever as correct as its last snapshot.

**Taking a result** is the one act allowed to persist, because the reader chose
it, and it commits the **minimum** — the single cluster that object sits
behind, by the same rule the temporary reveal uses. Then `select`, unchanged,
so a result frames under the same law a direct click does. No second camera
call, no forced zoom, no Expand All.

Measured in a browser: twelve consecutive searches, `32 → 32` opened. Taking a
result, `32 → 40` of 51. The defect reached 435 of 438.

---

## 8. Trust laws

- Search is **read-only**. It cannot mutate Reality, promote Decisions, change
  Forecast inputs, write rows, accept Findings, or alter canonical graph state.
  Proved structurally against the source and observed in a browser: **zero
  requests of any kind leave the page while typing.**
- A score says **how well the text matched**. It is never presented as truth,
  confidence, or business importance, and the type's own documentation says so
  where it gets read.
- The four families keep an external producer's claim visually distinct from
  Signal's own. A result list that let an external Risk read as a Signal Risk
  would be a correctness failure, not a UI one.

---

## 9. Performance

At **429 nodes** (production scale; the real JSA graph is ~438):

| | |
| --- | --- |
| documents built | 17 ms |
| index built | 21 ms |
| query p50 | **0.22 ms** |
| query p95 | 1.7 ms |
| index footprint | 2.9 MB |
| `/audit` bundle | 51.9 → 61.1 kB (+9.2 kB) against `77c6645` |
| first load JS | 206 → 216 kB |
| network per keystroke | **none** |

---

## 10. Seams for what comes next

Deliberately clean, deliberately unbuilt.

**Level 2 — relation-aware.** Every hit already carries its canonical node id,
so `semanticFocus(graph, hit.id)` gives the one-hop neighbourhood with no new
lookup. A Level 2 pass would reorder *these* hits by graph proximity to the
selection. No new index, no change to `SearchDocument`.

**Level 3 — vector / semantic.** `SearchDocument` is already the unit that
would be embedded: one document per node, with `title`, `statement` and
`excerpt` as the fields worth embedding. A vector store sits **beside** this
index and merges at the hit list — it does not replace it. Lexical recall for
ids and exact quotes is not something embeddings do better.

**Level 4 — grounded synthesis.** Needs 2 and 3 first, and needs an answer to
"which passage grounds this sentence" that this layer deliberately does not
attempt.

---

## 11. Known Level-1 limits

- **No stemming.** `approval` does not find `approvals` unless prefix matching
  reaches it (it does, from 3 characters — but `ran` will not find `running`).
- **No synonyms.** `ticket` does not find `issue`; `blocker` does not find
  `dependency`.
- **No concept search.** "what is risky about the release" is a Level 3
  question and returns only documents containing those words.
- **Word-order insensitive.** All terms must appear; their order does not
  affect the score.
- **Short tokens get no typo tolerance** — by design (see §6). `SOF-48` finds
  nothing rather than guessing at `SOF-487`.
- **Partial-match fallback is announced but coarse.** When no document contains
  every term, the index requires *half* of them and the UI says "partial
  match". It does not know which half mattered.

---

## Proofs

- `scripts/audit-search-proof.ts` — 104 checks: normalisation, projection,
  ranking, fuzzy restraint, the lens, read-only, the full query matrix,
  snippets, performance at two scales. Runs with no database and no package
  file; indexes the real bridge package additionally when it is present.
- `scripts/audit-search-shoot.mjs` — 30 checks in a browser: reading a name off
  the field and finding it, reading a quote off the screen and finding its
  passage, the disclosure lens across twelve queries, Escape ordering, arrow
  keys, the empty state, and zero requests while typing.
