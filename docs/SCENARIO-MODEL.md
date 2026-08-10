# Scenario model

Describes what actually exists in the codebase after the "scenario
foundation" Phase 1 refactor (branch `claude/scenario-input-delta`, cut
from `claude/portfolio-scenario-levers`). This is a description of shipped
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
  startDate: Date;
  targetDate: Date | null;
}

export function applyScenarioInputDelta(
  scopes: ScenarioInputScope[],
  realityPeople: PersonLike[],
  delta: ScenarioInputDelta
): ScopeSimulationSpec[]
```

Pure. Calls the existing `resolveCapacity` (`lib/capacity/resolve.ts`)
once per scope — it does not reimplement any part of the capacity
fallback chain. `teamCapacity` on the output spec is
`resolved.capacity ?? s.teamCapacity`: if this delta gives a scope neither
a real allocation nor an explicit override, it falls back to the
already-resolved value computed server-side (which may itself be inferred
from distinct Linear assignees — this pure, isomorphic module has no
Linear data of its own and doesn't try to re-derive that inference).

This is the **one and only place** `ScopeSimulationSpec[]` gets built from
a Scenario. `components/PortfolioPageClient.tsx` (client-side, drives live
drag) and `POST /api/portfolio/preview` (server-side, stateless
apply-and-return for programmatic callers) both call it — neither hand-
rolls the transform any more.

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

Unchanged by this refactor. `save()` writes the delta's *contents*
straight into Reality's own Postgres tables (`POST /api/people` for new
ghosts, `PUT /api/allocations` full-replace, `PATCH /api/portfolio-settings`
if the switch-cost changed), then reloads Reality from scratch. `discard()`
resets local component state back to the last-loaded Reality. There is no
intermediate "commit this as a named scenario" step — the scenario, as a
distinct value, still ceases to exist the moment it's saved. That's
unchanged; naming saved scenarios is explicitly not part of this
foundation (see "What this does NOT include" below).

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
themselves.

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
