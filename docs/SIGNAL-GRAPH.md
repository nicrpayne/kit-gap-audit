# The Signal Graph

The semantic graph capability Audit is built on. "Signal Graph" names the
capability and the future graph-first visual language; **Signal remains the
product**, and Audit is the instrument that currently uses the graph. A
standalone Graph instrument is explicitly deferred.

## What it is, and what it must never become

> A DERIVED, IN-MEMORY GRAPH PROJECTION OF SIGNAL AUDIT TRUTH.

It is **not** canonical storage, **not** a graph database, **not** a source of
truth, and it may **never** mutate Reality. Build it, throw it away, build it
again — nothing in the database has moved. A proof asserts exactly that.

Three layers, kept apart:

| Layer | Owns | File |
|---|---|---|
| Semantic graph | what is related to what, and why | `lib/audit/graph.ts` |
| Layout | where things sit | `lib/audit/graphLayout.ts` |
| Rendering | what it looks like, and how much of itself it shows | `components/audit/*` |

`graph.ts` imports no layout, holds no coordinates, and knows nothing about
pixels. That is enforced by proof, not by convention — because **a graph that
knows about geometry is a graph a line-crossing can reach.**

`graphology` is used purely as a data structure. **No force-directed layout,
ever.** None of graphology's layout packages are installed and none should be:
Audit is deliberately composed.

## Measured size — the rendering baseline

Real projection, all four Scopes, dev fixtures (`scripts/audit-graph-measure.ts`):

| Scope | nodes | edges | lane | checkpoint | finding | work | feature | requirement | decision | dependency | intelligence | passage | source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Platform | 43 | 35 | 8 | 11 | 1 | 16 | 4 | 0 | 0 | 0 | 0 | 0 | 1 |
| Design | 28 | 20 | 8 | 10 | 0 | 6 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| **JSA** | **67** | **85** | 8 | 16 | 8 | 14 | 4 | **2** | 1 | 1 | 1 | 5 | 5 |
| iTrack | 36 | 30 | 8 | 11 | 0 | 10 | 4 | 0 | 0 | 1 | 0 | 0 | 0 |

Progressive expansion:

| Scope | core | + execution | + evidence | + detail |
|---|---|---|---|---|
| Platform | 15n / 7e | 31n / 23e | 32n / 24e | 43n / 35e |
| Design | 12n / 4e | 18n / 10e | 18n / 10e | 28n / 20e |
| JSA | 26n / 29e | 40n / 44e | 51n / 69e | 67n / 85e |
| iTrack | 15n / 9e | 25n / 19e | 25n / 19e | 36n / 30e |

**Three of the four Scopes have no requirements, and that is the correct
answer** — only JSA's package carries a `requirements_of_record` source. An
adapter that found requirements everywhere would be guessing.

**The slice is no longer what is on screen.** Since the density pass, every
node is drawn at every zoom; the slice decides which nodes show their
*identity*. On JSA the resting field is 65 marks, 24 of them identified. See
"Progressive identity" in `docs/AUDIT-INSTRUMENT.md`, and
`scripts/audit-density-measure.ts` for the per-node inventory.

- **Largest single Scope:** JSA — 67 nodes / 85 edges expanded, 26 / 29 at the default slice.
- **All Scopes combined:** 174 nodes / 170 edges expanded.
- **Sigma revisit threshold** (from the prior research): 2,000 nodes in one view. Headroom: **30× on the largest Scope, 11× combined.**

The evidence does not overturn the earlier conclusion. **Stay on custom SVG.**

## Epistemic basis

Reconciled with Signal's own vocabulary rather than importing a new one — the
product already distinguishes these in `capacitySource: "…" | "inferred"`,
`Person.synthetic` ("stands in for a legacy figure nobody attested") and
`DecisionGate.provenance`.

| Basis | Means | Test |
|---|---|---|
| `attested` | A stored field **directly names** the other endpoint | Delete Signal and the relationship still exists in the data |
| `inferred` | Signal derived it while interpreting Audit state | True and useful, but ours — not the world's |

**No numeric confidence**, because nothing computes one. This is a two-valued
fact about where a relationship came from, not a score. A proof rejects any
edge carrying `confidence`, `score` or `weight`.

Measured across all Scopes **after Feature nodes landed**: **inferred 98
(60%) · attested 64 (40%)**. Before Features, `implements` resolved just 1
edge out of 46 work nodes and attested was 19% — closing that gap is what
made execution expandable.

## Node schema

`kind` · `label` · `slice` · `ref` (the canonical row it projects) · `lane`

| Kind | Projects | Slice |
|---|---|---|
| `reality` | the Scope's accepted Reality | core |
| `scope` | `Scope` | core |
| `requirement` | an `EvidenceItem` from a `requirements_of_record` source | core |
| `lane` | `TruthLane` | core |
| `finding` | `Finding` | core |
| `decision` | `Decision` | core |
| `decisionGate` | `DecisionGate` | core |
| `dependency` | upstream `Scope` via `dependsOnScopeIds` | core |
| `feature` | Linear ancestor issue via `parentIdentifier` | core |
| `work` | `LinearIssueSummary` | execution |
| `intelligence` | `ContextSnapshot` | evidence |
| `passage` | `EvidenceItem` within a snapshot | evidence |
| `source` | package manifest entry, or `Source` row | evidence |
| `checkpoint` | Signal's own computed assertion | detail |

**Node ids are namespaced by kind, and passages additionally by snapshot.**
`EvidenceItem.id` is documented as stable only *within* its package; two
snapshots may each contain `row-14`. Keying on the bare id would silently
merge two different passages into one node and misroute every citation through
it. Hence `passage:<snapshotId>:<evidenceId>`, asserted by proof. Package
manifest entries (`source:pkg:<sourceRef>`) and `Source` rows
(`source:row:<id>`) are likewise separate namespaces.

Deferred until the data supports them cleanly: `transcript`, `NotionPage`,
`FigmaArtifact`, `person`, `commitment`, `risk`, `opportunity`.
A transcript currently stays represented as `Finding → passage → source`; the
`source` node is the seam a first-class transcript node expands from later.

## Edge schema

Every edge carries `rel`, `basis`, and a `rule` id into `EDGE_RULES`, which
names the **exact canonical field** it was read from. That is what makes "every
edge is explainable" a checkable claim rather than a promise.

| Rule | Relation | Basis | Field |
|---|---|---|---|
| `lane-supports-reality` | supports | inferred | `TruthLane.supplied` |
| `checkpoint-attests-lane` | attests | inferred | `TruthLane.checkpoints` |
| `decision-attests-lane` | attests | inferred | `Decision.scopeId` + taxonomy |
| `dependency-attests-lane` | attests | inferred | `dependsOnScopeIds` + taxonomy |
| `work-attests-lane` | attests | inferred | `LinearIssueSummary` + taxonomy |
| `finding-concerns-lane` | concerns | inferred | `Finding.type` via `laneForFinding()` |
| `finding-missing-from-lane` | missing_from | inferred | `Finding.type === "missing_work"` |
| `finding-evidenced-by-passage` | evidenced_by | **attested** | `Finding.evidenceRefs` |
| `finding-evidenced-by-intelligence` | evidenced_by | **attested** | `Finding.contextSnapshotId` |
| `finding-evidenced-by-source` | evidenced_by | **attested** | `Finding.sourceId` |
| `passage-extracted-from-source` | extracted_from | **attested** | `EvidenceItem.sourceRef` |
| `finding-linked-to-work` | linked_to | **attested** | `Finding.matchedIssues` |
| `scope-depends-on-scope` | depends_on | **attested** | `Scope.dependsOnScopeIds` |
| `gate-blocks-scope` | blocks | **attested** | `DecisionGate.targetScopeId` |
| `gate-gates-decision` | blocks | **attested** | `DecisionGate.decisionId` |
| `decision-resolves-finding` | resolves | **attested** | `Decision.sourceFindingId` |
| `work-implements-feature` | implements | **attested** | `LinearIssueSummary.parentIdentifier` |
| `feature-attests-lane` | attests | inferred | `parentIdentifier` + taxonomy |
| `work-implements-work` | implements | **attested** | `LinearIssueSummary.parentIdentifier` (sub-issue) |
| `registration-supersedes-registration` | supersedes | **attested** | `SourceRegistration.supersededByRegistrationId` |
| `requirement-belongs-to-scope` | belongs_to | **attested** | `ContextSnapshot.scopeId` |
| `requirement-evidenced-by-passage` | evidenced_by | **attested** | `EvidenceItem.id` |
| `finding-concerns-requirement` | concerns | **attested** | `Finding.evidenceRefs` |

**`implemented_by` and `constrained_by` are deliberately absent.** See
"Requirements" below — the absence is the product feature, and a proof
asserts a requirement carries no relation beyond the three above.

**`contradicts` is deliberately absent.** A `contradiction` finding asserts two
sources disagree, but nothing stores *which two*. The relation is
unimplementable without a schema change, so it does not exist rather than
being faked.

**The absence of an edge is information.** An unsupplied lane gets no
`supports` edge — "nothing is feeding this" falls out of the graph's shape
rather than needing a flag anyone has to remember to read.

## Requirements

> **A REQUIREMENT IS WHAT THE PROJECT SAYS MUST BE TRUE.
> A SOURCE IS WHERE WE LEARNED IT.**

Three nodes, one underlying row, and they are never collapsed:

```
Requirement  "Conflict resolution for offline submissions must be
              handled before field pilot"            ← what the project means
      │ evidenced_by (attested)
Passage      notion-scope-row-14                     ← the row we read
      │ extracted_from (attested)
Source       "JSA delivery scope"                    ← where we read it
```

### The projection law

> An `EvidenceItem` becomes a Requirement **if and only if** its `sourceRef`
> resolves to a manifest entry whose `role` is `requirements_of_record`.

That role is a validated closed vocabulary — the API refuses any other value
(`app/api/source-registrations/route.ts`) — persisted inside the immutable
snapshot. So the projection is **structural**: no text matching, no keyword
rules, no page-name conventions, no model inference. `lib/audit/requirements.ts`
is the only place it is decided.

Proven against a synthetic package carrying *the same sentence* under three
different roles: exactly one requirement comes out.

### Role is not approval

`requirements_of_record` says **where requirements are recorded**. It does not
say the source is approved policy. JSA's is `status: candidate` with **no
`SourceRegistration` row behind it**, and the node carries `sourceRole`,
`sourceStatus` and `registrationId` so the inspector can say so rather than
implying an authority that does not exist.

The producer's own `data.status` ("Committed") and `data.section` ("Offline")
are read from the generic `data` escape hatch and reported **verbatim as
theirs**. They are producer convention, not schema, and are never mapped onto
a Signal state.

### The absent edge is the point

**`implemented_by` does not exist**, because nothing grounds it. The
temptation is right there in the fixture — a requirement whose section is
`Offline`, a Feature called `Offline Capture`, work items whose titles say
"offline" — and a proof asserts none of them touch. Resemblance is not a
relationship.

So the graph can show **a requirement with no route to execution** without
claiming anything about the world. Read it exactly:

| The graph says | It does not say |
|---|---|
| Signal has no stored field linking this requirement to a Feature or an issue | nobody implemented it |

That distinction is in the inspector copy, not just in this document.

`constrained_by` is absent for the same reason: no field connects a
requirement to a Decision.

### The future seam, deliberately inert

`EvidenceItem.externalRef` is documented as "the closest durable pointer back
to true origin (a Linear identifier, a Notion block id)". If a requirements
producer ever populates it with a **Linear identifier**, that is the attested
grounding an `implemented_by` edge needs — no Signal schema change, no new
store, one rule in `EDGE_RULES`.

It is populated on JSA today, with `demo-notion-jsa-scope#row-14` — a **Notion
block id**. That grounds provenance back into Notion; it is not an execution
reference, and nothing reads it as one.

### Not a second store

Nothing here is written, read back, or trusted as truth. Requirements are
rebuilt from the snapshot on every graph build, and a proof asserts the build
writes nothing. **The Signal Graph remains a derived projection.**

### Where they sit

Requirements have **no `lane`**, and that is deliberate: a cluster sector
means "this came from that source system", and a requirement is not one. They
take the structural layer between Reality and the first disagreement band —
the ring the Scope chip already occupies — with provenance edges running
*outward* to the passage and the source, which do live in Notion's sector.

Being inside `alignedR` is not a position on the disagreement axis. A
requirement is not "aligned"; it is simply not on that axis, for the same
reason Reality itself has no band.

The alternative was a ninth cluster sector, which would rotate every existing
cluster — and "Decisions is at the top" has to stay learnable.

## Slicing

Progressive detail is a property of the graph, not bookkeeping the renderer
maintains. Every node declares the shallowest slice it belongs to;
`sliceGraph(graph, slice)` returns a copy, never mutating the input.

`core` → `execution` → `evidence` → `detail`

## Evidence Solo

A **guarded traversal**, not a neighbourhood walk. An unrestricted BFS from a
finding reaches Reality in two hops (`finding → lane → reality`) and from there
the entire graph — "explaining" a finding with material that has nothing to do
with it. A proof asserts solo does **not** reach Reality.

Allowlist: `evidenced_by` · `extracted_from` · `concerns` · `missing_from` ·
`linked_to`. **Outbound only** — a finding cites a passage, never the reverse,
so the walk cannot turn round at shared evidence and come back down into an
unrelated finding. A proof asserts that too, against a fixture that genuinely
contains evidence shared by several findings.

## Export

`exportAuditGraph()` returns a stably sorted, serialisable form for proofs,
debugging and diffing two audits. **Not canonical state** — nothing in
production may read a hand-edited version back in. It is an observation of the
graph in the way a screenshot is an observation of the screen.

## Proven

`scripts/audit-graph-proof.ts` — 104 assertions across **all four Scopes**:
every node projects a real row; every edge cites a rule whose relation, basis
and endpoint kinds it matches; no dangling edges; no renderer state anywhere in
the layer; an unsupplied lane has no `supports` edge; provenance direction;
an uncited `Source` row produces no node (proven by inserting one); Evidence
Solo's allowlist and stopping behaviour; zero database writes; export
round-trip; determinism; slice monotonicity; passage namespacing.

`scripts/audit-graph-measure.ts` — the size baseline above.

Presence is proven separately, in the same file's `R` block: every node has a
layout seat, every non-core node is a drawn latent mark, every mark carries
the canonical ref of the row it projects, every mark is counted by exactly one
cluster badge, identity never decreases with zoom or with opening, expanding
changes no node's existence, no mark falls below the screen-space floor, and
every passage seats nearer its own source than any other.

Requirements get their own `Q` block: the projection law checked against the
raw package rather than its own output; evidence from every other role
producing nothing; the adapter run against a synthetic package with one
sentence under three roles; snapshot-scoped identity; `belongs_to` naming the
snapshot's own Scope; `evidenced_by` reaching the same row's passage;
`concerns` existing **exactly** where a finding cites that id in that snapshot,
checked in both directions; no relation beyond those three; a shared word
joining nothing; the provenance chain traversable end to end; Scopes without a
requirements source getting none; no requirement seated in a cluster; and zero
writes.

`scripts/audit-density-measure.ts` — the per-node visibility inventory, read
from the renderer's own `identityOf()` rather than a restatement of it.
