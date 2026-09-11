# Regression results

## Required fix proofs

- Production-shaped iTrack reproduction: Sep 20 / Sep 21 / Sep 22, raw modeled-subset confidence 100%, zero iTrack execution items, 16 Platform predecessor items, 1/4/10-day `Test` gate.
- Coverage result: iTrack `modeled_subset`, canonical confidence suppressed; Platform `forecastable`; a downstream project inherits incomplete dependency coverage.
- Composer cases: accepted + mapped, accepted + unmapped with no fake distribution, execution work + `NO CAPABILITY YET`, governed outside-release capability, and open shape Decisions.
- Compiled API: `/api/forecast` returns `confidenceAtTarget: null`, `canonicalDeliveryForecast: null`, and a separate `modeledSubsetOutcome`; Forecast Ask and report generation return `409 FORECAST_COVERAGE_INCOMPLETE`.
- Compiled browser smoke: JSA Scope, iTrack Scope, Platform Scope, iTrack Forecast, Control Room, Timeline, and Reports all returned 200 with their coverage assertions and no page errors.

## Passing suites

- `npx tsc --noEmit`
- `npm run lint` — 0 errors; 40 pre-existing warnings.
- `npm run build` — production build complete; 38 static pages generated.
- `npm run proof:forecast-coverage-scope`
- `npm run proof:production-hardening-2`
- `npm run proof:project-activation-phase1`
- `npm run proof:project-activation-phase2`
- `npm run proof:audit-change-inbox`
- `npm run proof:operator-cleanup`
- `npm run proof:operator-cleanup-db` against a fresh disposable database.
- `npm run proof:audit-change-inbox-db` against a fresh disposable database.
- `npx tsx scripts/truth-contract-hardening-proof.ts`
- `npx tsx scripts/mixer-model-proof.ts`
- `npx tsx scripts/reports-composer-audience-proof.tsx`
- `npx tsx scripts/reports-decision-brief-proof.tsx`
- Seven-surface screenshot assertions against a disposable production-shaped fixture.

## Existing proof-harness debt (non-blocking for this change)

- `scripts/scope-forecast-proof.mjs` hard-codes a Linux-only Chromium executable path and cannot launch on this macOS host. The replacement seven-surface Playwright smoke used the installed browser and passed.
- `scripts/timeline-model-proof.ts` requires a broad demo database fixture. After supplying its missing fixture rows, all behavior checks passed except its legacy assertion that compares a date-only projection with a full ISO timestamp; the canonical date-contract suite passed across five time zones.

## Remaining severity

- P0: none found.
- P1: none in the implementation. Operationally, iTrack remains unforecastable until its real Linear filter/results and CapabilityWorkLinks represent the accepted release.
- P2: make the two legacy browser/timeline proof harnesses portable and self-seeding; migrate Platform's legacy execution-only scope into governed Capability rows when the product owner is ready.

No production write or deployment occurred. The disposable local databases and container were removed after verification.
