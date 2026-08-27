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

## Audit is an instrument now

`/audit` used to be a reading surface: a paginated list of past audit runs
in `SignalSurface`'s centred measure, on the reasoning that "there is
nothing here to play". The Project Truth Map is a control surface — you
select on it, focus it, solo it, and preview candidate Reality against it —
so `/audit` owns the viewport like Forecast and Timeline do.

The run list was not deleted. It moved to `/audit/history`, which is still
genuinely a reading surface and still wears `SignalSurface`. `/audit/<sourceId>`
is untouched.

## The one visual idea

**A signal that agrees with Reality reaches it.**

A lane in good standing runs unbroken from its label in the gutter, through
its checkpoints, into a port on the Reality bus. A lane carrying a
disagreement is **interrupted** at the band its state names, and continues
inward only as a faint dashed ghost.

That is what makes the map readable without a legend: solid lines reaching
the middle are truth flowing, broken ones are truth blocked, and a worse
disagreement breaks the lane further out.

## What position means

| Dimension | Meaning |
|---|---|
| **Radius** | Disagreement with Reality. Three named bands — ALIGNED, DRIFT, CONFLICT. |
| **Angle** | Seating, not rank. Each lane owns a port; lane order maps monotonically onto a counter-clockwise sweep so lanes nest instead of tangling. |
| **The right-facing arc** | Deliberately empty. No lane docks there — it is the reading side, where the eye leaves the core for the inspector. |
| **A break in a lane** | Where that signal stops agreeing with Reality. |
| **A junction** | A real compiled checkpoint, carrying the measurement it was decided from. |

**A crossing is not a relationship.** Lanes may pass over one another on
their way to a port. Meaning is carried only by a rendered junction, never
by incidental geometry.

Radial placement is **categorical, not continuous**. There is no numeric
"distance from truth" in the model and none is invented — a continuous
radius would be exactly the fake precision `docs/CONTROL-ROOM-TRUTH-AUDIT.md`
spent a pass removing.

## The lanes, and what supplies them

| Lane | Family | Supplied by | Checkpoints |
|---|---|---|---|
| Decisions | model | `Decision` rows | decision recorded · owner known · gate declared |
| Dependencies | model | `Scope.dependsOnScopeIds` | dependency accepted · upstream target known |
| Capacity | model | `Allocation` / `Person` / `Scope.teamCapacity` | capacity attested |
| Linear | evidence | `Scope.teamKey` + `projectNames` (structural) | execution present · estimates present · owner known |
| Notion | evidence | `Scope.notionPageIds` | requirements supplied |
| Figma | evidence | `Scope.figmaRefs` | design supplied |
| Hermes / Wiki | evidence | `ContextSnapshot` | intelligence supplied · package fresh · provenance cited |
| Evidence | evidence | `Source` + `ContextDoc` | evidence present · evidence fresh |

**An unsupplied lane is rendered, not hidden.** "Nothing is supplying design
for this Scope" is project truth and exactly the kind of gap Audit exists to
surface. It draws dashed and grey, states its absence as a checkpoint, and is
listed in the inspector's overview.

**Gate declared is never a failure.** Having no `DecisionGate` is the correct
and common case — a gate is the claim that delivery is physically waiting.
The checkpoint reports the count and stays `verified` either way.

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
| `lib/audit/truth.ts` | The semantic model. The only place a truth state is decided. Pure. |
| `lib/audit/layout.ts` | Geometry. Presentation only — nothing here is stored or read back. |
| `lib/audit/provenance.ts` | Finding → snapshot → passage → origin. Resolves; never invents. |
| `lib/audit/actions.ts` | What a human may do, and what each action will not do. |
| `app/api/audit/truth/route.ts` | One read per load. Everything else is client-pure. |
| `components/audit/ProjectTruthMap.tsx` | The SVG field. |
| `components/audit/FindingInspector.tsx` | Overview / selected finding, progressive disclosure. |
| `components/audit/AuditReviewConsole.tsx` | Evidence Solo, A/B, human review. |
| `components/audit/icons.tsx` | One icon system: 24×24 grid, 1.5 stroke, 16px glyph in a 26px holder. |

The `truth.ts` / `layout.ts` split mirrors `lib/orbit/graph.ts` /
`lib/orbit/layout.ts`: an angle is a drawing decision, and persisting one
would turn a picture into a fact.

SVG rather than Canvas, because every finding has to be a real focusable,
keyboard-reachable target with an accessible name.

## Proven

`scripts/audit-model-proof.ts` — 52 assertions covering derived severity, the
absence of any invented score, unsupplied-lane honesty, layout determinism,
anchor separation, card containment, sweep-trail direction, provenance
resolution, the decision-promotion law, ticket preview-first, and that
reading the map mutates nothing.

`scripts/audit-proof.mjs` — 34 assertions in the browser: calm at rest,
hover-is-preview, selection focus, Evidence Solo lighting exactly the
provenance lanes and no others, candidate preview writing nothing, the sweep
trail following its edge, keyboard reach, and an unsupplied Scope rendering
honestly.

`scripts/audit-shoot.mjs` — the visual sweep at 1600×1000 and 1440×900.

`scripts/seed-audit-demo.ts` — a dev fixture creating the finding shapes the
map has to be able to draw. **Everything it creates is marked
`[demo fixture]`** in its rationale so it can never be mistaken for a real
audit result.

## Known limitations

- **Correct / edit** is not implemented. The button reports that rather than
  pretending.
- **Need more evidence** does not persist. `Finding.status` has no
  awaiting-evidence value; adding one is a migration, and the console says
  "not saved" rather than implying a durable state.
- **Filing to Linear stops at the preview.** The confirmation step exists in
  the API (`{ confirm: true }`) but Audit does not yet render the payload for
  approval, so it reports the preview and stops.
- **Current vs prior** shows both run timestamps; ghosting prior findings on
  the map is not built.
- **Perimeter seats are finite** (11). A finding beyond that keeps its anchor
  and stays selectable, losing only its card.
- **Desktop only**, per the brief. The shell's 1024px floor applies.
