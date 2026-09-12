# Stable Demo State

## Purpose and safety

Record against deterministic disposable fixtures, never changing JSA production to create a shot. The stable demo is a two-scene fixture suite because the production tree already has two independently verified deterministic contracts: the cross-instrument delivery fixture and the immutable Reports fixture. Do not splice a live value into a fixture statement.

**Environment label on every fixture shot:** `DISPOSABLE FIXTURE · production code 6c46ce9 · not production data`.

## Scene A — Delivery instruments

Use the existing production-shaped fixture/proof data in `scripts/forecast-coverage-scope-composer-proof.ts`, `scripts/operator-cleanup-proof.ts`, and `lib/truth/productionHardeningFixture.ts`.

### Project topology

| Project | Relationship | Expected state |
|---|---|---|
| Platform | 16 covered execution items, 5.0 FTE in the coverage proof | `forecastable` |
| iTrack | Depends on Platform; one serial gate | `modeled_subset` because execution is empty and four shape Decisions are open |
| JSA | Representative accepted shape and knowledge gaps | Use for Control Room/Audit/Scope navigation |

### Scope census

- Accepted mapped capability: **1**, mapped to `SOF-1`.
- Accepted unmapped capability: **1**, zero work items, zero fake distribution.
- Execution with **NO CAPABILITY YET**: **1** item, `SOF-2`.
- Out-of-release capability: **1** deferred item.
- iTrack accepted/provisioned shape has **0 execution items** and **4 open shape Decisions**.

### Decision and dependency state

- Open ungated Decision: **Choose the operating sequence**; owner Nic; zero Forecast effect.
- Open gated Decision: **Approve the iTrack handoff**.
- Gate target: iTrack.
- Gate reason: “iTrack delivery waits for the handoff decision.”
- Gate evidence: “Accepted operating review note.”
- Gate range in the cross-instrument hardening contract: **1 / 2 / 4 days**.
- Production-shaped coverage reproduction gate: **1 / 4 / 10 days**. Use one range within a shot and label the fixture variant; never mix them.
- Declared dependency in the cross-instrument contract: JSA waits on Platform. The coverage proof also demonstrates iTrack consuming Platform's landing.

### Capacity state

- Workforce: **3.0 FTE** in the hardening fixture.
- Context-switch cost: **10%**.
- Baseline status: legacy inferred/aggregate, Forecast basis **1.0 FTE**, named raw/effective **0 / 0**.
- Named split-allocation exercise: Person A has **1.0 FTE**, allocated **0.5 JSA + 0.5 iTrack**.
- Expected per-project reading: **0.50 raw → 0.45 effective FTE** for JSA and iTrack; free FTE **0**.
- A 0.7 + 0.4 allocation is invalid and must show overallocated.

### Forecast state

Coverage proof baseline for iTrack:

- likely: **2026-09-21**;
- window: **2026-09-20 to 2026-09-22**;
- raw subset confidence at target 2026-10-31: **100%**;
- canonical confidence exposed: **no**, because state is `modeled_subset`;
- own remaining effort: **0 days**;
- inherited Platform execution: **16 items**;
- Decision delay: **1 / 4 / 10 days**.

This is an ideal teaching moment: a plausible precise number is present in the engine, but the product must not present it as a canonical full-project forecast.

Hardening/currentness variant:

- fixture NOW: **2026-09-06 03:03:40Z**;
- live Forecast as-of: **2026-08-05 12:00Z**;
- currentness: **Stale · 31d**;
- likely: **2026-09-18**;
- historical report generated: **2026-08-01 12:00Z**;
- Control Room open Decisions: **2**, gating subset: **1**;
- Audit world census: **438 objects / 543 relationships**.

## Scene B — Report-ready immutable brief

Use `healthyOwnerFixture()` through the development-only fixture routes. Expected values:

- Project: **JSA**.
- Generated at: **2026-09-04 15:00Z**.
- Target: **2026-11-15**.
- Forecast window: **2026-10-20 to 2026-11-18**.
- Likely: **2026-11-01**.
- Confidence at target: **78%**.
- Previous report: likely **2026-11-03**, confidence **73%**.
- Movement: **2 days earlier**, confidence **+5 points**.
- Remaining work: **12 tickets + 1 unticketed Finding**.
- Remaining effort: **25 / 38 / 57 days**.
- Decision delay: **1 / 3 / 6 days**.
- Scenario “Resolve the open blocking decision”: likely **2026-10-29**, **3 days earlier**, target confidence **84%**.
- Named Capacity: workforce **2.0**, JSA **1.5 raw → 1.4 effective → 1.4 Forecast FTE**, switch cost **10%**.
- Contributors: Nic **1.0 effective**, Sam **0.4 effective** from a split allocation.
- Open Decisions: one ungated address-format choice and one gated Platform cutover choice.
- Next planned milestone: **Release candidate · 2026-09-20**.
- Audit delta: one new missing-work Finding, one resolved risk, one shipped item `SOF-401`.
- Context: current; no missing sources/warnings.

Create one frozen Delivery Leadership / Weekly Update brief in the disposable database before recording. Re-open it from history and verify all values above. Never rely on the live project's existing reports.

## Project Activation scene

Use the disposable **Harbor Relay** proof or an equivalent fresh identity. Expected reviewed package:

- 3 artifacts; 5 evidence passages; 4 current intelligence heads; 1 typed relation; 5 proposals.
- 1 capability, 1 Decision, 1 Dependency, 2 source candidates.
- Accept capability, Decision, raw transcript; defer Dependency; mark derivative wiki information-only.
- Activation output: 1 Scope, 1 alias, 1 Capability, 1 Decision, 1 SourceRegistration, ContextSnapshot 01, 1 Audit, 2 Findings, 1 ProjectActivation.
- Explicit zeros: 0 work links, DecisionGates, ScopeDependencies, milestones, people, or allocations.
- Forecast after activation: `FORECAST_UNAVAILABLE` — Missing executable work mapping.

## Reset and preflight

1. Reset the disposable database/fixture, never production.
2. Run the existing proofs and record pass output.
3. Open each route once to warm assets.
4. Set viewport at or above 1440×900; 1024 px is the minimum for dense instruments.
5. Clear Scenario and select the intended project.
6. Verify every expected number on screen.
7. Create the disposable report, then stop all writes.
8. Record a 10-second slate showing the fixture label and production code SHA.

If any number differs, do not improvise. Pause, identify whether the fixture, model contract, or UI changed, update this file and the scripts together, and record only after the proofs pass.

