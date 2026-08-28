# The Audit instrument

Companion to `docs/PRODUCT-VISION.md` and `docs/DESIGN-NORTH-STAR.md`. This
document says what the Project Truth Map *asserts*, what it deliberately
refuses to assert, and which parts of the concept images did not survive
contact with the data model.

Audit answers one question:

> **Where does accepted delivery Reality disagree with the evidence and
> execution around it?**

```
THE LINES ARE PROJECT SIGNALS.
THE CENTRE IS ACCEPTED REALITY.
AUDIT REVEALS WHERE THOSE SIGNALS DISAGREE.
```

## Audit is graph-first

`/audit` began as a reading surface (a paginated list of audit runs), became
an instrument (the Project Truth Map, a radial lane diagram), and is now
**graph-first**: the Signal Graph owns the viewport, the inspector is a
contextual panel beside it, and the review console exists only while a
Finding is selected.

The Truth Map is retired. `components/audit/ProjectTruthMap.tsx` and
`lib/audit/layout.ts` were deleted rather than left as dead code; their
layout proofs moved to `scripts/audit-graph-proof.ts`, because the subject
moved rather than disappearing.

The run list still lives at `/audit/history`, still as a reading surface.
`/audit/<sourceId>` is untouched.

## The composition

Two independent axes, each carrying a different real fact:

| Axis | Means |
|---|---|
| **Angle** | **Category.** Each cluster owns a sector. Membership is expressed by *where a node sits*. |
| **Radius** | **Disagreement.** Reality is the centre; a finding sits at the band its severity names. |

Combining them gives the one idea a general graph tool does not have:

> **A finding is drawn in the gap between Reality and its own cluster.**

The Notion sector's findings sit between the Notion puck and the core,
literally occupying the space between what that source claims and what
Reality accepts. Proven: `P8 findings sit between Reality and their
cluster's puck`.

Outward, the field reads: Reality · the three disagreement bands · the
cluster pucks · the project structure hanging off them.

## Membership is position, never a line

**The single decision that stops the hairball.** 74 of the graph's edges say
"this belongs to that cluster". The layout already says that by seating the
node in the cluster's sector, so **`attests` edges are never rendered** —
asserted by proof, against a graph that provably still contains them.

At rest on JSA that is **17 drawn edges out of 77** — with all 65 nodes on
screen. Density of nodes has never required density of edges.

## Progressive identity, not progressive existence

> **Zoom reveals identity. It does not create the world.**

The field used to draw only what was *open*. Measured
(`scripts/audit-density-measure.ts`): **41 of JSA's 65 nodes were not on
screen at all**, and zooming in changed that number by zero. Expanding a
cluster mounted fourteen things that had never been there — which reads as
"a bunch of new data just appeared", not as "oh, that's what all those dots
were".

Presence and identity are now separate channels. **Every real node is drawn,
at its real seat, at every zoom.** What changes is how much of itself it
shows:

| Degree | What it is | Has |
|---|---|---|
| **Latent** | a real node whose cluster is collapsed | a mark, in its own colour, at its own seat |
| **Formed** | its cluster is open | its real shape and size, a hit target, its edges |
| **Named** | formed, and the zoom level labels its kind | its label |

Expanding a cluster **promotes marks in place** — a 260ms cross-fade at a
fixed seat, nothing mounted, nothing moved. Proven both as arithmetic (`R7`)
and against the live DOM (`L1`, `L2`: the sampled mark's `cx`/`cy` are
byte-identical before and after).

| Zoom | Latent marks | Labels appear for |
|---|---|---|
| **Far** (<1.05×) | uniform dust, floored at 2.4 screen px | Reality, cluster pucks |
| **Medium** (<2.1×) | differentiated by real size | + dependencies, decisions, features, project, intelligence, work, passages, sources |
| **Close** (≥2.1×) | distinct objects | + findings, gates, checkpoints |

Work, passages and sources label at **medium** because expanding a cluster
flies the camera to exactly that zoom. They are only ever formed when their
cluster has been opened, so this cannot crowd the resting field — it means
that if you went and opened something, you can read it.

Thresholds are explicit steps, not continuous text scaling — scaling would
produce unreadably small labels at far zoom rather than *no* labels, which is
worse. Zoom is capped at 4.5×. Each threshold carries a 9% deadband so a
camera resting on one does not flip between tiers; see **Motion** below.

Expanding flies the camera to what it revealed. Search and Evidence Solo both
auto-expand whatever they need to show — a result you cannot see reads as a
bug.

### Density has to come from data

Every mark on the field is **one row in the canonical model**. There are no
aggregate blobs, no density particles, no decorative orbits, and no duplicate
marks added for texture. The only aggregate the instrument draws is a
collapsed cluster's `+N`, and that count **equals the latent marks drawn in
that sector** — proven in the graph (`R4`) and against the rendered DOM
(`S4`).

That count used to be the number of `attests` edges into the lane, which both
over-counted (findings and features are drawn at full size already) and
under-counted (no source or passage attests to anything). On JSA the two
disagree in **7 of 8 clusters**, so the fix is a real correction rather than a
rename — asserted by `R4b`.

A latent mark is population, not a control: it is out of the accessibility
tree and out of the tab order, because it has no name to announce and nothing
to do. The keyboard route into a collapsed cluster is its own toggle, which
says how many nodes are in there.

The control that keeps this honest is the sparse Scope. Design has 28 nodes,
and it still looks like 28 nodes: `+1` on almost every cluster, mass only in
Linear. **The instrument does not make a thin project look rich.**

## Requirements

**What the project says must be true**, distinct from where we learned it. An
`EvidenceItem` becomes a Requirement if and only if its source's manifest role
is `requirements_of_record` — structural, never textual. Full law, the
role-vs-approval caveat, the deliberately absent `implemented_by`, and the
`externalRef` seam: **docs/SIGNAL-GRAPH.md → Requirements**.

On the field they are mint tablets in the structural layer beside the Scope
chip — inside the disagreement bands, because a requirement is not a position
on that axis — with provenance running outward to Notion. JSA has two; the
other three Scopes have none, which is the correct answer for a package with
no requirements source.

The inspector says **"No grounded implementation link"**, never "not
implemented", and explains the difference on the card.

## Source artifacts

**Where we learned it**, typed from a persisted type field and never from a
title. A transcript, a Notion page and a Figma frame are three shapes rather
than one document icon, because they answer three different questions. Full
law, the declared-but-unread signal and the per-artifact expansion:
**docs/SIGNAL-GRAPH.md → Source artifacts**.

JSA holds six: 1 transcript, 2 Notion pages (one of which supplied nothing),
1 Figma artifact, 2 generic notes. Selecting one offers to **open its own
passages on the graph** — the transcript's two, not the sector's five.

## Capacity

**Who is carrying this project**, read from `lib/capacity/resolve.ts` rather
than recomputed — every figure on a Person node is the resolver's own output.
Full law, the global-allocation reasoning, the forbidden `person → work` join
and the identity seam: **docs/SIGNAL-GRAPH.md → Capacity**.

Four figures populate the Capacity sector on JSA, one on Design, none on
Platform or iTrack — which have no `Allocation` rows. Equal-sized on purpose;
allocation is a number and is shown as one. The inspector gives base FTE,
share of this project, project count, the context-switch factor with the
setting it came from, effective FTE, and the person's other commitments as
**context, never as graph topology**.

It also says, on every person: *"Signal has no grounded link from a person to
a Feature or a ticket, so it cannot say what this person is working on."*

## Features close the execution gap

The graph foundation measured 46 work nodes whose parents resolved to
nothing: Linear has no first-class Feature entity, so `implements` produced
exactly **1 edge**. Adding Feature nodes (any `parentIdentifier` that is not
itself a fetched work item) took that to **37**, and raised attested edges
from 19% to 40% of the graph.

The hierarchy is now `Scope → Feature → work item`, which is what lets the
execution cluster expand without becoming a cloud of tickets on one puck.

## Node visual language

**Shape says what kind. Colour says what state.** Keeping the two channels
apart is what stops the field becoming a rainbow, and it is the accessibility
floor: kind survives without colour, and every node's accessible name carries
kind and state in words.

| Shape | Kinds |
|---|---|
| Layered core | Reality |
| Speech bubble | transcript — something someone said |
| Ruled page | notion_page — something written down |
| Frame with a handle | figma_artifact — something drawn |
| Figure | person — a head over a shoulder arc, the one literal glyph on the field |
| Tablet | requirement — upright and ruled across, a *statement*; tellable at a glance from the source it came from |
| Disc | cluster puck, intelligence package |
| Pin | finding — the only kind with a direction, because it is the only kind that is an accusation |
| Hexagon | dependency |
| Diamond | decision, gate |
| Chip | project, feature |
| Document | source |
| Dot | work item, passage, checkpoint |

Edges: **attested solid, inferred dashed**, both faint at rest. The epistemic
basis is visible before anything is clicked.

## Findings

The Finding model has exactly four types (`missing_work`, `decision`,
`risk`, `contradiction`) and three severities (`high`, `medium`, `low`). **No
category was invented to fill a slot on the map.** The richer names in the
concept images are *readings* of those columns:

| Shown | Derived from |
|---|---|
| Blocking dependency | `type: risk` + `blocking` |
| Missing work blocks delivery | `type: missing_work` + `blocking` |
| Unresolved decision | `type: decision` |
| Contradiction | `type: contradiction` |
| **Critical** | `severity === "high" && blocking` — derived in exactly one place, `tierFor()` |

`critical` is not a stored value, and a proof asserts no row carries it.

**Human judgement is a property, not a state.** A finding is drawn violet
when `type === "decision"`, or when it blocks and names no owner. Whether a
person has to settle something is orthogonal to how badly the signal
disagrees, so the four states stay four.

A **handled** finding (ticketed, resolved, dismissed) is still real and still
drawn — collapsed to the aligned band as a settled mark, because it has
stopped being a live disagreement. It no longer drives its lane's state.

## Concept-image values rejected as unavailable

Following the precedent in `docs/CONTROL-ROOM-TRUTH-AUDIT.md`:

| In the image | Why rejected |
|---|---|
| **`CONFIDENCE 92%` / `84%`** | The `Finding` model has no confidence column and nothing in this app computes one. The number would be unfalsifiable and unactionable. **Replaced with `Grounding`** — "Cited · 2 passages", "Quoted · source located", "Uncited" — which is a fact about the citation, checkable against the snapshot. |
| **`Observed in Reality: No`** | There is no observation ledger to read this from. Replaced with `Concerns` (which lane) and `Execution` (which Linear issues the audit actually matched). |
| **`ACCEPT INTO REALITY`** | A Finding is not Reality, and there is nothing in the schema this could write to. Every primary action names the row it creates instead — see below. |
| **`Owner confirmed: No`** | No confirmation record exists. `Owner` states the stored `Finding.owner` or "Not recorded". |
| **Numeric drift/impact scores** | No such model. Radius is categorical by band. |
| **`Stale evidence` as a Finding type** | Not a `Finding.type`. Staleness IS modelled — as the Evidence lane's `evidence fresh` checkpoint, measured against a stated 21-day horizon — but it is a lane state, not a fabricated finding row. |

## Human acceptance

There is no generic "accept" control. Each primary action names its own
consequence and, next to the button, **what it will not do**:

| Finding | Primary action | Writes | Deliberately does not |
|---|---|---|---|
| `decision` | Open the decision | `Decision` (open, ungated) + `DecisionEvidence` carrying the quote; the Finding is resolved | Declare a gate. **An open decision has no forecast effect.** |
| `missing_work` | Add the missing work | Composes a Linear payload and returns it as a preview | File anything. The route fails safe: an unconfirmed POST returns the preview. |
| `risk` / `contradiction` | Record how this resolves | `Finding.status = resolved` + resolution text | Touch any Scope, Decision or ticket. |

Secondary everywhere: **Correct / edit** (not implemented — see below),
**Need more evidence** (session only, and the console says so), **Reject
finding** (dismiss, reason required).

`POST /api/findings/[id]/open-decision` follows the shape
`scripts/migrate-decisions.ts` already established, so the two promotion
paths cannot drift. It creates the Decision **open and ungated**, and
refuses a finding of any other type.

## Candidate Reality (A/B)

`B · Preview` is a **statement, not a simulation**, and it never persists.
The Reality core enters candidate treatment (violet, "NOT SAVED"), and the
consequence line says what would actually follow — checked against
`lib/forecast/build.ts` rather than assumed:

- Opening a decision has **no delivery consequence**: `buildForecastInputs`
  filters `type !== "decision"`, so an open decision is not a work item.
- Filing missing work **hands the same work to a real ticket**: an open
  non-decision finding is *already* a forecast work item carrying a
  placeholder estimate, so the date moves only insofar as the ticket's own
  estimate differs.
- Resolving a risk or contradiction **removes** that placeholder, which can
  pull the date in.

No protected forecast module was modified. `lib/forecast/simulate.ts` and
`lib/forecast/portfolio.ts` are untouched.

## Trust boundaries this instrument holds

- Evidence ≠ Finding. Finding ≠ Reality. Observation ≠ Decision.
- External evidence never silently alters Reality.
- Hermes is surfaced as an intelligence layer; the underlying evidence stays
  authoritative. The Hermes lane reports what arrived and when, never that it
  is correct.
- `ledger.db` is not provenance and does not appear.
- Provenance exposes **where a claim came from**, never model reasoning.
- `REALITY PROTECTED` is on screen at rest, when there is nothing to confirm
  — which is the only way it reads as a property of the instrument rather
  than as text beside a button.

## Architecture

| File | Owns |
|---|---|
| `lib/audit/truth.ts` | The semantic read model. Pure. |
| `lib/audit/graph.ts` | The Signal Graph projection. Pure, no geometry. |
| `lib/audit/graphLayout.ts` | Where nodes sit. Presentation only. |
| `lib/audit/provenance.ts` | Finding → snapshot → passage → origin. |
| `lib/audit/actions.ts` | What a human may do, and what each action will not do. |
| `app/api/audit/graph/route.ts` | The graph read. |
| `app/api/audit/truth/route.ts` | The finding read the inspector and console use. |
| `components/audit/SignalGraph.tsx` | The renderer: camera, nodes, edges, sweep. |
| `components/audit/GraphInspector.tsx` | Any node: identity, state, connections. |
| `components/audit/FindingInspector.tsx` | A finding: claim, evidence, provenance. |
| `components/audit/AuditReviewConsole.tsx` | Human review — Findings only. |
| `components/audit/graphTokens.ts` | Shape, colour, contrast tiers, zoom thresholds and their hysteresis. |
| `components/audit/cameraMotion.ts` | The camera: shape, limits, easing, interpolation, scale quantisation. Pure. |

SVG with a viewBox camera. At 65 nodes on the largest Scope this is far
inside SVG's comfort zone, and it keeps every node a real focusable element
with an accessible name — which a WebGL canvas cannot. No Sigma.

Wheel zoom is attached as a **native, non-passive** listener: React registers
wheel handlers as passive, so `preventDefault()` is ignored and the page
scrolls behind the graph.

## Motion

The instrument is used live on calls, so **how it feels is a product
requirement**. Three rules carry that, and each is asserted rather than
asserted-to.

### Zoom tiers are sticky; the camera never is

A tier is entered and left at different scales — 9% either side of each
threshold (`ZOOM_GATES`). Below that band whichever tier you are already in
wins.

Why it was needed: parked at k≈2.14 and wobbling the trackpad, the tier
flipped **23 times in 24 events**, and every close-only label strobed with
it. A camera resting on a threshold is the normal case, because that is
where the detail you were looking for appeared.

The band is sized against the wheel's own step: one deliberate notch is a
17% change and still crosses in one go, while trackpad noise (under 2.3%)
cannot cross at all. **This is not a debounce** — nothing is delayed,
dropped or smoothed. Only the discrete tier is sticky, and one owner
(`AuditInstrument`) decides it so the graph and the header readout can never
disagree.

### The camera eases, and always loses to the hand

`flyCamera` runs a cancellable rAF tween — **320ms, easeOutCubic, no
overshoot, no spring, no inertia**. Scale interpolates geometrically:
0.72 → 2.88 is two doublings, not "plus 2.16", and a linear ramp spends most
of its time at the wide end and then rushes the rest.

> **THE HAND OUTRANKS THE ANIMATION, ALWAYS.**

Every direct camera write cancels whatever is in flight, and every new
command retargets from wherever the camera actually reached. There is no
queue and no lock. Proven interruptible by wheel, by drag, by selecting a
node, and retargetable by a second command mid-flight.

| Move | Behaviour | Why |
|---|---|---|
| Wheel, drag, `+` / `−` | **cut** | adjusts the view you are in — the same act as a wheel notch |
| Fit, search result, expanding a cluster, explicit focus | **tween** | goes somewhere; continuity is the point |

Selecting a node moves the camera **not at all** — asserted, because a graph
that yanks the view when you touch something is a graph you stop touching.

### The wheel computes from a live camera

The defect underneath the chatter, and the one that mattered most: the wheel
handler closed over the `camera` prop, so consecutive events — which a
trackpad delivers far faster than React commits — each computed from the
same stale value. Measured, alternating in/out notches that should have
cancelled exactly instead **walked the zoom apart in both directions at
once**, 1.05 becoming 1.24 and 0.90 over fourteen events that summed to
zero. It also silently discarded input: 27 of 40 trackpad events produced a
camera change; now all 40 do.

There is exactly one live camera (`cameraRef` in `AuditInstrument`, written
synchronously before React is told anything) and handlers read it through
`getCamera()`. An earlier attempt kept a local ref synced by an effect and
was worse than the bug: an effect from an older render lands after a newer
event and clobbers the ref back.

### Nodes are memoised, and told a stepped scale

`GraphNode` is wrapped in `React.memo` with **React's own shallow
comparison — deliberately no custom comparator**. A hand-written one is how
memoisation silently eats a state change; every prop is a primitive, a
stable callback, or graphology's attribute object (returned by reference),
which is exactly what shallow comparison handles.

Nodes compensate for zoom in screen space (`1.4 / k` world units so a stroke
stays 1.4 pixels), which made the raw scale a prop on all 64 and re-rendered
every one of them on every frame. They are now told `quantizeScale(k)` —
32 geometric steps per e-fold, a 3.2% granularity that moves a 1.4px stroke
by four hundredths of a pixel. A slow trackpad zoom usually lands inside the
step it is already in and React skips the lot. **The camera itself is never
quantised**; only what the nodes are told.

## Measured performance

Production build, 1600×1000, JSA, warm. Dev-server first compile is not an
interaction latency and is excluded — every path is exercised and discarded
before it is timed.

| | Before | After | Budget |
|---|---|---|---|
| Tier flips per 24 micro-scrolls, far boundary | **23** | **0** | 0 |
| Tier flips per 24 micro-scrolls, medium boundary | **23** | **0** | 0 |
| Fly-to camera positions | **1** (hard cut) | **14** | animated |
| Fly-to settle | **0ms** | **395ms** | 300–400ms |
| Camera commit interval — pan | 16.6ms | 16.7ms | ≤16.7ms |
| Camera commit interval — trackpad | 25.2ms (27 of 40 events landed) | **19.2ms (40 of 40)** | — |
| Camera commit interval — wheel notch | 32.5ms (14 of 20) | **24.7ms (20 of 20)** | — |
| Frame time, pan + zoom + expand | 16.7ms median, p95 16.7 | 16.7ms median, p95 16.7 | ~60fps |
| Frames over 50ms | 0 of 193 | **0 of 202** | 0 |
| Hover → visible response | 1ms | **1ms** (worst 11) | <50ms |
| Click → selected | 13ms | **13ms** (worst 25) | <100ms |
| Search → match visible | 23ms | **19ms** (worst 34) | <100ms |
| Expand → state visible | 52ms | **46ms** (worst 56) | <100ms |

The camera commit interval is the metric memoisation moves, and it is
measured passively — the interval between successive writes of the SVG's own
`viewBox`, one commit one write, with nothing sampled per frame. Counting
DOM mutations does not work here: React re-renders an unmemoised node, diffs
it, finds the output identical and writes nothing, so the mutation count is
the same either way while the render cost is not.

## Proven

`scripts/audit-graph-proof.ts` (132) — model, layout, presence, requirements, capacity and source artifacts: every node
projects a real row, every edge cites a rule whose relation/basis/endpoints it
matches, no dangling edges, no renderer state in the semantic layer,
unsupplied lanes have no `supports` edge, provenance direction, uncited
sources produce no node, Evidence Solo's allowlist and stopping behaviour,
zero database writes, export round-trip, determinism, slice monotonicity,
passage namespacing, every clustered node inside its own sector — and the
`R` block: every node has a seat, every non-core node is a latent mark, every
mark carries a canonical ref, every mark is counted by exactly one badge,
identity never decreases with zoom or opening, expanding changes no node's
existence, no mark falls below the screen-space floor, and every passage
seats nearer its own source than any other.

`scripts/audit-proof.mjs` (54) — the graph-first interaction laws against the
live DOM: membership is never drawn, calm at rest, attested reads louder than
inferred, the wheel does not scroll the page, zoom changes labelling in steps,
semantic tab order, search dimming, selection focus, the console appearing
only for a Finding, Evidence Solo, candidate preview writing nothing, the
sweep trail following its edge, a sparse Scope still reading — plus the `S`
block: every mark resolves to a node the API returned, no node is missing,
latent marks are unannounced and unfocusable, each badge equals its real
hidden count, a full field still draws few edges, the faintest mark survives
far zoom, and zooming resolves the dust into differently-sized objects.

`scripts/audit-model-proof.ts` (43) — the finding semantics, unchanged.

`scripts/audit-motion-proof.mjs` (26) — the motion contract: no tier chatter
at either boundary, a full sweep still reaching every tier and returning, the
tween animating and landing in budget and coming to rest, cancellation by
wheel / drag / selection, retargeting by a second command, selection moving
the camera not at all, a search result flying, the camera committing inside a
frame budget while panning, and every state memoisation must not
suppress — selection, dimming, release, search marking, promotion.

`scripts/audit-manipulation-check.mjs` (18) — the direct-manipulation session:
creeping across each boundary, a fast far → close → far sweep, panning while
zooming, six clicks in half a second, choosing a search result, interrupting a
fly-to with a pan and with a zoom, clicking mid-expansion, Fit during a tween,
and the three stable tiers, each captured.

`scripts/audit-requirements-shoot.mjs` (24) — Requirements in the browser:
structural mass at far, identity at medium, named at close, found by search
and labelled as a Requirement, matched on text past the end of the trimmed
label, selection not moving the camera, the inspector naming role and status
and saying "no grounded implementation link" in those words, the provenance
chain walked Requirement → Passage → Source, the findings that concern it,
Evidence Solo lighting the requirement's provenance without reaching Reality,
and a Scope with no requirements source showing none.

`scripts/audit-capacity-shoot.mjs` (23) — Capacity in the browser: four
people as formed mass at far, named at medium, readable at close, found by
search and labelled Person, the inspector giving 60% here and Design 40% as
context with the ×0.88 factor and 0.53 effective FTE, the allocation
connection carrying its share, **no person→ticket edge drawn despite every
name matching an assignee**, Design showing the other side of the split, and
Platform and iTrack honestly empty.

`scripts/audit-sources-shoot.mjs` (22) — Source artifacts in the browser: six
latent at far, each kind formed and distinguishable at medium, titles resolved
at close, found by search and labelled by kind, a transcript selected without
moving the camera and showing a passage COUNT rather than its text, expanding
it opening exactly its own two passages and collapsing returning them to
marks, a passage opened as one, a Notion page and a Figma artifact opened as
themselves, Evidence Solo running to the artifact, an expansion fly-to
interrupted by a zoom, and a sourceless Scope showing nothing.

**328 assertions, all passing.**

`scripts/audit-density-measure.ts` — what is on screen at each zoom, per node,
read from the renderer's own rule rather than a restatement of it.
`scripts/audit-motion-proof.mjs --json out.json` — the motion measurements
above, as data.
`scripts/audit-graph-measure.ts` · `scripts/audit-graph-shoot.mjs` ·
`scripts/audit-density-shoot.mjs` — the size baseline and the visual sweeps.

## Known limitations

- **Correct / edit** is not implemented; the button says so.
- **Need more evidence** does not persist — `Finding.status` has no such
  value, and the console labels it session-only.
- **Filing to Linear stops at the preview.** The API's confirm step exists;
  Audit does not yet render the payload for approval.
- **Current vs prior** shows both run timestamps; ghosting prior positions is
  not built.
- **`contradicts` cannot be grounded** — a contradiction finding does not
  store which two sources disagree.
- **Capacity has no entity nodes.** People and allocations are counted in the
  cluster's checkpoints but are not yet graph nodes — which is why Capacity's
  sector is the thinnest on the field. That is a true report of what the graph
  currently projects, not a rendering gap.
- **Density is bounded by the project.** JSA is 65 nodes; the field now shows
  all 65, but it will not read like a reference vault of several hundred. The
  only way to change that is more real entities (transcripts, people,
  requirements), not more marks.
- **Desktop only**, per the brief; the shell's 1024px floor applies.
