# Release-gate evidence

| Gate | Result |
|---|---|
| Production SHA/tree fetch verification | Pass |
| DateOnly/Instant contract | Pass |
| Timezone matrix | Pass — America/Chicago, UTC, America/Los_Angeles, Europe/London, Asia/Tokyo |
| DST + month/year boundaries | Pass |
| Cross-surface local browser date | Pass — Sep 18 on Control Room, Reports, Forecast, Portfolio/Capacity, Scope, Timeline |
| TypeScript | Pass |
| Production build | Pass — 35 pages |
| ESLint | Pass — 0 errors, 44 accepted warnings |
| Production Hardening 2 fixture | Pass |
| Truth contracts | Pass |
| Reports fixtures/composer | Pass — 9 fixtures; 6 audiences × 8 purposes |
| Reports disposable DB | Pass — 20 migrations, generation, immutable JSON/Markdown, history, print, persistence |
| Orbit graph/state | Pass |
| Audit protected files/fingerprint | Pass — 33/0; `5a798ed…` |
| Rubric renderer/gesture | Pass — 129/129 |
| Rubric Phase 3/3B + Audit Search | Pass |
| Project/context matrix | Pass — 189/189 |
| Audit layouts/search/inspector/trace/hover | Pass — 38/38 after removing two harness races; product files unchanged |
| Local non-Reports smoke | Pass |

The Audit browser proof now waits for the governed review sheet's loaded
variant, measures only visible hit targets, and enters keyboard focus before
asserting `:focus-visible`. These are proof-harness corrections; no protected
Audit product file changed.

Production promotion and authenticated production smoke are deliberately not
claimed here. They belong to the forward release candidate after its history
and tree-equivalence proofs pass.
