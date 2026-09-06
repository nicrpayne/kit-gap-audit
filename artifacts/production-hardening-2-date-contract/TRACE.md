# End-to-end trace

## Owner semantics

The value is category **C: simulation completion day index plus project base
date**.

`lib/forecast/simulate.ts` samples completion-day counts, selects P50, and
uses UTC calendar-day arithmetic to add the rounded day index to `startDate`.
`SimulationResult.likelyDate` is a JavaScript `Date` only as an internal
arithmetic carrier. Its product meaning is a delivery day, not an instant.

Production-shaped raw value at the failed deployment boundary:

```text
2026-09-18T03:03:40.000Z
```

Canonical delivery read-model value:

```text
2026-09-18
```

No forecast percentile, capacity, dependency, gate, or target-confidence
calculation was changed.

## Drift point

UTC-safe Forecast, Portfolio/Capacity, Scope, and Timeline formatters read the
UTC calendar components and displayed Sep 18. Control Room, Reports, and the
Portfolio inspector called browser-local `toLocaleDateString` on the same
`Date`. At `03:03:40Z`, America/Chicago and America/Los_Angeles are still on
Sep 17. That representation boundary created the contradiction.

## Canonical boundary

`lib/time/dateContract.ts` now owns:

- branded `DateOnly` (`YYYY-MM-DD`) and `Instant` (offset-bearing ISO) types;
- strict serialization through `toDateOnly` and `toInstant`;
- UTC-component DateOnly formatting through `formatDateOnly`;
- explicitly timezone-selected Instant formatting through `formatInstant`.

Owner read models in Forecast, Reports, and Timeline now serialize delivery
days as `YYYY-MM-DD`. Surface formatters call the central DateOnly contract.
Source currentness, report generation, and other actual timestamps retain
Instant semantics.

## Consumer migration

- Control Room headline, command workspace, field, inspector, target and
  dependency prose
- Reports live label, history, Decision Brief, audience brief, exports,
  snapshots, and generated Markdown
- Forecast current page, Instrument hero, living forecast, ranges and inputs
- Portfolio headline, field, capacity/scenario inspector and date axis
- Scope likely outcome and bounds
- Timeline live/historical forecast read models, lanes, geometry and display
