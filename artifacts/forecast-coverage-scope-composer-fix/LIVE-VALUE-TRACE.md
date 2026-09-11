# Live value trace

## Production baseline

- Git SHA: `73e93f045468d9f04a8fcf33e930f64927476d4c`
- Git tree: `034c56f8314abef6f2722458c70c7e7cb61a860f`
- Live `/api/version`: same SHA; Railway deployment `55da5081-e336-4a00-bff3-18b6def91136`
- All production investigation was read-only. No governed production write was made.

## Sep 21 path

1. iTrack (`cmsnchj1g0001pl1y7odyjqsc`) is configured to read Linear team `SOF`, project `KIT iTrack`, with Triage excluded.
2. The current owner query returns exactly zero issues. No issue, child, parent container, or WorkEstimate enters iTrack effort.
3. Seven unticketed Audit Findings are counted as attention evidence only. They do not enter simulated work.
4. `iTrack Quality` is provision-only and has no CapabilityWorkLink. Four ungated Decisions remain open as product-shape boundaries; they are not delay.
5. One open serial DecisionGate named `Test` contributes 1/4/10 days.
6. iTrack depends on Platform. Platform contributes 16 remaining items totaling 18.8/41/85.4 effort-days at inferred capacity 5.
7. The portfolio engine takes `max(iTrack own days, Platform completion)` in each trial. Platform controls the relevant trials, producing Sep 20 / Sep 21 / Sep 22.
8. Oct 31 is later than every modeled trial, so the represented subset scores 100%. That percentage says nothing about unrepresented iTrack product work.
9. The closure source stamp says `available` because Platform is available. It masks iTrack's own empty owner read.

Classification: **E = B + D**. The engine math is correct for an incomplete model, and the source/coverage presentation promotes it incorrectly. There is no evidence of an engine defect or stale/cached-input mismatch.

## Scope renderer regression

Commit `73e93f0` added an early `if (scope.items.length === 0)` return in `components/instrument/ScopeInstrument.tsx`. That return renders the text-heavy `PRODUCT SHAPE` page. Platform has 16 current items and therefore falls through to the original Scope Composer. JSA and iTrack have zero items and therefore take the alternate renderer. The operator-cleanup representation fix unintentionally became a parallel Scope UI.

The repair removes that conditional renderer and adapts governed Capability rows into the original composer grammar.
