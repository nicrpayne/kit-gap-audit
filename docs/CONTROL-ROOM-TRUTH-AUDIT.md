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
