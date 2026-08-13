# The Scope instrument

Companion to `docs/DESIGN-NORTH-STAR.md`. That document says what the
Instrument surface should feel like; this one says what **Scope** is, what it
is allowed to control, and — the part that matters most — where the engine
stops and the drawing has to stop with it.

Scope answers one question: **what are we actually trying to ship?**

## The object is the load, and the date is not part of it

Every other backlog tool conflates two things. Scope keeps them apart, on one
shared vertical axis measured in days:

| | What it is | Does cutting change it? |
|---|---|---|
| **The load** | What this Scope has committed to carry. `Σ mean(item)/capacity + Σ mean(gate)` | **Always.** It is arithmetic. |
| **The landing** | Where the simulation says it lands, from 5000 trials | **Sometimes.** A dependency or an open decision can be what is really setting it. |

The column is the load. The rule below it is the landing. When they separate,
a dashed **tether** is drawn between them, and that gap is the honest answer to
"why didn't my cut help?" — it is slack, and no amount of further cutting
reaches it.

This is why the instrument is not a list. A list can tell you an item is 8
points; it cannot show you that removing it falls into 7 days of slack.

### Why slab height is the mean, not the likely value

`sampleOwnDays` (`lib/forecast/simulate.ts`) draws each item from a triangular
distribution and divides the sum by capacity. The sum is linear in the items,
so one item's expected contribution is exactly `mean(low, likely, high) /
capacity` days — a separable share that falls out of the engine's own
arithmetic rather than an attribution invented for the picture.

Using the *likely* value instead would make every column fall systematically
short of its own simulated date (a 1–3–7 day placeholder has a mean of 3.7,
not 3), and that shortfall would be indistinguishable from real domination.
The one thing this instrument exists to show would have been buried under an
artefact of its own drawing. See `lib/scope/load.ts`.

## The visual → semantic map

Nothing here is decorative. If it is drawn, it is derived.

| What you see | What it means | Derived from |
|---|---|---|
| Slab **height** | days of schedule this item costs | `mean(range) / capacity` |
| Slab **width** | how unsure that is | `(high − low) / capacity`, scaled against Reality's widest item |
| Slab **order** | heaviest first | sort on the above |
| **Hatching** on a slab | no real estimate; a deliberately wide guess | `estimateSource` is a placeholder |
| Violet slab border | re-estimated in this Scenario | `estimateOverrideByItemId` |
| "inferred" on a name | not a ticket — the audit found it in a source | `kind === "inferred"` |
| Amber **hatched band** | serial decision delay; capacity cannot divide it | open `DecisionGate`s |
| Amber bar **in the gutter** | the days cutting here cannot reach | a real simulation with the backlog emptied |
| Dashed **tether** | slack between the load and the date | `landing − load` |
| Violet date | moved in this Scenario | `preview` vs `baseline` |
| Dashed ghost rule | Reality's own landing | `baseline` |

The silhouette is therefore readable before any number is: a column that
tapers is a release whose big items are its well-understood ones; a column
that bulges is a release carrying its uncertainty in its heaviest work.

## What Scope actually controls

Verified against the code, not assumed.

**Real, and wired:**

- **Work inclusion / exclusion.** `runPortfolioSimulation` reads `items` off
  the spec it is handed, so removing one is the engine's own definition of
  "this isn't in the release". No new math; `SuiteScenario.excludedItemIds`
  filters the spec.
- **Three-point estimate override.** Same class of change: the simulation
  reads `low/likely/high` off the spec. `estimateOverrideByItemId` substitutes
  a hypothetical range. The stored `WorkEstimate` is never written.

Both are input substitutions applied in `useProject`'s existing preview path.
**Monte Carlo sampling and `runPortfolioSimulation` orchestration are
untouched.**

**Real, but owned elsewhere — shown, never edited here:**

| Value | Owner | Why Scope shows it |
|---|---|---|
| capacity / FTE | Portfolio | it is the divisor in every slab height |
| decision resolution | Decisions | serial delay is part of the load |
| target date | evaluation / Forecast | not a scope question |
| consequence analysis | Forecast | Scope shows the date, Forecast explains it |

**Not supported by the model, and therefore not built as a control:**

- **Release assignment (Beta / Production / Later).** There is no release
  entity a `WorkItem` can belong to — one release per Scope, no milestones. The
  interaction is drawn in a summoned window marked `Prototype` that says so
  before it shows anything, and it reaches nothing.
- **Within-project sequencing.** The simulation treats items as one parallel
  pool divided by capacity. There is no order to manipulate, so no ordering
  control exists. Slab order is a *reading* order (by size), which is why it is
  never draggable.
- **Milestones**, **release lanes**, and **arbitrary grouping**: no model.
- **Committing a cut into Reality.** There is nowhere to write it: exclusion is
  not a field on a Linear issue or a `WorkItem`. Scope therefore has no Commit
  button, and every surface says "out in this Scenario", never "removed".

## One world, seven surfaces

`useProject` keeps the payload and the scenario in a module store rather than
per-component state. A scenario is a statement about the project, not about the
screen it was made on — cutting scope and walking to Forecast to see the
consequence is the point of a suite, and per-surface state silently discarded
the hypothetical on the way. `scripts/scope-forecast-proof.mjs` asserts the
whole round trip, including that discarding returns both instruments to
Reality.

## The two examples worth keeping

Both are real, from the dev seed, and both are load-bearing for the design:

- **Design** — capacity is 0.35 FTE, so a single 3-day item is 10 days of
  schedule. Cutting one moves the date 10 days earlier. Cutting *helps*.
- **iTrack** — depends on Platform. All 7 of its items can be cut and the date
  does not move by one day, because Platform's own completion sets it. Cutting
  *does nothing*, and the instrument says which thing is really in the way.

`scripts/scope-truth.mjs` re-derives both against the live payload.
