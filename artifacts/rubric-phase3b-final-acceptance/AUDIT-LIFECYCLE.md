# Audit lifecycle acceptance

## Disposable environment

- PostgreSQL 16, localhost-only port 55432
- 18 migrations applied
- Development seed: 4 scopes, 4 people, 5 allocations, 4 Findings, 24 reports, 2 Sources
- An explicit older JSA Source was added as disposable selector test data; it was not claimed as a model-produced AuditRun.
- Production Reality was never connected or mutated.

## Lifecycle results

| Check | Result |
|---|---|
| Project selection | PASS |
| Canonical graph load | PASS |
| Run Audit form and request wiring | PASS |
| Real model completion | BLOCKED — missing `ANTHROPIC_API_KEY` |
| AuditRun creation | BLOCKED — model never ran |
| Current/prior context | PASS with seeded disposable Sources |
| History/detail/return | PASS |
| Same mounted world on context changes | PASS |
| Camera stability | PASS |
| Finding review write | PASS |
| Reality protection | PASS |

The real production-build Run Audit form submitted fixture-safe notes to `/api/audit`. The UI displayed `Audit model call failed: ANTHROPIC_API_KEY is not set`. Before and after the attempt, the database remained at 2 Sources, 4 Findings and 0 AuditRuns. No source or Finding is persisted before the model boundary.

## Finding review database proof

The Finding `JSA/iTrack design ownership split unresolved` was opened from Rubric popup → View here. The existing governed action created an open, ungated Decision with `sourceFindingId` pointing to the Finding and set the Finding to `resolved`. The camera remained exactly unchanged. After the acceptance fix, the same canonical Finding remained selected even though its presentation role changed from Attention to Project World.

## Remaining credential command

Recreate/start the disposable test database, apply the existing migrations and seed, then inject the key into only the local server process. The acceptance container was removed after testing.

```sh
DATABASE_URL='postgresql://signal_p3b:signal_p3b_local_only@127.0.0.1:55432/signal_audit_p3b?schema=public' KIT_DEV_FIXTURES=1 ANTHROPIC_API_KEY='<set locally, do not paste into chat>' npm run dev -- -p 3001
```

Then run the existing JSA Run Audit form. A complete credential-gate proof must capture pre/post graph census, the new AuditRun, Findings, current/prior/History, same-frame `timeOrigin`, camera and Reality census.
