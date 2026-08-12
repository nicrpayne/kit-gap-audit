# Golden regression harness

Reconstructed regression fixture for the first real Hermes → Gap App
handshake's forensic review. See `docs/AUDIT-CALIBRATION.md` for the full
root-cause writeup this harness exists to prove/guard.

## Files

- `fixture.ts` -- the reconstructed `ProjectContextPackage` (19 evidence
  items, 2 sources: JSA wiki + JSA Infrastructure Alignment tracker) and
  the 3 pre-existing Findings (SOF-572 / SOF-510 / access-blocker) each
  golden finding is supposed to reconcile against. See its header comment
  for the reconstruction caveat -- the literal original packet isn't
  available in this repo, only the forensic classification of it is.
- `calibratedOutput.ts` -- a hand-authored stand-in for "what a
  well-calibrated model should return" for that package, in the exact v2
  candidate JSON shape (`lib/audit/prompts/audit-v1.ts`). NOT a real model
  call -- see its header comment and RUBRIC.md.
- `deterministic.test.ts` -- pure, no DB, no LLM. Tests the guardrail
  functions (`qualifierContradiction`, `resolveBlocking`,
  `withinBatchDuplicateKey`) and `normalizeAuditOutput` directly.
- `e2e.ts` -- runs the real `runAudit()` against real local Postgres, with
  only the model call swapped for `calibratedOutput.ts`'s fixture. Proves
  the deterministic layer produces every golden-set-expected outcome
  end to end (persistence, suppression, blocking downgrade, signals/
  clarifications never touching the Finding table, pre-existing Findings
  never duplicated).
- `RUBRIC.md` -- the semantic/LLM-quality dimension this harness cannot
  execute here (no `ANTHROPIC_API_KEY` in this sandbox). Score a real run
  against it once a real model call is available.

## Running

```bash
service postgresql start   # local Postgres, see HANDOFF.md

# deterministic layer -- no DB, no env needed
npx tsx scripts/golden-regression/deterministic.test.ts

# end-to-end -- needs DATABASE_URL + KIT_DEV_FIXTURES=1 (bypasses the
# live Linear call; this harness doesn't touch Linear semantics at all)
set -a; source .env; export KIT_DEV_FIXTURES=1; set +a
npx tsx scripts/golden-regression/e2e.ts
```

`e2e.ts` creates its own Scope (`"Golden Regression JSA"`, unlikely to
collide with a real Scope) and deletes everything it created in a
`finally` block, so it's safe to re-run repeatedly. If a prior run was
killed mid-flight, delete the stray Scope directly by name before
re-running.

## What this does and doesn't prove

Proves: given a model response matching the intended v2 contract (kind
routing, honest qualifiers, honest reconciliation, complete-or-absent
gate metadata), the deterministic code guardrails in `lib/audit/run.ts`
produce exactly the outcomes the golden set calls for -- 6 suppressions,
2 blocking downgrades, 2 signals, 1 clarification, zero duplicated
pre-existing Findings, exactly one blocking Finding (the one with a
genuinely complete gate).

Does not prove: that the real model, given the real prompt, will actually
produce that quality of judgment unprompted. That's RUBRIC.md's job, and
it requires a real `ANTHROPIC_API_KEY` this sandbox doesn't have.
