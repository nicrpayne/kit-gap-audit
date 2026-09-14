# Forecast consequences

The protected Monte Carlo implementation is byte-identical to the production base. The change is limited to the deterministic owner-to-input projection.

## Input law

- If a Scope has no canonical Capability rows, all current Linear work follows the legacy forecast path.
- Once governed product shape exists, only active work links owned by accepted capabilities enter modeled remaining execution.
- Work linked to outside/future capabilities is claimed—so it cannot leak through the legacy parent grammar—but excluded from active release inputs.
- Current Linear work not represented by accepted links remains visible in the execution tray and keeps coverage at `modeled_subset` with reason `execution_work_unmapped`.
- No issue estimate means the existing explicit placeholder estimate/provenance path, never zero duration.

## Automatic consequence receipt

Every accepted Capability create/edit/move/link/unlink and Scope configuration PATCH:

1. commits the owner transaction;
2. increments `ProjectDerivedState.realityRevision`;
3. marks Forecast, Timeline, Control Room, Reports, Scope and Capacity consumers stale;
4. eagerly recomputes Forecast/coverage/readiness;
5. records `computedRevision == realityRevision` when current;
6. tells all in-browser instruments to re-read, while other devices pick it up on ordinary navigation/focus/reload/interval.

## Deterministic JSA-shaped proof

| State | Modeled / execution | Coverage | Missing estimate items | P50 | Window |
|---|---:|---|---:|---|---|
| Crew + Arc-Angel only | 2 / 10 | modeled_subset | — | 2026-09-20 | Sep 19–22 |
| Notifications linked | 4 / 10 | modeled_subset | — | 2026-09-25 | Sep 23–26 |
| All fixture work represented | 10 / 10 | forecastable | 4 | 2026-09-27 | Sep 25–28 |
| Notifications moved outside | 8 / 10 | modeled_subset | 4 | 2026-09-24 | Sep 22–25 |
| Notifications restored | 10 / 10 | forecastable | 4 | 2026-09-27 | Sep 25–28 |

These values prove propagation and direction only. They are not a prediction of the real JSA date.
