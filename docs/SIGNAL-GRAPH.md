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

| Scope | nodes | edges | lane | checkpoint | finding | work | feature | requirement | person | decision | dependency | intelligence | passage | source artifacts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Platform | 43 | 35 | 8 | 11 | 1 | 16 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Design | 29 | 22 | 8 | 10 | 0 | 6 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| **JSA** | **72** | **93** | 8 | 16 | 8 | 14 | 4 | 2 | 4 | 1 | 1 | 1 | 5 | **6** |
| iTrack | 36 | 30 | 8 | 11 | 0 | 10 | 4 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

JSA's six source artifacts: **1 transcript · 2 Notion pages · 1 Figma
artifact · 2 generic sources**. One of the Notion pages supplied nothing —
see below.

Progressive expansion:

| Scope | core | + execution | + evidence | + detail |
|---|---|---|---|---|
| Platform | 15n / 7e | 31n / 23e | 32n / 24e | 43n / 35e |
| Design | 13n / 6e | 19n / 12e | 19n / 12e | 29n / 22e |
| JSA | 30n / 37e | 44n / 52e | 56n / 77e | 72n / 93e |
| iTrack | 15n / 9e | 25n / 19e | 25n / 19e | 36n / 30e |

**Most Scopes have no requirements and no people, and that is the correct
answer.** Only JSA's package carries a `requirements_of_record` source; only
JSA and Design have `Allocation` rows. An adapter that found either
everywhere would be guessing.

**The slice is no longer what is on screen.** Since the density pass, every
node is drawn at every zoom; the slice decides which nodes show their
*identity*. On JSA the resting field is 65 marks, 24 of them identified. See
"Progressive identity" in `docs/AUDIT-INSTRUMENT.md`, and
`scripts/audit-density-measure.ts` for the per-node inventory.

- **Largest single Scope:** JSA — 72 nodes / 93 edges expanded, 30 / 37 at the default slice.
- **All Scopes combined:** 180 nodes / 180 edges expanded.
- **Sigma revisit threshold** (from the prior research): 2,000 nodes in one view. Headroom: **28× on the largest Scope, 11× combined.**

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
| `external` | **A third party asserted it and Signal has not checked it** | Delete Signal and the claim still exists — and so does the fact that nothing in Signal's own record corroborates it |

`external` exists because the alternative was worse in exactly the way the
Hermes integration is about. `attested` renders solid and full-strength, the
same as `Finding.evidenceRefs`; filing an external inference under it would
make a knowledge compiler's guess look every bit as grounded as a Signal
citation — the disclaimer-instead-of-structure failure the whole integration
exists to avoid. So it is a third value in the semantic layer, where a proof
can check it, and its own stroke on the field.

**No numeric confidence**, because nothing computes one. This is a
three-valued categorical fact about where a relationship came from, not a
score. A proof rejects any edge carrying `confidence`, `score` or `weight`.

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
| `person` | `Person`, via an `Allocation` to this Scope | core |
| `transcript` | a source whose persisted type says transcript | evidence |
| `notion_page` | a source whose persisted type says notion | evidence |
| `figma_artifact` | a source whose persisted type says figma | evidence |
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

Deferred until the data supports them cleanly: `commitment`, `risk`,
`opportunity`, and the rest of the Hermes intelligence objects.
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
| `person-allocated-to-scope` | allocated_to | **attested** | `Allocation.personId` + `.scopeId` |
| `person-attests-lane` | attests | inferred | `Allocation.scopeId` + taxonomy |

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

## Capacity

> **CAPACITY IS EMBODIED.** A Scope's capacity is the people allocated to it
> and nothing else — `lib/capacity/workforce.ts` states that as the product
> law, and the graph now shows it.

### Audit reads capacity, it does not compute it

Every figure on a Person node — `fraction`, `scopeCount`, `switchFactor`,
`effectiveFte` — comes out of `resolveCapacity` in `lib/capacity/resolve.ts`
unchanged. **There is no capacity arithmetic in Audit.** A proof compares
every attribute against the resolver's own output, so the number beside a
face and the number the forecast receives cannot diverge.

Which people appear is the resolver's rule too, not one invented here: its
contributor set is active people with a positive `Allocation` to this Scope.
Someone inactive, unallocated, or allocated at zero contributes no capacity,
and a node for them would be a mark standing for nothing.

### The switch factor needs the whole portfolio

The context-switch penalty is keyed on how many Scopes a person works across
**anywhere**, so the resolver is handed every `Allocation` row. Sam Ortiz is
JSA 0.6 and Design 0.4; reading only JSA's rows would report Sam as undivided
and overstate what JSA gets. Proven: the same resolver, given JSA's rows
alone, says `scopeCount: 1`.

At the live 12% setting that is `×0.88`, so JSA's take is
`0.6 × 1.0 × 0.88 = 0.528 FTE`. **A capacity fact, not an evaluation** —
nothing here says overloaded, at risk, or underperforming.

### The graph shows this Scope; the inspector explains the rest

Sam's Design allocation is *why* the switch factor is 0.88, so hiding it
would leave an uncheckable number. But drawing a Design node inside a JSA
audit would quietly turn a project instrument into a portfolio one. The other
commitments therefore ride on the Person node as an attribute the inspector
prints, and **never as graph topology**. A proof asserts JSA's graph contains
exactly one Scope node while the split person still lists two commitments.

### Person → work is forbidden, and proven forbidden

`LinearIssueSummary.assignee` is a display-name string from another system.
`Person.name` is documented in the schema as a label — *"'Person 07' and
'Alice' are the same unit of capacity; renaming one must not move a forecast
by a single day."*

**In the JSA fixture all four names match a Linear assignee exactly.** That
is a coincidence of the fixture, not a join key: a name-join would look
perfect here and mis-attribute the moment a unit is called "Person 07". Two
proofs guard it — one against the real graph, one against a forced fixture
where *every* ticket is assigned to a named Person. Both assert zero edges.

`person → allocated_to → Feature` is absent for a plainer reason:
`Allocation` has no Feature column, and splitting a Scope allocation across
Features heuristically would be invention.

### The identity seam

Connecting a person to their work needs **an explicit, durable mapping that
does not exist**. Plausible futures: a persisted Linear user id on `Person`,
an external-identity mapping table, or an authoritative HRIS identity. None
is implemented, and none should be inferred. Until one exists, Signal can say
who is carrying a project and how much — never what they are carrying.

### Availability is not modelled

There is no Signal availability model, so no availability node or edge
exists, and a proof rejects any `availability`, `role` or `owner` attribute
appearing on a Person. Hermes may one day supply availability *evidence*;
**an AvailabilityObservation is not accepted capacity Reality** and must not
silently become it.

### Where they sit

People populate the existing **Capacity sector** — the thinnest region on the
field before this, one puck and one checkpoint. They are `core`, like
decisions and dependencies, because there are four of them rather than forty
and a cluster that shows nothing until you open it is a cluster you never
open.

**Size is not an encoding.** Every person is drawn the same. Allocation is a
number, so it is shown as one, in the inspector where it can carry its units;
sizing people by FTE made the sector read as importance rather than as a
team. A synthetic unit takes the grey the field already uses for "nothing is
supplying this", because a synthetic person is not a verified human.

## Source artifacts

> **A SOURCE ARTIFACT IS NOT A SEMANTIC ENTITY**, and "source" is a role
> rather than a thing.

A meeting, a written page and a design frame answer completely different
questions — what was said, what was written down, what was drawn. Drawing all
three as one document icon makes the reader open each to find out which it is.

```
Requirement   "Offline capture must work before field pilot"
      │ evidenced_by
Passage       notion-scope-row-14
      │ extracted_from
Notion page   "JSA delivery scope"
```

### The kind comes from a type field, never a title

`sourceKindFor()` reads the manifest's `sourceType` or `Source.kind` — a
documented enum, `"transcript" | "notes" | "estimates"`. A source called
*"Delivery sync · 21 Aug"* is a transcript because its manifest says
`sourceType: "transcript"`, **not because it sounds like a meeting**. Where
the data supports only "a source", it stays `source`; JSA's two `notes` rows
do.

Proven: seven type values classify correctly, and the titles that would fool
a name-reader classify as generic when passed as a type.

| Shape | Kind | Says |
|---|---|---|
| Speech bubble | `transcript` | something someone said |
| Ruled page | `notion_page` | something written down |
| Frame with a handle | `figma_artifact` | something drawn |
| Document | `source` | a source whose type we cannot pin down |

### Declared, but unread

`Scope.notionPageIds` and `Scope.figmaRefs` name artifacts Signal is
**configured** to read — the Truth Map already reads them for its Notion and
Figma checkpoints. When one appears nowhere in the accepted package's
evidence, that gap is worth a mark: *the project points at a page and the
audit is working from nothing out of it.* It takes the grey the field already
uses for an unsupplied lane.

Only the **uncovered** ones. A declared page that did supply evidence already
has a manifest node, and a second would be the same artifact drawn twice.
Coverage is matched on the identifier — a Notion page id appears in evidence
as `<pageId>#<blockId>` — never on the title.

On JSA that is 3 declared, 1 unread: `demo-notion-offline-spec`.

### One artifact, opened on its own

`expanded` holds cluster ids; it now also holds **source-artifact node ids**.
Same set, same toggle, same latent-to-formed promotion at the same seat — it
buys what a cluster toggle cannot: open *this transcript's* two passages
without opening every passage in the evidence sector.

Additive, so nothing regresses: a passage still opens when its cluster does.
When the cluster is already open the control is **not offered** — a button
that would change nothing is worse than no button, and the panel says why
instead.

Proven: expanding one artifact opens exactly its own passages, and Evidence
Solo reaches an artifact **without fanning into its siblings** — outbound-only
traversal means you cannot turn round at a shared source and walk down into
someone else's evidence.

### What a source artifact may carry

Provenance relations and nothing else: `extracted_from`, `evidenced_by`,
`supersedes`. A proof asserts it. A Figma frame is design evidence and
**implements nothing**; a Notion page grounded a Requirement without being
one.

## External structured intelligence

> **Hermes intelligence is not Signal Reality.** A Hermes `Decision` means
> *the knowledge compiler believes the evidence supports that a decision
> occurred*. A Signal `Decision` is accepted delivery Reality with forecast
> consequences. Different claims about different things. They never share a
> node, a shape, or an id space.

An accepted `ContextSnapshot` may carry three additive transport fields —
`intelligenceObjects`, `intelligenceRelations`, `intelligenceMeta` (see
`lib/context/package.ts`). `lib/audit/intelligence.ts` projects them; nothing
about them is stored anywhere else.

### The critical first fix

`validateProjectContextPackage` rebuilt the accepted package from named
fields, so anything it did not recognise was **silently dropped**. That is why
intelligence could not arrive at all, and it is the first thing this work
fixed.

The fix is **preservation-first**, not a wider whitelist. Each new validator
checks the fields Signal genuinely depends on and carries everything else
through on `extra`. Re-imposing a whitelist one level down — inside an
intelligence object — would have reintroduced the identical bug against a
contract Signal does not own: the producer adds a field, the field vanishes,
and nothing fails.

Structural problems still reject the whole package:

| Rule | Why |
|---|---|
| `trust` must equal `external_intelligence` | The boundary, checked at the boundary. A payload claiming its objects are accepted Reality is refused, not downgraded |
| `isCurrent` must be a boolean | Currentness is a transported fact; defaulting a missing flag would silently promote history to head |
| object ids unique within a package | Same law the evidence rows already hold to |
| every `evidenceRefs` entry resolves | No dangling pointer survives into an immutable snapshot |
| an endpoint claiming `fromInPackage`/`toInPackage` must be there | A relation may legitimately reach outside the package; lying about it is a producer bug |
| relations without objects | Describe nothing |

The three fields are assigned **only when sent**, so every already-accepted
snapshot serialises byte-identically and hashes the same.

### Persistence: not necessary, and proven so

**No new Prisma model, no new column, no new index.** The intelligence rides
inside `ContextSnapshot.package` — the Json column that already holds the
producer's package verbatim — and the graph read already loads those snapshots
for Requirements. `scripts/audit-intelligence-ingest-proof.ts` counts
`information_schema` tables and columns either side of a real HTTP ingest and
asserts both are unchanged.

### The trust boundary, held in five places

Not in a caption:

| | |
|---|---|
| **its own node kind** | `intel`, carrying an `intelligenceType` attribute — so an external Decision can never collide with a Signal one |
| **its own edge basis** | `external`, drawn with its own stroke, so an unchecked claim never renders with the weight of a Signal citation |
| **its own relations** | `intel_relation` and `cites`, keeping external `supersedes` and `supports` out of the machinery built for Signal's own vocabulary |
| **its own band** | seated outside `edgeR`, the ring that bounds Signal's own record |
| **no crossing rule** | there is **no construction path** from an `intel` node to any Signal entity |

That last row is the one that matters. `EDGE_RULES` contains exactly two rules
touching `intel` — `intel-cites-passage` and `intel-relates-intel` — so a
package full of external Decisions produces **zero** Signal `Decision` nodes
and zero `Decision` rows. A proof enumerates the registry and asserts no rule
can join the two worlds; a second builds a fixture where external statements
are **character-identical** to Signal Decision titles and upstream Scope names
and asserts zero joining edges.

### One kind, not nine

Nine intelligence types, one node kind. The alternative would have meant nine
entries in five exhaustive `Record<NodeKind, …>` tables, nine glyphs on a
field that already carries thirteen, and widening every proof that enumerates
kinds — which had already been paid for three times in earlier tranches. The
type is legible from the **sector** the object sits in, from its label, and
from the inspector. Shape says what kind of thing this is *on Signal's field*,
and every one of them is the same kind of thing: an external claim.

### Where an object sits

By **what it means**, not where it came from — the same law Requirements
established against Notion. A Hermes Decision is about decisions even though
its evidence came from a transcript; its provenance runs outward to the
passage and the artifact, which do live in their source sector.

| Type | Sector |
|---|---|
| `Decision` | `decisions` |
| `Dependency` | `dependencies` |
| `AvailabilityObservation` | `capacity` |
| everything else | `hermes` |

**No ninth sector.** Adding one rotates every existing cluster, and "Decisions
is at the top" has to stay learnable.

Radially it sits **outside `edgeR`**, in a band of at most three rows. That
extends the gradient the field already runs on — outward is further from
accepted Reality — rather than adding a new meaning to radius. The band is
bounded on purpose: the corpus is several times the size of Signal's own
record for the same project, and a band that grew without limit would make the
field say *this project is mostly external intelligence*, which is false about
Signal's record.

Because the field can now be larger than Signal's own record, **Fit derives
from the layout's actual extent** rather than a constant (`layoutExtent()` +
`fitCamera(extent)`). A Scope with no external intelligence fits at exactly
the zoom it always has.

### Scope, and currentness

**Scope is the producer's claim, not Signal's guess.** An object is admitted
only when its own `scope[]` names the Scope being audited. An object the
producer could not attribute confidently stays out rather than being matched
in by text.

**`isCurrent` is transported and never derived from `status`.** The real
corpus contains the counterexample and the fixture reproduces it: objects that
are `open` **and** superseded. Anything reading status to decide currentness
draws those as live. A proof pins that exact pair.

**Relations are never re-normalised.** The bridge has already reversed the
passive forms — `resolved_by` and `superseded_by` arrive with their endpoints
swapped into the active relation. Inverting again would silently point every
longitudinal chain backwards, and it would look plausible while doing it. The
producer's own name rides on the edge as `intelRel`, and `declared` carries
the raw form for the record.

### Density: the chain, not the corpus

Measured on the JSA-scale payload (`scripts/lib/intel-fixture.ts`): of 87
object-to-object relations, **6 are temporal, 9 semantic and 72 contextual**.
Drawing the contextual ones at rest would put 72 meaningless strokes across
the outer band and bury the 15 that carry a chain.

| Class | Relations | Drawn |
|---|---|---|
| temporal | `supersedes` `refines` `resolves` `reopens` | at rest, once both endpoints are open |
| semantic | `depends_on` `caused_by` `contradicts` `supports` `derived_from` | at rest, once both endpoints are open |
| contextual | `related_to`, and anything unrecognised | only when an endpoint is being explained |
| `cites` | object → passage provenance | only when an endpoint is being explained |

An unrecognised relation name falls back to `contextual` — the quietest
bucket. A new relation appearing at full volume at rest is how a hairball
starts.

Superseded objects keep a real seat, because the temporal chain that reaches
them has to land somewhere, and stay **latent until something reaches them**:
selected, hovered, in the neighbourhood, lit by a trace, or matched by a
search.

Measured on the field, at 466 nodes and 618 relationships:

| | edges drawn |
|---|---|
| at rest | 72 — **none of them external** |
| Hermes cluster open | 78, 2 external |
| every cluster open | 310 of the 589 that exist; **15** external |

### Cost at 466 nodes

Warm, production build, 1600×1000:

| | |
|---|---|
| pan / zoom frames | median **16.7ms**, p95 33.4ms, 0–3 frames over 50ms of ~135 |
| select an external object | median **50ms**, worst 75ms |
| search all 466 nodes | median **58ms**, worst 118ms |
| open the entire field | median **155ms**, worst 210ms |

**Stay on custom SVG.** 466 nodes is 4.3× the previous largest Scope and still
23× inside the Sigma revisit threshold, with 60fps camera work and every
interaction inside its budget. Nothing here is evidence that the renderer is
approaching a limit.

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
`linked_to` · `cites`. **Outbound only** — a finding cites a passage, never the reverse,
so the walk cannot turn round at shared evidence and come back down into an
unrelated finding. A proof asserts that too, against a fixture that genuinely
contains evidence shared by several findings.

The same traversal answers the same question one boundary over for an external
object — *why does the **producer** say this* — reaching the passages it
claims ground it and the artifacts those were read from. `intel_relation` is
**deliberately absent** from the allowlist: the corpus is mostly `related_to`,
and admitting it would let a walk hop object to object across a hundred
contextual links and light most of the outer band — the unrestricted BFS this
traversal exists to refuse, rebuilt out of somebody else's material.

## Export

`exportAuditGraph()` returns a stably sorted, serialisable form for proofs,
debugging and diffing two audits. **Not canonical state** — nothing in
production may read a hand-edited version back in. It is an observation of the
graph in the way a screenshot is an observation of the screen.

## Proven

`scripts/audit-graph-proof.ts` — 158 assertions across **all four Scopes**:
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

Capacity gets a `W` block: every Person node projecting a real row keyed on
its id; a rename changing the label and nothing else; the people on the field
being exactly the resolver's contributors; every `allocated_to` edge being one
`Allocation` row with its fraction; `scopeCount` computed globally; every
capacity figure equalling `lib/capacity`'s own output; synthetic preserved;
**four exact name matches joining nothing**; a forced fixture where every
ticket is assigned to a named Person still joining nothing; no relation beyond
`allocated_to` and membership; no invented availability, role or ownership;
unstaffed Scopes showing nobody; global context never becoming topology; and
zero writes.

Source artifacts get an `X` block: every kind tracing to a persisted type
field; a title deciding nothing; a Notion source becoming a page while the
Requirement it grounded stays a separate node reached only through its
passage; a Figma artifact implementing nothing; `extracted_from` still running
passage → artifact and never the reverse; every passage attached to the
artifact its own `sourceRef` names; expansion exposing exactly one artifact's
passages; a declared artifact that supplied evidence not being drawn twice;
snapshot-scoped passages; Evidence Solo reaching the artifact without fanning
into siblings; sourceless Scopes inventing nothing; provenance-only relations;
and zero writes.

External structured intelligence gets a `Z` block, run against the JSA-scale
payload: the validator carrying intelligence through instead of dropping it; a
package without it gaining no intelligence keys; an unmodelled producer field
surviving on `extra`; a package claiming its intelligence is Signal Reality
being rejected; a missing `isCurrent` rejected rather than defaulted; a
dangling citation rejected; admission by the producer's own `scope[]` and
nothing else; currentness transported and never derived from status, pinned
against objects that are open **and** superseded; relations keeping the
direction they arrived in; an unknown relation falling back to contextual;
**external Decisions creating zero Signal entities**; external basis and
external material being the same set in both directions; **no edge rule able
to join the two worlds**; statements character-identical to Signal Decision
titles joining nothing; a cited passage's text coming from Signal's evidence
rather than the claim; a stale citation producing no phantom node; the same
object id in two snapshots being two nodes; tracing reaching evidence without
walking the corpus; seating by meaning outside the record's edge; Fit widening
for the band and unchanged without one; superseded objects seated but latent;
the resting field drawing the chain rather than the corpus; and zero writes.

`scripts/audit-intelligence-ingest-proof.ts` — the receiving end of the
bridge, over HTTP: `POST /api/refresh` accepting a package carrying
intelligence, it surviving validation and persistence intact, **no new table
and no new column**, the graph read projecting it with no further plumbing, a
byte-identical retry creating no second snapshot, and a package lying about
trust refused with a 400 and stored nowhere.

`scripts/audit-intelligence-shoot.mjs` — the browser pass at 466 nodes, which
owns the seeded fixture state and puts it back. Requires
`npx tsx scripts/seed-intel-fixture.ts` first.

`scripts/audit-density-measure.ts` — the per-node visibility inventory, read
from the renderer's own `identityOf()` rather than a restatement of it.
