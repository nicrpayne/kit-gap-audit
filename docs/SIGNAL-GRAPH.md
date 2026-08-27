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
| Layout | where things sit | `lib/audit/layout.ts` |
| Rendering | what it looks like | `components/audit/*` |

`graph.ts` imports no layout, holds no coordinates, and knows nothing about
pixels. That is enforced by proof, not by convention — because **a graph that
knows about geometry is a graph a line-crossing can reach.**

`graphology` is used purely as a data structure. **No force-directed layout,
ever.** None of graphology's layout packages are installed and none should be:
Audit is deliberately composed.

## Measured size — the rendering baseline

Real projection, all four Scopes, dev fixtures (`scripts/audit-graph-measure.ts`):

| Scope | nodes | edges | lane | checkpoint | finding | work | decision | dependency | intelligence | passage | source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Platform | 39 | 32 | 8 | 11 | 1 | 16 | 0 | 0 | 0 | 0 | 1 |
| Design | 26 | 18 | 8 | 10 | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
| **JSA** | **61** | **73** | 8 | 16 | 8 | 14 | 1 | 1 | 1 | 5 | 5 |
| iTrack | 32 | 26 | 8 | 11 | 0 | 10 | 0 | 1 | 0 | 0 | 0 |

Progressive expansion:

| Scope | core | + execution | + evidence | + detail |
|---|---|---|---|---|
| Platform | 11n / 3e | 27n / 20e | 28n / 21e | 39n / 32e |
| Design | 10n / 2e | 16n / 8e | 16n / 8e | 26n / 18e |
| JSA | 20n / 19e | 34n / 34e | 45n / 57e | 61n / 73e |
| iTrack | 11n / 5e | 21n / 15e | 21n / 15e | 32n / 26e |

- **Largest single Scope:** JSA — 61 nodes / 73 edges expanded, 20 / 19 at the default slice.
- **All Scopes combined:** 158 nodes / 149 edges expanded, 52 / 29 at the default slice.
- **Sigma revisit threshold** (from the prior research): 2,000 nodes in one view. Headroom: **33× on the largest Scope, 13× combined.**

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

Measured across all Scopes: **inferred 121 (81%) · attested 28 (19%)**.

## Node schema

`kind` · `label` · `slice` · `ref` (the canonical row it projects) · `lane`

| Kind | Projects | Slice |
|---|---|---|
| `reality` | the Scope's accepted Reality | core |
| `scope` | `Scope` | core |
| `lane` | `TruthLane` | core |
| `finding` | `Finding` | core |
| `decision` | `Decision` | core |
| `decisionGate` | `DecisionGate` | core |
| `dependency` | upstream `Scope` via `dependsOnScopeIds` | core |
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
`FigmaArtifact`, `person`, `requirement`, `commitment`, `risk`, `opportunity`.
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
| `work-implements-work` | implements | **attested** | `LinearIssueSummary.parentIdentifier` |
| `registration-supersedes-registration` | supersedes | **attested** | `SourceRegistration.supersededByRegistrationId` |

**`contradicts` is deliberately absent.** A `contradiction` finding asserts two
sources disagree, but nothing stores *which two*. The relation is
unimplementable without a schema change, so it does not exist rather than
being faked.

**The absence of an edge is information.** An unsupplied lane gets no
`supports` edge — "nothing is feeding this" falls out of the graph's shape
rather than needing a flag anyone has to remember to read.

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

`scripts/audit-graph-proof.ts` — 43 assertions across **all four Scopes**:
every node projects a real row; every edge cites a rule whose relation, basis
and endpoint kinds it matches; no dangling edges; no renderer state anywhere in
the layer; an unsupplied lane has no `supports` edge; provenance direction;
an uncited `Source` row produces no node (proven by inserting one); Evidence
Solo's allowlist and stopping behaviour; zero database writes; export
round-trip; determinism; slice monotonicity; passage namespacing.

`scripts/audit-graph-measure.ts` — the size baseline above.

Renderer behaviour is unchanged this tranche: `scripts/audit-model-proof.ts`
(52) and `scripts/audit-proof.mjs` (34) both still pass in full, and no file
under `components/audit/` was modified.
