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

At rest on JSA that is **17 drawn edges out of 77**, and 23 nodes of 65.

## Progressive detail

| Zoom | Reveals |
|---|---|
| **Far** (<1.05×) | Project shape: Reality, cluster pucks, findings, decisions, dependencies, features |
| **Medium** (<2.1×) | Delivery structure: dependency, decision, feature and intelligence labels |
| **Close** (≥2.1×) | Source detail: individual tickets, passages, sources, checkpoints |

Thresholds are explicit steps, not continuous text scaling — scaling would
produce unreadably small labels at far zoom rather than *no* labels, which is
worse. Zoom is capped at 4.5×, past which there is no further detail to
reveal, only a larger circle.

Membership in the *mounted* set is controlled by **expand/collapse per
cluster**, not by zoom. Expanding flies the camera to what it revealed.
Search and Evidence Solo both auto-expand whatever they need to show — a
result you cannot see reads as a bug.

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
| `components/audit/graphTokens.ts` | Shape, colour, contrast tiers, zoom thresholds. |

SVG with a viewBox camera. At 65 nodes on the largest Scope this is far
inside SVG's comfort zone, and it keeps every node a real focusable element
with an accessible name — which a WebGL canvas cannot. No Sigma.

Wheel zoom is attached as a **native, non-passive** listener: React registers
wheel handlers as passive, so `preventDefault()` is ignored and the page
scrolls behind the graph.

## Measured performance

1600×1000 and 1440×900, JSA fully expanded (64 nodes / 52 edges drawn):

| Interaction | Median | p95 | Worst |
|---|---|---|---|
| Zoom (12 wheel steps) | 16.7ms | 16.7ms | 16.8ms |
| Pan (drag) | 16.7ms | 16.8ms | 16.8ms |
| Expand all | 16.7ms | 16.8ms | 16.8ms |
| Select node | 16.7ms | 16.8ms | 50–83ms |
| Search keystrokes | 16.7ms | 33.4ms | ~100ms |

Sustained 60fps on camera work. Selection and search each cost one longer
frame on the React re-render; both are single hitches, not sustained drops.

## Proven

`scripts/audit-graph-proof.ts` (52) — model and layout: every node projects a real
row, every edge cites a rule whose relation/basis/endpoints it matches, no
dangling edges, no renderer state in the semantic layer, unsupplied lanes
have no `supports` edge, provenance direction, uncited sources produce no
node, Evidence Solo's allowlist and stopping behaviour, zero database writes,
export round-trip, determinism, slice monotonicity, passage namespacing, and
that every clustered node sits inside its own sector.

`scripts/audit-proof.mjs` (45) — the graph-first interaction laws: membership is
never drawn, calm at rest, attested reads louder than inferred, the wheel
does not scroll the page, zoom changes labelling in steps, expand/collapse,
semantic tab order, search dimming, selection focus, the console appearing
only for a Finding, Evidence Solo, candidate preview writing nothing, the
sweep trail following its edge, and a sparse Scope still reading.

`scripts/audit-model-proof.ts` (43) — the finding semantics, unchanged.

**140 assertions, all passing.**

`scripts/audit-graph-measure.ts` · `scripts/audit-graph-shoot.mjs` — the size
baseline and the visual sweep.

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
  cluster's checkpoints but are not yet graph nodes.
- **Desktop only**, per the brief; the shell's 1024px floor applies.
