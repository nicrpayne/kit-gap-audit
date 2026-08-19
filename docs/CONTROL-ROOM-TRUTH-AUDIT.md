# Master Control Room — Truth Audit

Done **before** the cards, because the concept image is a composition, not a data
contract. Every surface below names the instrument that owns it, the exact field,
and where clicking goes. Anything the concept image implies that the model cannot
support is listed at the bottom as **rejected**, not approximated.

Classifications: **STRUCTURED** (a typed field or row) · **DERIVED** (computed by
existing code from structured inputs; the derivation is the authority) · **FREE
TEXT** (real prose, renderable as words only).

---

## Top status strip

| Surface | Owner | Exact field | Class | Safe? | Opens |
|---|---|---|---|---|---|
| Live Now | Timeline | `/api/timeline` → `now` | STRUCTURED | yes | Timeline |
| Horizon | Timeline | `rangeEnd − now`, in days | DERIVED | yes | Timeline |
| Last forecast update | Reports | `max(Report.generatedAt)` across scopes | STRUCTURED | yes | Reports |
| Scenario state | `useProject` | `scenarioIsActive(scenario)` | DERIVED | yes | — |

## Primary summary row

### 1 · REALITY — *what is actually happening*

| Value | Owner | Field | Class | Opens |
|---|---|---|---|---|
| Open signals | Context/Audit | `ProjectPayload.findings` where `status === "open"` | STRUCTURED | `/audit` |
| …of which blocking | Context/Audit | `finding.blocking === true` | STRUCTURED | `/audit` |
| Work completed recently | Linear (live) | Timeline `work_completed` entries in the last 14 days | STRUCTURED | Timeline |
| Newest evidence | Context | `max(ContextSnapshot.observedAt)` via Timeline `context_observed` | STRUCTURED | Timeline |

### 2 · CHOICES — *what we have decided, and what is still open*

| Value | Owner | Field | Class | Opens |
|---|---|---|---|---|
| Open decisions | Decisions | `Decision.status === "open"` | STRUCTURED | `/decisions` |
| Unresolved gates | Decisions | open decisions with `gate.serial === true` | STRUCTURED | `/decisions` |
| Modelled delay | Decisions | Σ `gate.likely` over those gates | STRUCTURED (sum of stored values) | `/decisions` |
| Due | Decisions | `Decision.neededBy` present and in the future / past | STRUCTURED | `/decisions` |

**Note.** Only a gate reaches the forecast. 30 decisions are open; **2** are gated.
The card says both numbers, because "30 open" without "2 actually holding delivery"
is the exact misreading this product exists to prevent.

### 3 · CAPACITY — *what we can do*

| Value | Owner | Field | Class | Opens |
|---|---|---|---|---|
| RAW | Portfolio | `readMaster().allocated` | DERIVED (`Σ fraction × fte`) | `/portfolio` |
| EFFECTIVE | Portfolio | `readMaster().effective` | DERIVED (raw × switch factor) | `/portfolio` |
| FREE | Portfolio | `readMaster().free` | DERIVED (`max(0, workforce − allocated)`) | `/portfolio` |
| REQUIRED | Portfolio | `readMaster().required` | DERIVED | `/portfolio` |
| Switch loss | Portfolio | `allocated − effective`, with `contextSwitchCostPct` | DERIVED | `/portfolio` |

**Rejected:** the concept image's "68% Utilization" and "12% Buffer". Neither exists
in the model. RAW / EFFECTIVE / FREE do, and they say more.

### 4 · LIKELY OUTCOME — *where we land*

| Value | Owner | Field | Class | Opens |
|---|---|---|---|---|
| Portfolio likely date | Forecast | `portfolioLikely.date` — the latest scope P50 | DERIVED | `/forecast` |
| Which project sets it | Forecast | `portfolioLikely.gatedBy` | DERIVED | `/forecast` |
| Confidence | Forecast | that scope's `confidenceAtTarget` | DERIVED (`confidenceAtDay`) | `/forecast` |
| Gap to target | Forecast + Scope | that scope's P50 − its `targetDate`, in days | DERIVED | `/forecast` |
| Spread | Forecast | P90 − P10 in days | DERIVED (`percentileDay`) | `/forecast` |

**Note.** Confidence is per-scope because a target is per-scope. The card names the
scope. There is no portfolio-wide confidence in the model and none is invented.

### 5 · TIME — *where we are*

| Value | Owner | Field | Class | Opens |
|---|---|---|---|---|
| Live Now | Timeline | `now` | STRUCTURED | Timeline |
| Next landmark | Timeline | earliest `landmark` with `temporalState === "planned"` | STRUCTURED | Timeline |
| Nearest target | Scope | earliest future `Scope.targetDate` | STRUCTURED | `/scopes` |
| Days to horizon | Timeline | `rangeEnd − now` | DERIVED | Timeline |

## Centre — Project Time Machine

Reuses the Timeline instrument's own read (`/api/timeline`) and its own components.
No second implementation, no forked model. Lanes, NOW, plan bars, landmarks,
remembered forecasts, playback and the consequence readout are the Timeline's.

## Right rail

### Dependency Watch — see the separate audit below.

### Current Constraints

Every row traces to a structured field, and each states its own real quantity.
There is **no severity model in the product**, so there is no High/Medium/Low.
Rows are ordered by the size of their own quantity, and the quantity is shown.

| Row kind | Source | Quantity shown |
|---|---|---|
| Unresolved gate | `DecisionGate.likely` on an open serial gate | modelled days |
| Date no longer set by the backlog | `readDominance` headroom ≈ 0 | days of headroom |
| Capacity asked for and absent | `ChannelReading.required` | FTE |
| Capacity lost to switching | `allocated − effective` | FTE |
| Target already missed | scope P50 − `targetDate` | days over |
| Wide outcome | P90 − P10 | days of spread |
| Stale evidence | age of newest `ContextSnapshot` | days |

### Recent Activity

`/api/timeline` already emits a real, typed event stream: `decision_decided`,
`decision_gated`, `decision_raised`, `finding_raised`, `work_completed`,
`context_observed`, `landmark`, `report`. Each entry carries `date`,
`temporalState`, `sourceLabel`, and a `door`/`doorId` for deep-linking.

Only entries at or before NOW appear. `report` entries appear **only when the
forecast actually moved** (`Report.likelyDateDeltaDays ≠ 0`) — a report that
changed nothing is not news. Ordering is strictly by date, most recent first; the
kind mix is not re-weighted, because "meaningful" is not a score the model owns.

**No unified event table was created.** This is a read over what exists.

## Bottom lenses

| Lens | Owner | Content | Opens |
|---|---|---|---|
| Forecast | Forecast | compact Living Forecast over the gating scope's real trials, target, confidence, Reality ghost under Scenario | `/forecast` |
| Capacity | Portfolio | per-project RAW vs EFFECTIVE bars, switch loss, free/required | `/portfolio` |
| Decisions | Decisions | open / gated / modelled days / due | `/decisions` |
| Release composition | Scope | per-project remaining load days and item counts from `composeFeatures` | `/scope` |

---

# Dependency Watch — truth audit

The required V1 surface, and the one with the least model behind it. Audited
question by question, as §22 asks.

### 1. Scope-to-scope dependencies — **STRUCTURED**
`Scope.dependsOnScopeIds`. Declared by a human, never inferred. Honoured by
`runPortfolioTrials`, which takes the later of the two in every trial — so the
relationship is genuinely causal, not documentation.

### 2. Project-to-project dependencies — **SAME FIELD**
There is one dependency system, and it is already cross-project. Nothing else
exists and nothing was invented to make the surface look busier.

### 3. Decision / gate relationships — **STRUCTURED, scope-level only**
`DecisionGate.targetScopeId`. A gate blocks a *scope*. There is no
feature-level gate, so Dependency Watch never claims one.

### 4. Shared blockers — **DERIVABLE, and real**
Two derivations, both exact:
- **Shared upstream**: a scope that appears in more than one other scope's
  `dependsOnScopeIds`. On the live data, **Platform is upstream of both JSA and
  iTrack** — a real single point of failure, computed by counting, not scored.
- **Shared gate**: an open serial gate whose `targetScopeId` has downstream
  dependents. Answering it would release more than one project. Live data has
  none (both gates target JSA, which nothing depends on) — so the row is absent
  rather than faked.

### 5. Accepted vs candidate — **ASYMMETRIC, and this is the gap**
Accepted structural dependencies exist and are causal. **There is no
candidate-dependency model in the schema.** `DecisionCandidate` and
`TimelineEventCandidate` exist, and `Feature.source === "hermes"` marks suggested
scope — but nothing represents "Mobile may wait on Authentication".

So Dependency Watch shows a **NEEDS REVIEW** block built from the unreviewed
external claims that *do* exist (timeline event candidates, decision candidates,
unaccepted Hermes capabilities), labelled for what they are: unreviewed external
claims, **not** suspected dependencies. The concept the brief describes is
**reported as a missing model, not simulated**. See "could not be represented".

### 6. Downstream reach — **COMPUTABLE**
Transitive closure over `dependsOnScopeIds`. Finite, acyclic in the data, and
purely a count of declared edges. No weighting.

### 7. Critical-path ranking — **WOULD BE INVENTED, so it is not used**
A real critical path needs per-item scheduling; the engine models dependency at
scope granularity as `max(own, dependency)` per trial. What *is* real:
- **`readDominance`** (already in the product, used by Scope): when headroom
  between the scope's landing and its floor is ≈ 0, the backlog has stopped
  deciding the date and something else — a dependency or a gate — is. That is a
  binding-constraint statement, and it is honest.
- **Overrun**: upstream P50 measured against a downstream scope's own target.

Rows are ordered by, in order: days a dependency pushes a downstream past its
target · downstream reach · modelled gate days · needs-review. Each row **shows
the quantity it was ordered by**. There is no composite score.

### 8. Orbit deep-link — **SUPPORTED**
Orbit already focuses by scope (`orbit-focus-<scopeId>`). Control Room links to
`/orbit?focus=<scopeId>&select=<nodeId>`, where `nodeId` is Orbit's own stable id
(`dependency:<scopeId>`, `gate:<gateId>`). Orbit reads them and opens focused.

---

## Concept-image values rejected as unavailable

| In the image | Why rejected |
|---|---|
| `68% Utilization` | No utilization model. RAW/EFFECTIVE/FREE replace it. |
| `12% Buffer` | No buffer concept anywhere in the model. |
| `82% Confidence` as a portfolio number | Confidence is per-scope, against that scope's own target. Shown as such, named. |
| `98% Scope Alignment` | Does not exist. |
| `Capacity Health: Good` / `Integration Health: Good` | No health model. Replaced by the real readings. |
| Risk severity `High / Medium / Medium` | **No severity model exists.** Constraints show their own real quantity instead. |
| `Portfolio Health` donut (On Track / At Risk / Blocked / Completed) | "At Risk" and "Blocked" are not states any row has. Replaced with a release-composition lens built from `composeFeatures`. |
| `+9d vs Plan` | There is no stored "plan" to diff against. The real equivalent — P50 vs the scope's own **target** — is shown and named as such. |
| `3 Active Risks` | Same as severity: no risk model. |

## Dependency information that could NOT be represented truthfully

1. **Suspected / candidate dependencies.** No model. The product can say "this
   project waits on that one" only after a human declares it. Nothing in the
   pipeline proposes a dependency, so nothing can be surfaced for review. This is
   the single biggest gap against the brief's own north star, and it is a
   **schema-level absence**, not a UI decision.
2. **Feature-level dependencies.** Dependencies are scope-to-scope; a capability
   cannot wait on another capability.
3. **True critical path.** Not derivable at scope granularity (see 7).
4. **Dependency importance.** No weighting exists and none was invented.

---

# V2 — Instrument pass: audit of every new derived readout

Written **before** the readouts changed, as §25 requires. Two of the four
panels V2 asks for needed history that may or may not exist; both were
checked against the schema before a pixel was drawn, and one of them was
stopped.

## Capacity headline percentage

| | |
|---|---|
| **Name** | ARRIVING |
| **Source** | `readMaster(workforce, scopeIds, contextSwitchCostPct)` — Portfolio's own call |
| **Formula** | `effective ÷ allocated` |
| **Unit** | percent of committed time |
| **Meaning** | Of the human time we have actually committed to this project, how much of it lands on the work rather than being lost crossing between projects. Its complement is exactly context-switch loss. |
| **Safe?** | **Yes.** Both terms come from the same call, in the same unit, over the same set of people. There is no third quantity hidden in the ratio. |
| **Why care** | It is the one capacity number a person can act on: it falls when people are split, and it rises when they are not. |

**Deliberately NOT used:** the word *utilization*, and the ratio
`allocated ÷ workforce`. That second ratio is a real number, but "94% utilized"
invites a staffing conclusion the model does not support — it says nothing about
whether the work fits. `free` and `required` are shown as their own figures
instead, in FTE.

## Forecast confidence history — **REAL, and used**

| | |
|---|---|
| **Source** | `Report.confidenceAtTarget`, one row per generated report, via `ProjectScope.reportHistory` |
| **Formula** | none — the stored integer, plotted at `Report.generatedAt` |
| **Unit** | percent of trials landing at or before that scope's target |
| **Safe?** | **Yes.** Stored per report at the time it was generated. Never recomputed, never interpolated, never back-filled. |

Eight weekly reports per project on the live data. A scope with no reports —
Design has none — is **absent from the chart**, not drawn flat at zero. Points
where `confidenceAtTarget` is null (no target at that time) are skipped rather
than treated as 0%.

## Capacity history — **DOES NOT EXIST. Panel stopped as specified.**

`Allocation` has **no timestamps** (`id, personId, scopeId, fraction` and a
unique constraint — that is the whole row). There is no allocation-history
table, no capacity snapshot, and `PortfolioSettings` carries only a current
`contextSwitchCostPct` with an `updatedAt`. **Capacity is a current-state model.**

Per §10 — *"If no trustworthy history exists: STOP this panel and report the gap
rather than fake it"* — no capacity trend line is drawn. The Capacity Overview
panel ships as a **current-state composition** instead: per project, RAW as the
track and EFFECTIVE as the fill, with switch loss as the visible gap and free
capacity stated. The panel says on its own face that capacity has no history.

Two near-misses were considered and rejected:
- **Throughput** (`Report.shippedCount` over time) is real history, but it is
  work *completed*, not capacity. Labelling it "Capacity Overview" would be the
  exact semantic fudge this audit exists to prevent.
- **Drawing today's value as a flat line** would be a trend chart asserting
  stability nobody measured.

## Reality trend — **REAL**

`Report.shippedCount` per report, summed across projects at each report date.
It is what the report itself recorded as completed since the previous one.

## Choices trend — **REAL**

Count of `decision_decided` timeline entries per week. A direct count of stored
events, not a derived backlog level. It is labelled *answered per week*, because
"open decisions over time" would require reconstructing dismissals the event
stream does not carry.

## System Status — every row is something we can actually know

| Row | Source | Known how |
|---|---|---|
| Project data | the browser's own fetch of `/api/instrument/project` | when this page last received it |
| Forecast | `max(Report.generatedAt)` | stored timestamp |
| Context | newest `context_observed` entry | `ContextSnapshot.observedAt` |
| Work items | newest `work_completed` entry | Linear is read live on every request; this is the newest completion it returned |
| Evidence | `Source` rows in the project payload | `Source.createdAt` of the newest one |

`SourceRegistration` (the tracked-source registry, with its `status = "active"`
rows) was the first candidate for that last row and was **rejected**: it is not
in `/api/instrument/project`, and the Control Room is a composition — it does
not open a data path of its own to fill a status light. The payload's `Source`
rows are the evidence actually stored, and that is what the row says.

**Not shown, because it cannot be known:** Hermes availability (no health
endpoint), "integration health", and any overall green/amber/red verdict. A
feed with no datable timestamp is **omitted from the panel**, not drawn as
"unknown". The panel's header states the **oldest reading on it** as a fact
rather than grading itself.

## Next landmark · modelled delay · dependency reach

Unchanged from V1 and already audited above: the earliest planned
`TimelineEvent`, the sum of `DecisionGate.likely` over open serial gates, and a
count of declared `dependsOnScopeIds` edges.

## What Changed — source

The Timeline's own typed entries, at or before NOW, grouped by
`scopeId|title` so one subject is one line. Unchanged from V1 except in
presentation.

## "Project data" freshness — what it can and cannot mean

The payload carries no fetch stamp, and nothing on the server knows when a
particular browser last asked. So the age shown is **when this page received
the payload**, observed by the page itself (`ControlRoomInput.dataReceivedAt`,
set when the store hands back a new object). It is honest about being a
client-side fact. What it is NOT: a claim that the database, Linear, or Hermes
was current at that moment.

## The workspace is a view preference, and is kept away from the model

Presets and panel visibility live in `localStorage` under
`kit.control-room.workspace.v2` and are read by `lib/control-room/workspace.ts`,
which imports nothing from the model and touches no API. Three consequences,
all proven in `scripts/control-room-v2-proof.mjs` §G:

1. Switching preset issues **no non-GET request** of any kind.
2. The project payload is **substantively identical** before and after a full
   tour of every preset, the customize dialog and a reset.
3. Hiding a panel hides a **reading**, never a fact. Turning off Capacity does
   not change an FTE; the Portfolio instrument is still the owner and still
   says the same thing.

Editing a preset **forks to Custom** rather than redefining the preset under
its own name. There is deliberately no drag-and-drop, no resizing and no
reordering: the page's arrangement is the argument it makes about reading
order, and a rearrangeable layout stops making it.

## Colour, extended to domains without bending the law

The suite's law is unchanged — violet is a Scenario and only a Scenario, cyan
is Reality, amber is a target or an obstruction, mint is accepted capability,
red is a signal raised. V2 assigns each summary card the colour the law
**already** implies for what that card is about:

| Card | Accent | Because |
|---|---|---|
| Reality | red | it is about signals raised against the project |
| Choices | amber | it is about gates, which are obstructions |
| Capacity | mint | it is about capability we have |
| Likely outcome | cyan, **violet under a Scenario** | it is the forecast, and it is the only reading a Scenario changes |
| Time | none | time is the frame the other four are read inside, not a fifth domain |

Two consequences worth stating because they are easy to get wrong:

- The **forecast confidence history is never violet**, Scenario or not. A
  hypothetical changes what we expect next; it cannot change what a report
  stored last month. Proven in §F4.
- The confidence chart promotes the project that **lands last**. Where that
  project has never been reported on, **nothing** is promoted — picking
  another line to emphasise would be inventing a protagonist.

---

# V3 — Command Center pass: audit of the Project Field

V3 added no numbers. It added a **shape** — and a shape makes claims, so
every line, position and highlight on the Project Field is audited here
against the field it was read from.

## What each mark on the field is

| Mark | Source | Class | Safe? |
|---|---|---|---|
| A lane | one per `ProjectScope` | STRUCTURED | yes — never more, never fewer |
| Lane order | dependency-tree walk over `Scope.dependsOnScopeIds` | DERIVED | yes — proven: no lane is drawn above something it waits on |
| P10 / P50 / P90 band | `percentileDay(SimulationResult.completionDaysSorted, n)` and `likelyDate` | DERIVED (the engine's own) | yes |
| Reality ghost under a Scenario | the same scope's **baseline** simulation | DERIVED | yes |
| Target flag + slack rule | `Scope.targetDate`, and its distance from P50 | STRUCTURED + DERIVED | yes |
| Headroom bracket | `readDominance().floorDays` → P50 | DERIVED (Scope's own call) | yes |
| Release spine | `Scope.dependsOnScopeIds`, drawn from the upstream's P50 | STRUCTURED | yes |
| "N launches wait on X" | **count of declared edges** out of X | STRUCTURED | yes |
| Gate clamp | `DecisionGate` rows the engine was handed, joined to `Decision.title` | STRUCTURED | yes |
| Capacity flow bar | `readChannel().raw` / `.effective` — Portfolio's own call | DERIVED | yes |
| Highlight on selection | transitive closure over declared edges (`reachOf`) | DERIVED | yes |

## Where the spine is drawn, and why that is honest

The spine drops from the moment an upstream **lands** (its P50) through
every lane that waits on it, and a branch runs along each of those lanes to
where that lane lands. Both ends are real P50s from the same simulation
run, so the horizontal distance is a real number of days.

It is **not** a claim that the downstream starts when the upstream finishes.
The engine's actual rule (`runPortfolioTrials`) is that a dependent scope
takes the later of its own completion and its upstream's, per trial. The
drawing shows the two landings and the gap between them, which is exactly
what that rule produces — no more.

Lane order was changed in this pass specifically to make the spine truthful:
ordering by depth alone put roots at the top and dropped spines **through
lanes that were not on the chain**, which is a false statement however
decorative. Lanes are now walked as a tree so a spine always covers
contiguous rows. Proven in `control-room-v3-proof.mjs` §A4.

## Causality — what "this affects that" is allowed to mean

Selecting anything lights `{subject} ∪ transitive-downstream(subject)` and
dims everything else. That set is computed by walking `dependsOnScopeIds`
and nothing else. Consequences:

- A project nothing waits on lights **only itself** (§C6), even though a
  friendlier product would light its neighbours.
- A gate lights the lane it blocks and that lane's downstream — the lanes
  that would actually move if the question were answered (§D5).
- An **edge** lights from its UPSTREAM, not its downstream: the upstream is
  the thing whose movement travels, and highlighting only the waiting end
  would show the victim and hide the cause.

There is no weighting, no "impact score", and no ranking of which
dependency matters most. The only ordering signal is a **count of declared
edges**, which is why a shared upstream is drawn amber: it is the single
point whose slip moves more than one launch. That is arithmetic, not
judgement.

## Capacity is material, not topology

Changing the roster's switching cost changes the flow-bar fill and where
lanes land. It must never change how many lanes exist or what order they
sit in — otherwise the drawing would be saying that a staffing change
altered the project's structure. Proven by moving `contextSwitchCostPct`
from 12% to 45% through Portfolio's own API and asserting the lane list is
byte-identical (§E1), while ARRIVING and the landings both move (§E2–E3).

## Still not represented, and still reported rather than faked

Unchanged from V1 and V2, and worth restating because V3's shape makes the
absences more conspicuous:

1. **Suspected / candidate dependencies.** No model. Nothing in the
   pipeline proposes a dependency, so the field can only draw declared
   ones. The unreviewed external claims are kept in the dependency index,
   dashed and inert, and never drawn on the field.
2. **Feature-level dependencies and feature-level gates.** Both are
   scope-level in the schema. The inspector says so in words when a gate is
   selected, rather than letting the drawing imply otherwise.
3. **A true critical path.** Not derivable at scope granularity.
4. **Capacity history.** Still does not exist; the field shows today only.

## Deliberately omitted in V3

- **Drag-and-drop or resizable surfaces.** Position is the argument the page
  makes about reading order.
- **Animated flow along the spines.** Motion implies rate, and there is no
  rate in the model — only two dates and the distance between them.
- **A "project health" or "pressure" reading on the field.** Asked for by
  the concept image in spirit; refused for the same reason as V1's severity
  and V2's utilization.
- **Violet as the Decisions colour**, which the V3 brief suggested. Violet
  is the suite-wide signal for *a hypothetical* and is used by Orbit,
  Scope, Forecast, Timeline and Portfolio for exactly that. Re-pointing it
  at decisions inside one surface would have broken the one cue that tells
  a person whether what they are looking at is true. Gates and constraints
  keep **amber**, which the law already assigns to obstruction, and the
  brief's other five colour intentions (reality cyan, constraints amber,
  delivery green, forecast violet-cyan, candidates dashed) are met exactly.
