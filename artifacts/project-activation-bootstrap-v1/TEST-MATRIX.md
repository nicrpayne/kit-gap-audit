# Deterministic fixtures and acceptance matrix

## Fixture set

All fixtures use invented projects and local deterministic data. No real future-product claims appear.

### F1 — Rich historical project: Harbor Relay

Corpus:

- two raw transcripts from different meetings;
- one imported spreadsheet with row anchors;
- one Notion requirement page;
- one Figma design-intent frame;
- one Linear project with executable issues;
- three current structured intelligence heads plus superseded history;
- one derivative wiki synthesis citing the transcripts and Notion page.

Expected:

- identity clear;
- multiple source types and exact provenance;
- five capability candidates, two Decision candidates, one explicit Scope dependency, one semantic related-only relationship, three milestone candidates;
- wiki repetition collapsed into its raw roots;
- accepted set activates and first Audit raises unmapped work/missing owner gaps.

### F2 — Sparse project: Cedar Note

Corpus:

- two exact mentions in one transcript;
- no current intelligence head;
- no execution source;
- no capability-level statement.

Expected:

- `Insufficient evidence to establish scope`;
- no invented candidate capability/staffing/date;
- activation allowed only after gap/no-Linear acknowledgement;
- first Audit partial and honest.

### F3 — Ambiguous alias collision: Northstar

Corpus:

- `NS` is an alias for an active project and a separate vendor program;
- semantic matches span both.

Expected:

- blocking identity review;
- no main-package inclusion solely from alias;
- Ready disabled until choose existing/remove alias/assert distinct and rescan;
- resolution retained.

### F4 — Contradictory evidence: Lantern Review

Corpus:

- older planning note says pilot Sep 10;
- newer workshop says pilot postponed, no replacement date;
- current intelligence heads explicitly contradict/supersede.

Expected:

- no averaged/invented date;
- milestone candidate flagged contradiction;
- operator may defer or plan a supplied date;
- commitment never inferred.

### F5 — Derivative wiki + raw transcript: Quayline

Corpus:

- one transcript passage;
- three evidence chunks from that transcript;
- two intelligence objects citing those chunks;
- wiki page restating the same claim.

Expected:

- one independent lineage root, not six;
- wiki labeled derivative;
- result drilldown reaches transcript locator;
- deleting raw-source availability changes grounding to derivative/unknown, not independent.

## Additional focused fixtures

- F6 provider outage: Notion/Figma unavailable, raw transcripts available.
- F7 huge semantic tail: 2,000 weak concept matches, 12 direct/exact results.
- F8 duplicate scope: two capability phrasings map to same Linear parent.
- F9 decision vs gate: strong Decision evidence, no serial wait evidence.
- F10 dependency direction: explicit “A cannot launch until B,” plus semantically related C.
- F11 relative date: “next Friday” with and without source timestamp/timezone.
- F12 manual operator assertion: no evidence, later supported and later contradicted variants.
- F13 activation fault injection at every canonical write boundary.
- F14 embedding outage/stale model version.

## Acceptance laws

| ID | Law | Deterministic assertion |
| --- | --- | --- |
| A01 | No candidate silently becomes Reality | After scan/review actions, counts for Scope/Capability/Decision/Gate/Dependency/TimelineEvent/Allocation/Report remain unchanged |
| A02 | Every accepted knowledge-derived item retains provenance | Canonical object → bootstrap candidate → package → evidence passage → artifact locator resolves |
| A03 | Derivative repetition is not corroboration | All F5 derivatives produce `independentLineageRootCount = 1` |
| A04 | First Audit uses accepted state + external knowledge | F1 Audit graph contains accepted canonical nodes and external intelligence/passages; rejected candidates absent from canonical set |
| A05 | Rejected/deferred have no Forecast effect | Same simulation seed before/after dispositions yields identical samples/dates |
| A06 | Semantic search drills to source | F1 idea hit opens evidence then exact artifact locator |
| A07 | Exact search regresses zero behavior | Existing `audit-search-proof` matrix remains green; exact ids/quotes rank first |
| A08 | Wiki is derivative | Wiki result family/label and lineage prevent independent count |
| A09 | Decision does not imply gate | Accept F9 Decision; gate row count remains zero and forecast samples unchanged |
| A10 | Semantic similarity is not causal | F10 C remains `related_only`; no ScopeDependency writer accepts it without operator causal rationale |
| A11 | Mention is not commitment | Candidate milestone creates no TimelineEvent; accepted plan defaults non-committed |
| A12 | Projected is not committed | Forecast projection produces no TimelineEvent and no commitment field |
| A13 | Person mention is not staffing | Accept/display people information; Person/Allocation rows unchanged unless separate Portfolio act |
| A14 | Operator assertion is explicit | No-evidence Capability stores origin/acknowledgement; Audit receives the gap |
| A15 | Activation is atomic/idempotent | F13 failures leave zero canonical rows; retry success returns same ids |
| A16 | No Linear is not zero work | F2 returns execution source `not_configured`; no fake likely date/completeness |
| A17 | Linear outage cannot prove absence | Partial Audit records unavailable provider and suppresses absence-based conclusions |
| A18 | Disposition memory is stable | Unchanged fingerprint preserves reject/defer; new independent root resurfaces with prior history |
| A19 | Edit preserves original | Original proposal hash stays; reviewed payload hash changes; both visible |
| A20 | Merge preserves ancestry | Survivor resolves all merged candidate ids and deduped evidence roots |

## Contract tests

- unsupported version rejected;
- geometry key rejected anywhere in package;
- package id/hash conflict returns 409;
- dangling evidence/intelligence/artifact refs rejected;
- derivative artifact claiming independence rejected;
- omitted provider inventory row rejected;
- missing raw lineage accepted with warning and grounding cap;
- candidate kind/payload mismatch rejected;
- relative date normalization requires anchor timestamp/timezone;
- source observed-at distinct from package generated-at and Signal accepted-at;
- raw unknown independence never defaults to independent.

## UX tests

- `⌘K → Add project` reachable everywhere the shared shell is used;
- direct URL/reload reproduces bootstrap section and selected candidate;
- keyboard candidate review and evidence drawer usable;
- no bulk Accept action;
- Ready summary exactly reconciles reviewed dispositions;
- collision and derivative-only blockers identify the required remedy;
- provider outage can be retried and can be acknowledged without disappearing;
- narrow viewport uses an evidence drawer with focus return;
- motion-reduced setting removes progress/candidate transitions without hiding state;
- all state is readable without color; semantic tokens meet existing contrast targets.

## Search evaluation set

Queries include:

- exact project name/alias/id;
- exact transcript title with punctuation differences;
- exact evidence quote;
- misspelled keyword already covered by Level 1;
- idea paraphrase (`field readiness` vs `prepared for on-site handoff`);
- ambiguous acronym;
- graph-related person/team query;
- derivative wiki concept;
- source known only semantically;
- unrelated control queries.

Measure:

- recall@10 and MRR on named expected results;
- exact id/quote rank = 1;
- lineage diversity among top 10;
- graph-only contamination;
- percent of semantic hits with resolvable provenance;
- latency p50/p95 at fixture scale and 10x scale;
- fallback correctness with semantic service disabled.

Do not convert vector distance into a “confidence” metric. Human judgments label expected relevance in the evaluation fixture.

## Migration/parity tests

- existing Scope rows receive no identity/Forecast changes;
- nullable teamKey path does not alter configured scopes;
- backfilled ScopeDependency rows produce byte-identical simulation inputs and seeded outputs to `dependsOnScopeIds`;
- Capability mappings do not double-count Linear parent/child issues;
- existing DecisionCandidate and TimelineEventCandidate acceptance tests remain green;
- current ContextSnapshot 1.0/1.1 validation and hash fixtures remain green;
- existing Audit spatial fingerprint and protected simulation files remain unchanged unless a dedicated later slice explicitly changes them.

## Production acceptance gate

Before deployment of implementation:

1. migrations tested against a scrubbed production-shaped database;
2. rollback/forward plan for nullable Linear binding and dependency dual-read;
3. all A01–A20 green;
4. visual proof at 1440×1000 and minimum supported width;
5. no production data writes during validation;
6. first activation performed on a generic disposable fixture project;
7. version/release note clearly states activation remains governed and semantic search phase status.
