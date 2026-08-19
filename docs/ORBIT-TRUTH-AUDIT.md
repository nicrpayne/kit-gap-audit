# Orbit — Truth Audit and Semantics

**Foundation pass.** No visual contract is proposed here. This document answers one
question: *what can Orbit honestly draw, and where does each fact come from?*

Orbit's sentence is **"where is the project's ability to move being spent, blocked or
wasted — and what happens if I change it?"** Every claim it makes on screen has to be
traceable to something the app already asserts. Anything that is not becomes a hole in
this document rather than a shape on the canvas.

---

## Phase A — where Orbit can obtain each truth

Classifications used:

| | |
|---|---|
| **STRUCTURED** | Exists as a typed field or row. Safe to render as causal truth. |
| **INFERRED** | Derived by existing code from structured inputs. Safe, but the derivation is the authority, not the drawing. |
| **FREE TEXT** | Exists, is required, is human prose. Renderable as words; never as geometry. |
| **MISSING** | Not obtainable today from any read Orbit has. |
| **UNSAFE** | Exists, but rendering it as Reality would be a lie. |

### The centre — what the project is heading for

| # | Truth | Class | Where it comes from |
|---|---|---|---|
| 1 | Forecast distribution | **STRUCTURED** | `SimulationResult.completionDaysSorted` — the full sorted trial array, produced by `runSimulation` (`lib/forecast/simulate.ts`) and already carried to the browser by `useProject`, which re-runs `runPortfolioSimulation` locally. Orbit reads the array; it does not sample. |
| 2 | P10 / P50 / P90 | **STRUCTURED** | `percentileDay(sorted, p)` — an exported pure helper on the same array. Orbit calls it; it does not re-implement a percentile. |
| 3 | Target | **STRUCTURED** | `Scope.targetDate` (`prisma/schema.prisma:16`), surfaced as `ProjectScope.targetDate`. Nullable, and a null target genuinely means "no judgement", not "0%". |
| 4 | Confidence at target | **INFERRED** | `confidenceAtDay(sorted, targetDays)` — counts the same trials against a day. **Target is evaluation, not input**: moving it re-counts, it never re-runs. Proven in `orbit-graph-proof.ts` G1–G3. |
| 5 | Reality vs Scenario | **STRUCTURED** | `useProject` returns `baseline` (Reality) and `preview` (Scenario) as two `Map<scopeId, SimulationResult>`. Both are real runs of the same engine over different inputs — there is no interpolated "before". |

### The first orbit — what ships

| # | Truth | Class | Where it comes from |
|---|---|---|---|
| 6 | Capabilities / features | **INFERRED** | `composeFeatures` (`lib/scope/features.ts`) groups real `WorkItem`s by their Linear parent. Authoritative for the capability layer because Scope already treats it as such — Orbit calls it with **identical arguments** (`lib/orbit/adapt.ts`) so the two surfaces cannot disagree about what a capability weighs. |
| 7 | Release inclusion | **STRUCTURED** | `Feature.bypassed`, driven by `SuiteScenario.bypassedFeatureIds` + `excludedItemIds`. Session-scoped by design: a release decision is a hypothetical until Scope commits it. |
| 8 | Estimates / load / uncertainty | **STRUCTURED** | `Feature.loadDays`, `effortDays`, `range {low, likely, high}`, `uncertainty = (high − low) / expected`. Real dispersion from the same three-point estimates the engine samples. |
| 9 | Scope-to-scope dependencies | **STRUCTURED** | `Scope.dependsOnScopeIds`. Declared, never inferred. `runPortfolioTrials` takes the later of the two in every trial, which is what makes the edge causal. |

### The second orbit — what controls movement

| # | Truth | Class | Where it comes from |
|---|---|---|---|
| 10 | Decision records | **STRUCTURED** | `Decision` rows via `/api/decisions` — title, status, owner, options, `neededBy`. |
| 11 | Gate relationships | **STRUCTURED** | `DecisionGate`, one-to-one with a Decision (`decisionId @unique`). **A Decision with no gate has no presence in Orbit**, exactly as it has none in the forecast. |
| 12 | What a gate structurally blocks | **STRUCTURED — but only at scope level** | `DecisionGate.targetScopeId`. V1 has no feature-level gate and the schema says why: features have no durable identity yet. Orbit therefore draws **Decision → Scope** and must never draw Decision → Capability. |
| 13 | Decision timing | **STRUCTURED** | `DecisionGate.low / likely / high`, sampled serially by the engine when `serial === true` and the Decision is `open`. Legacy rows carry 1/4/10. |

### The second orbit — the people

| # | Truth | Class | Where it comes from |
|---|---|---|---|
| 14 | Raw physical capacity | **STRUCTURED** | `ChannelReading.raw` = Σ(`fraction × fte`) over active people (`readChannel`, `lib/capacity/workforce.ts`). One finite embodied pool. |
| 15 | Effective capacity | **INFERRED** | `ChannelReading.effective` = raw × switch factor. **This is what the simulation actually receives**, so it is what Orbit's capacity edge carries. |
| 16 | Project allocations | **STRUCTURED** | `Allocation` rows (`personId`, `scopeId`, `fraction`). |
| 17 | Context-switch loss | **INFERRED** | `raw − effective`, with `splitRaw` / `splitPeople` naming the cause. Orbit states the loss *and* its cause; a bare "effective" figure would hide where the time went. |
| 18 | Free capacity | **INFERRED — portfolio-level only** | `readMaster().free = max(0, workforce − allocated)`. It is a property of the **whole roster**, not of a scope, so it has no place in a scope-focused ring. Deliberately omitted from the node vocabulary; it belongs to a portfolio-level view of Orbit that does not exist yet. |
| 19 | Required / shortfall capacity | **STRUCTURED** | `ChannelReading.required` — capacity a Scenario asked for that the roster does not contain. Reported, **never silently manufactured**. |

### The atmosphere — why any of this is believed

| # | Truth | Class | Where it comes from |
|---|---|---|---|
| 20 | Context sources | **STRUCTURED** | `Source` rows (`ProjectPayload.sources`) and `ContextSnapshot`. Identity and kind are structured; the content is not. |
| 21 | Evidence / provenance | **FREE TEXT (required prose)** | `DecisionEvidence.excerpt`, `DecisionGate.dependency`, `DecisionGate.evidenceForGate`, `Feature.evidence.{quote, rationale}`, `Finding.quote/rationale`. All required where they exist — a human can audit the claim. **Renderable as words, never as a quantity.** There is no "evidence strength" and Orbit must not invent one; a count of evidence rows is a count, not a weight. |
| 22 | Timeline landmarks | **STRUCTURED — and out of scope here** | `TimelineEvent` (kind, date, `temporalState`, source). Real and well-modelled, but it answers *when did things happen*, which is Timeline's sentence, not Orbit's. Including it would make Orbit a second Timeline. Deliberately omitted. |
| 23 | Cross-project dependencies | **STRUCTURED** | Same field as #9 — `dependsOnScopeIds` is already cross-project. There is no second dependency system and Orbit must not create one to make the graph look busier. |
| 24 | Scenario deltas | **STRUCTURED** | `SuiteScenario` — `capacityOverrideByScope`, `excludedItemIds`, `resolvedGateIds`, `estimateOverrideByItemId`, `bypassedFeatureIds`, `draftFeatures`, `acceptedCandidateIds`, `contextSwitchCostPct`. **Orbit adds no lever of its own.** |
| 25 | Target changes | **STRUCTURED in the database; MISSING from the read Orbit uses** | `Report.targetDate` is stored per report (`prisma/schema.prisma:199`) and the Timeline read already exposes it (`lib/timeline/entries.ts:189`). The portfolio payload does not carry it. So the history of a moving target is real and recoverable **without a schema change** — it simply is not on Orbit's current read. Not needed for the foundation; noted so nobody later concludes it does not exist. |

### Classified UNSAFE

Two things exist and must **not** be rendered as Reality:

- **`DecisionCandidate` rows and `Feature.source === "hermes"` suggestions.** These are a
  machine's claim that something is real. A pending Hermes relationship must never affect
  the forecast because Orbit drew it. Orbit marks these `candidate: true` and gives them an
  edge kind (`candidate`) whose `causal` flag is **hard-coded false**. Proven in
  `orbit-graph-proof.ts` D1–D4 and `orbit-foundation-proof.mjs` E1–E4.
- **Anything derived from drawing geometry.** Adjacency on the canvas, angular proximity,
  node count, ring membership. None of these are facts about the project. Layout lives in
  `lib/orbit/layout.ts`, is recomputed every render, and is never persisted.

### Structural truth Orbit wanted and does not have

1. **Feature-level gating.** A Decision can only block a Scope. When a decision really
   only blocks one capability, Orbit will over-state its reach. *Not a bug to route
   around* — the schema is deliberately honest about it, and inventing a
   Decision → Capability edge from prose would be the exact failure this pass exists to
   prevent. **No schema change made. Reported, not worked around.**
2. **`decisionId` on the portfolio payload's gate list.** `PortfolioScopeInput.gates` is a
   `DecisionGate` shaped `{id, label, low, likely, high}` — the decision it belongs to is
   dropped. Solved with **no schema change and no new endpoint**: the linkage is read from
   `/api/decisions`, which already joins them (`lib/orbit/adapt.ts`).
3. **Per-capability capacity.** Capacity is modelled per Scope. Orbit cannot honestly say
   "these three people are what Offline Capture is waiting on".

---

## Phase B — the node and edge vocabulary

Five node kinds and five edge kinds. Nothing was added to make the picture richer.

### Nodes

| Kind | Authoritative source | Stable id | What it means | Interactive | Scenario can affect it |
|---|---|---|---|---|---|
| `forecast` | `runSimulation` via `useProject` | `forecast:<scopeId>` | The consequence. Carries the real trial array, P10/P50/P90, target day, confidence, and Reality's array as a ghost. | Yes — the thing everything else is read against | Yes: it *is* the Scenario's answer |
| `capability` | `composeFeatures` | `capability:<scopeId>:<featureId>` | A unit of what ships, weighted by real remaining load in days | Yes | Yes — `bypass-capability` |
| `dependency` | `Scope.dependsOnScopeIds` | `dependency:<scopeId>` | Another project this one cannot finish before | Yes | Only through that scope's own levers |
| `gate` | `DecisionGate` | `gate:<gateId>` | An unanswered choice that is a serial delay on a scope | Yes | Yes — `resolve-gate` |
| `capacity` | `readChannel` | `capacity:<scopeId>` | The people, stated twice: allocated and delivered, with the loss named | Yes | Yes — `capacity-override` |

Ids are stable across reloads *and across Scenario changes*, so an object keeps its
identity while the system around it moves. **An id is never a layout index.**

Every node carries `provenance {source, ref}` — the module or table that owns the fact,
and its identifier there. The wireframe prints it verbatim in the inspector.

### Levers

`OrbitLever` is deliberately a closed union of **the three levers `SuiteScenario` already
has**. If a lever is not in this list it does not exist:

```
resolve-gate       → SuiteScenario.resolvedGateIds        (Decisions' lever)
bypass-capability  → bypassedFeatureIds + excludedItemIds (Scope's pair, written together)
capacity-override  → capacityOverrideByScope              (Portfolio's aggregate dial)
```

There is **no second Scenario store**. Proven by walking from Orbit to Forecast without a
reload and finding the same hypothetical waiting (`orbit-foundation-proof.mjs` F5–F6).

### Edges

Every edge carries a sentence. An edge that cannot say what it claims is not drawn.

| Kind | Claims | Source | Structural? | Forecast-causal? | Can be candidate-only? |
|---|---|---|---|---|---|
| `load` | "this capability's remaining work is part of what the simulation has to fit" | `composeFeatures` | Yes | **Yes** — days | No |
| `feeds` | "these people divide that scope's remaining effort" | `resolveCapacity` | Yes | **Yes** — effective FTE | No |
| `gates` | "this decision is a serial delay added to that scope before any of its work counts" | `DecisionGate.targetScopeId` | Yes | **Yes** — days, and **zero while assumed resolved** | No |
| `waits_on` | "this scope cannot finish before that one" | `dependsOnScopeIds`, honoured by `runPortfolioTrials` | Yes | **Yes** — days | No |
| `candidate` | "a machine believes this capability is part of the release" | `Feature.source === "hermes"` and not accepted | **No** | **Never** | **Always** |

`causal` is not a styling choice. It is a property of which stored field the edge reads,
and it is asserted in the model so a drawing can never imply the engine listens to
something it does not. Weights are always a real quantity with a named unit — `days` or
`fte`. **There is no unitless weight anywhere in Orbit, and no "project energy".**

### Restraint

The resting view is not capped at a magic number. Capabilities are taken in descending
real load until the shown set covers 85% of the scope's engaged load (hard ceiling 6), and
**the tail is counted on the field rather than silently dropped**. A project carried by two
capabilities shows two; one spread evenly across nine shows more. The number emerges from
the shape of the work. On the live database every project rests between 4 and 10 objects.

---

## §13 — is a radial Forecast semantically viable?

Audited against `components/instrument/LivingForecast.tsx` (785 lines).

**Portable as-is — pure, geometry-free functions of the trial array:**

- `quantileSample(sorted, n)` — resamples to a fixed-length quantile vector. This is the
  morph primitive, and it is dimensionless.
- `density(days, minDay, maxDay)` — bins with a fixed `[1,3,5,3,1]` kernel. Returns a
  per-bin mass array. A bin index maps to an **angle** exactly as well as to an x.
- `shellHeights(d, peak, amp, τ)` — isosurfaces of the same density. This is what makes
  the body volumetric *without inventing shape*, and it ports unchanged.
- `liveRange(d)` — first and last bin carrying real mass.
- `useMorph` — one eased clock over (quantiles, window, colour), retargeting from the
  currently drawn state. Knows nothing about geometry.
- confidence → bloom, and `missing = 100 − confidence`.

**Depends on horizontal geometry — must be re-derived, not ported:**

- `formPath` mirrors about a horizontal `MID` at `x = (i+0.5)/BINS × VB_W`. Cartesian by
  construction; the polar analogue is straightforward (angle from bin, radius `R ± h`).
- `ampFor` locks amplitude to on-screen **length** via an `ASPECT` constant. Radially the
  length is arc length, so the idea survives but the constant does not.
- The target rect extends `VB_W × 4` past the right edge so a target dragged off-frame
  still clips correctly. **Radially there is no "off the right edge"** — a target beyond
  the window needs an explicit rim treatment or the miss-tail silently vanishes.
- The momentum lean is `translateX(±6px)`. A rotation is *not* the same statement; it
  would imply a direction of time the model does not have.

**Semantic cues that must survive any radial form:**

1. Thickness is real trial density, mirrored — never a decorative waveform.
2. Inner shells are isosurfaces of the *same* density, not added geometry.
3. The object starts and ends where the trials do, not at the canvas edge.
4. The Reality ghost is binned into the **same** window, or the comparison is a lie.
5. No target ⇒ no judgement. A flat neutral glow, never a fabricated score.
6. Violet = the hypothetical, cyan = now.

**Verdict: viable as an ARC, not as a closed ring.**

Two real constraints, both stated rather than designed around:

- **A circle wraps and time does not.** A distribution laid across a full 360° implies the
  latest trial is adjacent to the earliest. That is a false statement about time. The
  distribution must occupy an arc with a visible start and end.
- **Equal angular width is not equal area.** At constant angle, a bin's area grows with
  radius, so uniform density reads as more ink further out. Mirroring the profile about
  the ring radius (as the Cartesian version already mirrors about `MID`) and keeping the
  ring radius large relative to the amplitude keeps the distortion small — but it is a
  distortion, and the design must acknowledge it rather than let it flatter the tail.

Everything else holds: P50 stays exact (`percentileDay` unchanged, rendered as a date),
confidence stays target-dependent (`confidenceAtDay` unchanged), the ghost works, the
miss-tail becomes an angular wedge of the same trial mass, and Scenario morphs reuse the
existing quantile interpolation. **No fake circular waveform is proposed, and none was
built** — the wireframe's centre is a plain circle with a text readout, and is a
placeholder, not a design.

---

## What the wireframe deliberately is not

`/orbit` is a development route, absent from `DESTINATIONS` and therefore from the
instrument rail. It exists to verify that a centre forecast, real capabilities, real gates,
real capacity and real dependency edges can be arranged coherently — which they can. It
makes no visual-design decisions beyond what that verification required, and its
appearance should not be read as a proposal.
