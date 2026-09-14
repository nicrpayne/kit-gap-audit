# Test matrix

| Contract | Result | Evidence |
|---|---|---|
| Empty PostgreSQL migration chain | PASS | 27/27 migrations, including `20260914110000_scope_linear_cross_device`. |
| TypeScript | PASS | `npx tsc --noEmit`. |
| Lint | PASS | ESLint `--quiet`; zero errors. |
| Production build | PASS | Next 15.5.22, 38/38 static pages; only pre-existing unused-variable warnings. |
| Two-context browser workflow | PASS | add/edit/link/move out/move in/Scenario isolation/Scenario commit/Back-Forward; `screenshots/browser-proof.json`. |
| DB cross-device/concurrency/idempotency | PASS | independent Prisma client read, stale revision rejected, repeated idempotency key created no duplicate, 9 owner events. |
| Forecast coverage + Scope fixture | PASS | legacy behavior, accepted mapped/unmapped and outside-release contracts. |
| JSA-shaped consequence proof | PASS | 2/10 → 4/10 → 10/10; forecastable only at complete representation; outside returns 8/10. |
| DateOnly/Instant | PASS | timezone/date contract suite. |
| Production Hardening 2 | PASS | protected Audit world 33 files / 0 changed; 438/543 fingerprint `5a798edc490b9f3c127899ad88e94aca5928ae733894f0fe813b00a1ff562961`. |
| Project Activation Phase 1 | PASS | pure and DB proof; protected owner counts unchanged. |
| Project Activation Phase 2 | PASS | pure and DB proof; activation, retry and atomicity receipts. |
| Companion | PASS | automatic job, one-winner claim, response-loss/restart retry, stale revision, offline heartbeat. |
| Audit daily refresh / Change Inbox | PASS | pure + DB cases A–L, including Scope owner recompute and idempotency. |
| Named capacity / FTE | PASS | model + disposable DB cases A–J; raw/effective conservation and over-allocation rejection. |
| Reports persistence | PASS | immutable brief snapshot, recipe, presentation version and exact Markdown round trip. |
| Project context | PASS | 189/189 across four projects and nine routes, selectors, rail, Back/Forward, no browser errors. |
| Rubric renderer/camera/gesture | PASS | 129/129. |
| Rubric protected files | PASS | Phase 3B; `_core.js`, `_flows2.js`, `_core.css`, `_icons.js` byte-identical. |
| Search | PASS | full normalization/ranking/fuzzy/disclosure/read-only/query/performance suite; 2 private-input skips. |
| Protected Monte Carlo | PASS | `lib/forecast/simulate.ts` and `lib/forecast/portfolio.ts` byte-identical to production base (matching Git blob hashes). |
| Legacy full Audit graph proof | NOT A RELEASE SIGNAL | Its optional private bridge-produced JSA package is absent; generic dev seed lacks its requirements/source fixtures. Protected 438/543, 129/129, Search, Phase 3A/3B and Change Inbox alternatives passed. |
| Legacy Timeline model proof | NOT A RELEASE SIGNAL | Repository dev seed does not create the Decision/context/candidate/Linear fixtures its own assertions require. Scope-derived invalidation is covered by current derived-revision and project-context/browser proofs. |
| Live Linear census | BLOCKED | Connector OAuth invalid grant; production debug route requires unavailable authentication. |

No production write, merge, or deployment occurred.
