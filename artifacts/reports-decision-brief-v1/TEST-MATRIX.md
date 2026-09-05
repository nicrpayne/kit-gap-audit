# DecisionBriefV1 test matrix

Primary proof: `npx tsx scripts/reports-decision-brief-proof.tsx`

Disposable-database boundary proof: `REPORTS_DB_PROOF=1 npx tsx scripts/reports-decision-brief-db-proof.ts` while a local app instance points at the same seeded fixture database.

| Fixture | State | Assertions |
|---|---|---|
| A | Healthy project | Owner headline equality, live Timeline role, only first-class open Decisions, renderer payload identity |
| B | Stale evidence / missing providers | Missing lanes travel with delta and render as warnings |
| C | Open ungated Decision | Present under calls; exact modeled range `0/0/0` |
| D | Open gated Decision | Canonical cross-project target id/name and exact `1/3/6` range |
| E | Live Forecast differs from historical Report | Live headline retained; movement source marked historical and rendered as ReportHistory |
| F | No named Capacity | Explicit missing state, no people, no named raw/effective FTE claim |
| G | Named Capacity reconciled | Raw/effective/Forecast FTE reconcile and named contributors appear |
| H | Current/prior Audit delta | Exact new and resolved/handled Finding identities |
| I | Weakly-grounded Finding | Grounding warning and caveat travel with delta/evidence |

## Additional acceptance assertions

- An open unaccepted Finding produces zero Forecast work through `buildForecastInputs` and the brief records zero modeled baseline items.
- Production-shaped parent/child fixture proves raw 44 likely days becomes 41 executable days.
- Saved JSON remains byte-identical after source inputs are mutated; a newly assembled live read changes separately.
- Markdown, plain text and in-app/print root carry the same payload fingerprint.
- Historical movement uses `temporalRole: historical`; Timeline current Forecast uses `temporalRole: live` and label `Current Forecast`.
- Pivot prototype renders both `KIT_CONSTRUCT_MISSING` and `CAPACITY_MISSING` rather than a recommendation.
- Every fixture asserts brief headline date/confidence and open Decision count equal canonical owner inputs at the same read instant.
- Every fixture asserts the displayed executable Scope count/effort equals the live Forecast owner input.
- Audit runs that share a Source/ContextSnapshot emit `AUDIT_DELTA_UNAVAILABLE` and infer no changes.
- The database proof applies every migration, generates through the real API, verifies stored JSON/typed columns/exact Markdown, mutates an upstream Decision, proves the saved row is unchanged, reads history, renders the snapshot-only print route, then removes its proof rows.
- The database/API proof rejects Scenario generation until a complete canonical server-owned scenario read model exists, preventing live Reality from being relabeled.

## Build gates

| Gate | Expected |
|---|---|
| TypeScript | zero errors |
| ESLint | zero errors; accepted pre-existing warnings only |
| Next production build | pass |
| Prisma client generation | pass with migration fields |
| Protected Monte Carlo diff | none |
| Protected Rubric runtime diff | none |
