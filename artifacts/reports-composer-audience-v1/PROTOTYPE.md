# Prototype

Development-only routes:

- `/reports/composer/fixture` — interactive deterministic composer.
- `/reports/composer/fixture/print` — browser-print surface.

The fixture uses the same `assembleDecisionBrief()` contract and deterministic owner fixture as Reports V1. It includes a gated Decision targeting Platform, an ungated Decision with zero modeled delay, reconciled named Capacity, current/prior Audit delta, a declared unavailable dependency, one owner-provided scenario, a live Forecast, a target without a canonical commitment, and deep links with project context.

The production Reports page gains audience/purpose selection for generation and renders the stored recipe when present. Existing DecisionBriefV1 rows without a recipe continue through the original renderer. Pre-V1 Report rows remain on the legacy immutable path.
