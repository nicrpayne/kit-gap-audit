# Scenario model

Describes what actually exists in the codebase after (1) the "scenario
foundation" Phase 1 refactor and (2) the capacity-scenario correctness fix
that followed it (both on branch `claude/scenario-input-delta`, cut from
`claude/portfolio-scenario-levers`). This is a description of shipped
code, not a design spec — if something below and the code disagree, the
code is right and this doc is stale.

## Why this exists

Before this refactor, `/portfolio`'s live drag-preview behavior and
`POST /api/portfolio/preview` were two independently hand-maintained
implementations of the same idea: "take Reality, apply a hypothetical
change, run the forecast engine, return the result without persisting
anything." They had already quietly diverged (different hypothetical-
person id schemes, and the server route wasn't even reachable from the
browser). This refactor gives that idea one name and one implementation.

## Reality

"Reality" is not a stored snapshot — it's whatever `buildPortfolioInputs()`
(`lib/forecast/compute.ts`) returns right now, derived live from Postgres
(`Scope`, `Person`, `Allocation`, `PortfolioSettings`) plus a live Linear
fetch per Scope. `GET /api/portfolio/inputs` is the one expensive
network+DB call per portfolio page load; everything downstream of it is
pure computation.

## ScenarioInputDelta

`lib/scenario/inputDelta.ts` defines:

```ts
export interface ScenarioInputDelta {
  allocations: AllocationLike[];      // the COMPLETE hypothetical allocation
                                       // set to simulate against, not a diff
  hypotheticalPeople: PersonLike[];   // people that don't exist as a real
                                       // Person row yet (e.g. an
                                       // unsaved "+1 developer" click)
  contextSwitchCostPct: number;
}
```

This is deliberately **narrow**. It only covers today's INPUT-SIDE
levers — the ones that change what gets fed into the Monte Carlo engine.
It is explicitly *not* named `ScenarioDelta` or `ScenarioState`, because a
future saved scenario (e.g. "September 15 Plan") will need to remember
both a simulation-input delta *and* an evaluation/target context (see
"Input-side vs. output-side levers" and "What this foundation is for"
below) — and cramming both into one type now would leave the evaluation
half with nowhere clean to live later.

## applyScenarioInputDelta

```ts
export interface ScenarioInputScope {
  scopeId: string;
  items: WorkItem[];
  gates: DecisionGate[];
  dependsOnScopeIds: string[];
  explicitTeamCapacity: number | null;
  teamCapacity: number;      // already-resolved fallback (may itself be
                              // inferred from Linear assignees)
  capacitySource: CapacitySource; // "allocations" | "explicit" | "inferred"
                                   // -- Reality's OWN source for this scope,
                                   // fixed before the scenario is applied
  startDate: Date;
  targetDate: Date | null;
}

export function applyScenarioInputDelta(
  scopes: ScenarioInputScope[],
  realityPeople: PersonLike[],
  delta: ScenarioInputDelta
): ScopeSimulationSpec[]
```

Pure. Calls the existing `resolveCapacity` (`lib/capacity/resolve.ts`) —
never modified, never reimplemented — either once or twice per scope,
branching on `capacitySource`:

```ts
if (s.capacitySource === "allocations") {
  const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, people, delta.allocations, delta.contextSwitchCostPct);
  teamCapacity = resolved.capacity ?? s.teamCapacity;
} else {
  // explicit | inferred -- the aggregate baseline is preserved untouched;
  // a SECOND call (explicitTeamCapacity forced to null) computes only the
  // scenario's additive contribution for this one scope, still correctly
  // switch-cost-adjusted against the full cross-scope allocation array.
  const additive = resolveCapacity(s.scopeId, null, people, delta.allocations, delta.contextSwitchCostPct);
  teamCapacity = s.teamCapacity + (additive.capacity ?? 0);
}
```

This is the **one and only place** `ScopeSimulationSpec[]` gets built from
a Scenario. `components/PortfolioPageClient.tsx` (client-side, drives live
drag) and `POST /api/portfolio/preview` (server-side, stateless
apply-and-return for programmatic callers) both call it — neither hand-
rolls the transform any more.

## Capacity source belongs to Reality, not to the scenario

A scope's authoritative capacity source — `"allocations"`, `"explicit"`,
or `"inferred"` (`lib/forecast/build.ts`'s `CapacitySource`) — is a fact
about Reality, fixed by `resolveCapacity` against Reality's own saved
`Allocation` rows *before* any scenario is applied. `ScenarioInputScope.capacitySource`
carries this fixed fact through to `applyScenarioInputDelta`, and it never
changes as a result of what the scenario contains. This is the core
invariant this document exists to state plainly, because it's exactly
what a real, reproduced bug violated before this fix existed: introducing
*any* allocation-shaped entry — a net-new hypothetical person, or an
existing real person moved in from another scope — used to silently flip
`resolveCapacity`'s decision from `"explicit"`/`"inferred"` to
`"allocations"`, discarding an aggregate baseline (e.g. "4 FTE inferred")
in favor of just the newly-introduced entry (e.g. "1 FTE"), sometimes
producing a *later* forecast from *adding* capacity. Fixed by keying the
branch in `applyScenarioInputDelta` on `capacitySource` (a Reality fact,
computed once) rather than on whether a given allocation entry happens to
be real or hypothetical.

### Aggregate-sourced vs. allocations-sourced: what each can represent

- **`capacitySource === "allocations"`** — Reality already tracks this
  scope at person level; every real `Allocation` row is a named,
  enumerable contributor. Both a net-new hypothetical person and an
  existing real person's reallocation are folded into the same
  `resolveCapacity` call, exactly as before this fix — correct, because
  there's no aggregate number at risk of being silently discarded.
- **`capacitySource === "explicit" | "inferred"`** — Reality is a single
  aggregate number with **no enumerable roster**. There is no stored data
  anywhere linking that number to specific people (no `linearUserId` on
  `Person`, no per-contributor breakdown for an inferred count, no
  contributor list for a typed-in explicit number). This has two
  consequences, applied consistently everywhere in this codebase:
  - **Anonymous/net-new capacity can always be added** — it makes no
    claim about who's inside the aggregate, so it's safe to add on top.
  - **A named, specific person cannot be safely added or removed** as a
    *commit* — adding one would either fabricate that we know who else
    makes up the rest of the number, or (if we tried to represent it
    faithfully) require inventing a roster that doesn't exist. Removing
    one is worse: it would require knowing they were already counted in
    the aggregate, which is fundamentally unknowable from this data
    model. **Preview may still model a named person's move into an
    aggregate scope** (see "Preview may represent states that cannot yet
    be committed" below) — only *persisting* it is restricted.

### Anonymous capacity vs. named-person reallocation

These are two different kinds of scenario change, and the codebase now
treats them differently on purpose:

- **Anonymous/net-new capacity** (`ScenarioInputDelta.hypotheticalPeople`,
  e.g. the "+1 developer" / "+2 developers" quick actions) makes no claim
  about identity. It is *always* committable: onto an allocations-sourced
  scope it becomes a real `Person` + `Allocation` row (unchanged
  behavior); onto an aggregate scope it's folded into a new
  `explicitTeamCapacity` value (see "Commit rules" below) and **never**
  given a `Person`/`Allocation` row.
- **Named-person reallocation** (an existing real `Person`'s fraction
  changing on one or more scopes — moving them, changing their split, or
  adding them somewhere new) makes a specific, named claim. It is
  committable only when every scope the person ends up on (with a
  positive resulting fraction) is allocations-sourced. `lib/scenario/namedTransfer.ts`'s
  `detectNamedPersonMoves` is the pure helper that answers "did this
  person's allocation change, and can every touched scope represent
  that truthfully" — used for commit eligibility, atomic blocking, and
  the explanatory UI copy, and nothing else (not a general workflow
  engine).

The `+1`/`+2 developer` quick actions are, and were always intended to
be, anonymous scenario capacity — not evidence of a specific future named
employee. Nothing in the UI ever asks for or implies a name (the
auto-generated "New developer N" label is a placeholder, never surfaced
as something to fill in); the buttons exist to answer "what if we had
more capacity," not "let's onboard someone." This is why they now commit
as an aggregate-capacity bump on an aggregate scope rather than minting a
meaningless named `Person` row there. On an **already** allocations-sourced
scope, they still realize as a real `Person` row, exactly as before this
fix — that scope's whole model is a list of named contributors, so an
anonymously-named placeholder (renamable later) is a reasonably honest
fit, and changing that mechanism was explicitly out of scope for this fix
(a lower-priority data-hygiene question, not a correctness bug).

### Preview may represent states that cannot yet be committed

Preview (`baseline`/`preview`, the live `Map<scopeId, SimulationResult>`)
has no opinion on persistability — it will happily show a named person's
allocation split across an allocations-sourced scope and an aggregate
one, because the *simulation* math is honest either way ("4 aggregate +
0.3 named" is a perfectly coherent number to feed the engine). Commit
eligibility is a separate, stricter question, asked only at Save time.
This is a deliberate design choice, not an oversight: Scenario's job is
to answer "what if," Reality's job is to answer "what do we actually know
and track" — weakening what Scenario can *ask* merely because Reality
can't yet *persist* the answer would be a real step backward from the
point of separating them in the first place. The eventual **Save
Scenario** (preserve a hypothetical without touching Reality) vs.
**Commit to Reality** (requires the destination to represent the change
truthfully) split — not built yet, see "What this foundation is for"
below — is the long-term home for this asymmetry; today it shows up as
Preview always succeeding and Save selectively excluding what it can't
truthfully persist.

### Named-transfer commit restrictions, and atomicity

A real person's allocation changes are committed **only if every scope
they'd end up on (positive resulting fraction) is allocations-sourced**.
If any touched scope is aggregate-sourced, **the person's entire set of
allocation changes for that Save is excluded** — not just the
aggregate-destination leg. Concretely: if Anders moves 0.3 FTE from an
allocations-sourced JSA to an aggregate-sourced iTrack, clicking Save
does not reduce JSA's stored allocation for Anders either — both legs
stay exactly as Reality had them. This is a broader atomicity boundary
than "just the specific transfer's two legs" (chosen deliberately, since
"which legs belong to which transfer" isn't well-defined in general once
a person has touched multiple scopes in one session) — it's simpler to
reason about, and strictly safer: nothing about a blocked person's
allocations changes, full stop, for that Save. Unrelated changes (other
people, anonymous additions, other scopes) still commit in the same Save
action. The UI surfaces which changes were excluded and why, both before
Save is clicked (a live "Saving this will..." summary,
`PortfolioPageClient.tsx`) and after (a short summary message).

## Apply-delta flow

```
Reality (buildPortfolioInputs / GET /api/portfolio/inputs)
        │
        ├── baseline delta: Reality's own saved allocations/people/
        │   contextSwitchCostPct, hypotheticalPeople: []
        │
        └── preview delta: whatever's currently being dragged
                (allocations, hypothetical people, switch-cost)
                    │
                    ▼
         applyScenarioInputDelta(scopes, realityPeople, delta)
                    │
                    ▼
              ScopeSimulationSpec[]
                    │
                    ▼
          runPortfolioSimulation(specs)   [lib/forecast/portfolio.ts,
                                            untouched by this refactor]
                    │
                    ▼
           Map<scopeId, SimulationResult>
```

Passing a delta built from Reality's own saved state reproduces the
baseline forecast **exactly** — `resolveCapacity` is the same pure
function originally used to compute each scope's stored `teamCapacity`,
so re-running it against the same saved inputs returns the same number on
the "allocations" and "explicit" fallback rungs, and the `?? s.teamCapacity`
fallback reproduces the "inferred" rung without re-deriving it. This is
regression-tested, not just asserted — see "Verification" below.

## Baseline vs. preview

`components/PortfolioPageClient.tsx` keeps these as two separate values,
exactly as before the refactor:

- `baseline` — `useMemo`, computed once per `data` load, from a delta
  built out of Reality's own saved allocations.
- `preview` — `useState`, recomputed on a 120ms debounce from a delta
  built out of the live drag state (`fractions`, `ghosts`,
  `switchCostPct`).

Both are `Map<scopeId, SimulationResult>`, produced by the identical
`applyScenarioInputDelta` → `runPortfolioSimulation` pipeline. Nothing is
persisted by computing either — this is purely in-memory, in-browser
computation with zero network calls per drag frame.

## Save / Discard

`discard()` is unchanged: resets local component state
(`fractions`/`ghosts`/`switchCostPct`) back to the last-loaded Reality,
zero network calls. There is no intermediate "commit this as a named
scenario" step — the scenario, as a distinct value, ceases to exist the
moment it's saved or discarded. Naming/saving scenarios is explicitly not
part of this codebase yet (see "What this foundation is for" below).

`save()`'s commit rules, per scope's `capacitySource`:

- **`"allocations"`** — unchanged from before this fix. Anonymous
  additions and real reallocations both flow into `POST /api/people`
  (for a used, not-yet-real ghost) and `PUT /api/allocations` (full
  replace per mentioned person), except that any real person flagged
  ineligible by `detectNamedPersonMoves` (see above) is excluded from the
  payload entirely.
- **`"explicit"` or `"inferred"`** — an anonymous/hypothetical
  contribution to this scope is folded into a **new `explicitTeamCapacity`
  value**, committed via the existing `PATCH /api/scopes/:id` (already
  supported the `teamCapacity` field; no route change needed). No
  `Person`/`Allocation` row is created for it. This is a deliberate,
  approved conversion: `inferred → explicit`, or `explicit(N) →
  explicit(N + addition)` — the scope's capacity source becomes/stays
  `"explicit"` going forward, since a number was just deliberately
  supplied. **Not silent**: `PortfolioPageClient.tsx` renders a live
  "Saving this will..." summary (updates as the user drags, visible
  before Save is even clicked) naming exactly which scope converts to
  what value and why, plus which named-person changes are blocked and
  why — reusing the app's existing inline-message visual pattern
  (`overAllocated`/`removeError`), not a new modal or design language. A
  real person's contribution to an aggregate scope is **never** folded
  into this number, whether or not that specific move happens to be
  eligible elsewhere — there is no eligible path for a named person into
  an aggregate scope at all (see "Named-transfer commit restrictions"
  above).

`await load()` still reloads Reality from scratch after either path
completes, same as before.

## Comparison: compareToBaseline

`lib/scenario/compare.ts`:

```ts
export interface ScenarioComparison {
  deltaDays: number;
}

export function compareToBaseline(
  baseline: SimulationResult | undefined,
  preview: SimulationResult | undefined
): ScenarioComparison
```

Replaces what used to be inline JSX arithmetic
(`preview.likelyDate - baseline.likelyDate`, duplicated at every render of
every scope row, and a third time in the preview API route's response
building). Deliberately narrow: it does **not** compute a confidence
delta. Confidence is only meaningful relative to a specific target date,
which is an output-side/evaluation concept this comparison function has
no opinion about — bolting an implicit `confidenceDeltaPct` onto it would
silently assume whichever target happened to be set. If target-relative
comparison is needed later (Forecast Canvas work), it should take an
explicit target-date argument, not an implicit one.

## Input-side vs. output-side (evaluation) levers

This is the load-bearing distinction of the whole design, and it's why
target date is deliberately kept outside `ScenarioInputDelta`.

- **Input-side levers** change what the Monte Carlo engine simulates —
  allocations, hypothetical people, context-switch cost today; scope-cut
  and dependency-relief later. They require a fresh `runPortfolioSimulation`
  call, because the thing being asked ("what does the world look like")
  actually changed.
- **Output-side / evaluation levers** ask a different kind of question of
  an *already-simulated* distribution — "what's my confidence by this
  date" or "what date do I need for this confidence." Target date is the
  only one that exists today. It needs zero re-simulation.

## Why target date does not trigger re-simulation

`TargetDateLever` (`components/PortfolioPageClient.tsx`) reads
`(preview ?? baseline).get(scopeId).completionDaysSorted` — the sorted
per-trial completion-day array that was already produced by whichever
`SimulationResult` is currently on screen — and answers both directions
with pure lookups already exported from `lib/forecast/simulate.ts`:
`confidenceAtDay(sorted, days)` (date → confidence) and
`percentileDay(sorted, pct)` (confidence → date). Editing the date or the
confidence field never calls `applyScenarioInputDelta`,
`runPortfolioSimulation`, or any network endpoint — it's a synchronous,
free computation over data that's already sitting in memory. This was
verified directly: a Playwright check confirmed editing the target-date
confidence field triggers zero additional `/api/portfolio/*` requests.

Saving a target date (`saveTargetDate` → `PATCH /api/scopes/:id`) is its
own, separate, immediate-write action — unrelated to the input-delta
Save/Discard cycle, and untouched by this refactor.

## Relationship to runPortfolioSimulation

`lib/forecast/portfolio.ts`'s `runPortfolioSimulation` (the lockstep joint
Monte Carlo orchestration across a dependency graph) is untouched by this
refactor and remains the sole simulation entry point both baseline and
preview go through. `applyScenarioInputDelta` only builds its *input*
(`ScopeSimulationSpec[]`) — it has no awareness of trials, dependency
ordering, or correlation, and doesn't need any, since that's all handled
downstream. A scope with dependencies (`dependsOnScopeIds`) is simulated
exactly the same way whether its specs came from a baseline delta or a
preview delta — there is no code path in this refactor that could
accidentally fall back to simulating a scope alone.

## Duplicate logic removed

Two implementations of "delta → `ScopeSimulationSpec[]`" ceased to exist:
`PortfolioPageClient.tsx`'s local `specsFor()` (client) and
`POST /api/portfolio/preview`'s inline spec-building (server, both its
baseline-spec construction — which previously skipped `resolveCapacity`
entirely and just reused the precomputed `teamCapacity` — and its
preview-spec construction). Both now call `applyScenarioInputDelta`. The
inline `deltaDays` arithmetic (duplicated three times: two render
call-sites in the client, once in the preview route's response) was
replaced by `compareToBaseline` in all three places.

## Server-side invariant: PUT /api/allocations

The rules above are enforced client-side in `PortfolioPageClient.tsx`,
but the client is not the only possible caller of `PUT /api/allocations`
(`app/api/allocations/route.ts`) — a script, Hermes, or a future UI path
could call it directly. The route enforces the same invariant
independently, as defense-in-depth: **it rejects (409) any write that
would introduce the first-ever `Allocation` row for a scope that
currently has none**, regardless of how many people the request names or
whether the request looks "complete." Determined with one cheap query —
`prisma.allocation.findMany({ where: { scopeId: { in: scopesToWrite } }, distinct: ["scopeId"] })`
— comparing the *current, pre-transaction* set of scopes that already
have at least one allocation against the scopes the request targets.
Deliberately does **not** try to distinguish `"explicit"` from
`"inferred"` — both are exactly "zero existing `Allocation` rows for this
scope," which is all this check needs to know, and computing which of
the two it is would need Linear data this route has no reason to fetch.
No Linear call, no forecast computation, no dependency on
`resolveCapacity`'s consuming code — just a Postgres fact checked before
the write. A write that only touches a scope which already has ≥1
existing allocation (from anyone, including the same person being
updated) passes normally; this is what keeps ordinary allocations-sourced
scope edits — realizing a ghost, reallocating a real person, adjusting an
existing fraction — working exactly as before.

**Known trade-off, worth stating plainly**: this makes it impossible to
set up person-level tracking for a scope **for the first time** via this
endpoint at all, even as a single deliberate, complete, multi-person
request — the check has no way to distinguish "a legitimate one-shot
conversion" from "the same partial-write bug via a different call
shape," so it refuses both. Converting an aggregate scope to full
person-level tracking is not supported by any path today (client or
API) — it would need a new, explicit, deliberately-named mechanism,
which is future work, not part of this fix.

## What this foundation is for (not built yet)

The narrow shape above is deliberate groundwork for a larger future model
that is **explicitly not built by this Phase 1**:

```
Scenario
  + ScenarioInputDelta   (this foundation)
  + Evaluation           (a target date, or other output-side context —
                           does NOT exist as a named concept yet)
  + Metadata             (name, id, createdAt — does NOT exist yet)
```

This split is what would eventually let a saved scenario like
"September 15 Plan" remember its own target date without implying that
changing a target requires re-running Monte Carlo — the two halves stay
independently swappable, exactly as they already are in the running code
today, just not yet packaged as one named, saved value.

Things this foundation makes cheaper later, without having built them:

- **Saved/named scenarios (A/B/C/D slots)** — `ScenarioInputDelta` is
  already a small, serializable plain object; a future `SavedScenario`
  table (`{id, name, delta: ScenarioInputDelta, evaluation, createdAt}`)
  is an additive schema change on top of a value that already exists in
  the right shape, not a redesign.
- **Undo/redo** — needs a history stack of `ScenarioInputDelta` values.
  The interaction layer's underlying state (`fractions`/`ghosts`/
  `switchCostPct`) was deliberately left alone for drag performance (see
  "Performance" below); the delta is only assembled at the point of
  consumption, which is exactly where a history stack would need to
  snapshot it.
- **Scenario comparison beyond baseline-vs-current** — `compareToBaseline`
  already takes two arbitrary `SimulationResult`s, not specifically "the
  saved one"; comparing two named scenarios later is the same function.

## Explicit non-scope: saved A/B/C/D scenarios do not exist yet

There is no `SavedScenario` model, no naming, no scenario slots, no
persistence of a scenario as anything other than "whatever's currently in
`fractions`/`ghosts`/`switchCostPct`/the target-date input, until Save
writes it into Reality or Discard throws it away." This document describes
the foundation those features would be built on, not those features
themselves. Likewise, **Save Scenario** (preserve a hypothetical without
touching Reality) and **Commit to Reality** (write it, only where
truthfully representable) remain conceptually distinct ideas discussed in
this document, but there is still only one button ("Save this
allocation") and one code path — the capacity-scenario fix made that one
path *correctly discriminate* what it can and can't truthfully persist,
it did not split it into two separate user-facing actions. That split
remains explicitly future work.

## Performance

The refactor does not change the interaction layer. `fractions` (a `Map`
keyed by `personId::scopeId`), `ghosts`, and `switchCostPct` remain three
separate `useState` hooks, each cheap to update on a single slider frame.
A `ScenarioInputDelta` object is assembled only at the two points it's
actually consumed (the `baseline` memo, once per data load; the debounced
preview effect, once per 120ms tick) — this is an explicit adapter from
the fine-grained interaction state to the domain shape, not a restructuring
of the interaction state itself. Debounce timing (120ms) and trial-count
behavior are unchanged.
