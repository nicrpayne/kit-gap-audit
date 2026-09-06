# Historical corpus discovery

## Objective

Discovery answers “which historical knowledge may belong to this proposed project?” It does not decide what is true or what Signal should accept.

The pipeline is deterministic in orchestration and explainable in every inclusion. Semantic retrieval may be probabilistic, but it is bounded, versioned, and never presented as confidence or corroboration.

## Retrieval order

### 0. Provider inventory

Ask Hermes/bridge for the registered corpus inventory and availability:

- wiki pages;
- structured intelligence/current-state heads and historical chains;
- evidence passages;
- raw transcripts/source artifacts;
- imported spreadsheets/docs;
- already-configured Notion, Figma, Linear, and other connectors.

Record `available`, `partial`, `unavailable`, last successful read, and error class. Never silently omit an unavailable provider.

### 1. Exact identity

Normalize canonical name and aliases using the same rules as Level 1 search: Unicode normalization, case folding, punctuation to spaces, whitespace collapse. Match against:

- artifact titles and stable external ids;
- project/entity tags assigned by the compiler;
- structured intelligence scope/entity references;
- wiki titles/slugs;
- exact source hints;
- known project aliases.

Exact matches seed the candidate set and identity collision check. An acronym that maps to several entities is a collision signal, not several confirmations.

### 2. Lexical/fuzzy

Use tokenized Level 1 search over title, statement, excerpt, source title, identifier, people, type, and aliases. Preserve exact quote and identifier behavior. Apply the existing bounded typo tolerance. Return match fields and snippets.

### 3. Semantic idea retrieval

Embed only human-readable project concepts:

- artifact title + short synopsis;
- current intelligence statement;
- evidence passage excerpt;
- wiki heading + paragraph;
- canonical source document chunks.

Do not embed raw ids, source-system boilerplate, or entire unchunked transcripts. Query with canonical name, aliases, description, and operator source hints as separately logged query variants. Semantic retrieval only adds candidates; it never asserts membership.

### 4. Graph expansion

One bounded hop from high-relevance seeds, two hops only across lineage/identity edges:

- `cites` / `extracted_from` / `derived_from`;
- `supersedes` / `resolves` / `contradicts`;
- explicit project/entity membership;
- people/team participation;
- declared source cross-links.

Semantic relations may explain why an item is nearby, but `related_to` cannot promote it past the possible-review band on its own. Causal dependency edges are not inferred during expansion.

### 5. Lineage collapse

Group every passage and derivative artifact by raw origin lineage root. A transcript, three evidence passages from it, two intelligence heads citing it, and a wiki summary derived from it are **one evidence family**, not seven corroborating sources.

If raw origin is missing:

- retain the derivative item;
- set independence to `unknown` or `derivative`;
- create `raw_origin_missing` ambiguity;
- cap candidate grounding at low unless independent direct evidence exists elsewhere.

### 6. Candidate compilation

The compiler proposes identity, source, people, capabilities, Decisions, dependencies, milestones, risks/unknowns/commitments, and information gaps. Every proposal names why it exists and cites evidence/intelligence ids.

### 7. Deterministic validation

- all evidence refs resolve within the package;
- all artifact refs resolve;
- all lineage roots are internally consistent;
- derivative sources never claim independence;
- proposal ids are stable for unchanged normalized content + lineage roots;
- no geometry exists;
- package id hashes the versioned content;
- source/provider coverage reconciles with inventory.

## Relevance score (corpus triage only)

The score determines review routing, not truth. Store the component reasons, not just the number.

| Component | Max | Rule |
| --- | ---: | --- |
| Exact identity | 45 | canonical name 45; exact alias 40; unique external id 45; ambiguous acronym 20 |
| Lexical/fuzzy | 20 | weighted title/statement/quote fields using existing Level 1 logic |
| Semantic idea | 20 | calibrated rank bucket from the embedding retriever; raw distance is not exposed |
| Graph relation | 10 | explicit membership 10; cited/derived lineage 8; person/team adjacency 4; generic related 2 |
| Source hint | 5 | exact provider+ref hint 5; title-only hint 3 |
| Collision penalty | -25 | identity conflicts or alias shared with another project |
| Derivative-only penalty | -10 | affects routing only; does not imply the summary is false |

Caps:

- semantic-only results: maximum 69;
- generic graph-only results: maximum 44;
- unresolved alias collision: maximum 69 and `identity review required`;
- wiki-only with missing raw lineage: maximum 59.

Bands:

- `70–100 Included` — appears in the main Sources Found list;
- `45–69 Possible` — appears in a separate review tray, collapsed by default;
- `<45 Excluded` — kept in the scan manifest with reason and count; only visible in technical details unless it is needed to complete a lineage chain.

Nothing in any band is automatically accepted into Reality.

## Proposal grounding bands

Do not reuse the retrieval score. Grounding is categorical:

- **High grounding** — project identity is unambiguous; at least one direct raw passage or source-native structured record supports the statement; no unresolved contradiction; evidence locator resolves.
- **Medium grounding** — direct evidence exists but is stale, identity-ambiguous, incomplete, or contradicted; or a current intelligence head cites direct evidence but the exact raw artifact is temporarily unavailable.
- **Low grounding** — semantic/graph relationship only, derivative-only summary, missing raw origin, or uncited intelligence statement.

Multiple evidence items improve grounding only when they have distinct `lineageRootIds`. Count “2 independent origins,” never “7 supporting passages.”

Currentness is orthogonal and shown separately (`current`, `aging`, `stale`, `unknown`). Old historical evidence may still be highly relevant to project identity while being stale as a current-state claim.

## Human review thresholds

- High: create a pending proposal in the relevant review section.
- Medium: create a pending proposal marked `Needs review`; contradictions expanded.
- Low: default to `Information only` recommendation. The operator may promote it to a normal pending candidate after inspecting provenance.
- Blocking identity ambiguity: prevent Ready.
- Derivative-only source with missing raw evidence: may inform search/review but cannot satisfy the provenance rule for an accepted knowledge-derived canonical object.

## Large-corpus controls

- top-k per query variant and per artifact kind;
- maximum one graph expansion per lineage family;
- diversity quota across providers and time periods;
- semantic-only results isolated from direct matches;
- explicit “274 low-confidence matches withheld” count;
- ability to add a positive or negative identity clue and rerun;
- content-addressed scan so identical query/inventory revisions reuse results.

## Retrieval observability

For each artifact retain:

- normalized query variant;
- match reasons;
- retriever/model/version;
- lexical fields matched;
- graph path;
- inclusion band and cap/penalty reasons;
- lineage roots;
- provider read timestamp and scan timestamp separately.

This data is technical traceability. User-facing results say `Exact title`, `Quote`, `Keyword`, `Semantic match`, or `Related via graph`.

