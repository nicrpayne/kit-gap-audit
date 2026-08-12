# Semantic review replay

`replay-saved-sol.ts` replays an already-saved model-evaluation result
(raw candidate JSON in the `audit-candidates-v2` shape, e.g. a
`gpt-5.6-sol` bake-off run against real first-handshake-shaped evidence)
through the CURRENT `lib/audit/normalize.ts` + `lib/audit/run.ts`
deterministic guardrails — without touching the database, without
calling any model, and without mutating the saved file.

This directory intentionally does NOT contain the historical corpus
itself (the saved raw result file) — only the replay tooling. Point it at
a local copy:

```bash
npx tsx scripts/semantic-review/replay-saved-sol.ts /path/to/openai-result.json
```

See the file's own header comment for the one stated assumption (cited
`evidenceRefs` are treated as valid — the citation safety net's
DB-existence check isn't re-derived here, since this is a read-only
evaluation with no `ContextSnapshot`). See
`docs/AUDIT-CALIBRATION.md`'s "Release-boundary qualifier coherence"
addendum for the specific defect this tooling was built to verify a fix
against.
