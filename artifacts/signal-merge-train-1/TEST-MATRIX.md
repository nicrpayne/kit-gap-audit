# Release test matrix

| Gate | Result | Evidence |
|---|---|---|
| A. TypeScript | PASS | `npx tsc --noEmit`, locked dependencies |
| B. Production build | PASS | Next 15.5.22 optimized build; 35 static-generation steps completed |
| C. Lint | PASS | 0 errors, 44 pre-existing warnings catalogued |
| D. Truth Contract Hardening | PASS | canonical owner proof; open Finding contributes 0 baseline work |
| E. Cross-instrument owner/consumer fixture | PASS | 11 context-preserving routes; canonical gate, Capacity, Forecast and Timeline reads |
| F. Audit production-shaped world | PASS | exact read-only current capture and redacted mirror: 438 objects / 543 relationships |
| G. Rubric renderer/camera/gesture | PASS | 129/129 |
| H. Inspector 100× | PASS | exact camera preserved; Rubric never remounted |
| I. Trace + Inspector | PASS | Trace remained active across connected selection |
| J. Search → Inspector | PASS | canonical Finding and Passage selections landed in floating Inspector |
| K. Source / governed review | PASS | passage → source navigation; second-level review sheet; exact camera/selection restore |
| L. Hover/observer regression | PASS | all Rings/Circle/Hex/Force layouts; 180 pointer moves; live ResizeObserver; no page errors |
| M. Project/context navigation | PASS | 8 non-Reports routes in browser plus 11-route deterministic truth matrix |
| N. Reports deterministic fixtures | PASS | 9/9 |
| O. Audience × purpose recipes | PASS | 6 × 8 = 48/48 |
| P. Immutable DB roundtrip | PASS | snapshot, recipe and presentation versions round-tripped exactly |
| Q. Screen/export/print reconciliation | PASS | screen, Markdown, plain text and print share `dbv1-003f396e` |
| R. Reports deep links/context | PASS | every instrument link retained project context; gate target remained `platform` |
| S. Sites bundle security | PASS | no live owner access, credentials, secrets or publish authority |
| T. Non-Reports read-only smoke | PASS | Control Room, Audit, Decisions, Forecast, Portfolio, Scope, Dependencies, Timeline; 0 browser errors |

## Additional current DB-backed proofs

- Audit model/review lifecycle: PASS, including ungated Finding promotion, idempotence, preview-before-ticket, dismissal guard and read non-mutation.
- Audit external-intelligence ingest: PASS using the exact bridge-produced package; invalid trust rejected; ingest-only mode returned 200 and mutated no Reality.
- Audit interaction/read model: PASS with exact real payload and zero DB writes.
- Audit semantic zoom/constellation projection: PASS with exact real payload and zero DB writes.
- Audit graph/provenance/trust boundary: PASS with exact real payload.
- Reports API/history/snapshot/print boundary: PASS.

## Dependency install note

The repository's browser proof imports Playwright without declaring it in `package.json`. The proof was run with a worktree-local temporary install, after which `npm ci` restored the exact lockfile graph and the full TypeScript/lint/build gate was repeated. `package.json` and `package-lock.json` remain byte-identical to production.
