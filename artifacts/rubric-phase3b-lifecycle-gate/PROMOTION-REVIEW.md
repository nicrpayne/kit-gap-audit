# Production promotion review

## Decision

STOP before production. The model-backed lifecycle gate passed, but the
production branch cannot be promoted by a normal conflict-free merge.

No production ref, deployment, database, or Reality record was changed.

## Exact topology

- Accepted experimental tip at review: `56ca39fd95565dff842534d928833acd67e3f931`
- Production tip: `edf3dfff8e952ac9c12f0c8151779f0963477292`
- Common base: `89bab199c5f912ae1b6344b7ca5fdb171ffe112c`
- Experimental-only commits relative to production: 28
- Production-only commits relative to experimental: 3

The three production-only commits are:

1. `db72637` — Rollback production to 3053a96
2. `cd00b85` — Revert "Rollback production to 3053a96"
3. `edf3dff` — Fix production Constellations parity

The resulting production tree is byte-identical to experimental ancestor
`68d5b3c4385dad6f04ea17d2963f23b483d155b8`. This means production's net
content is already present in the accepted experimental history, but Git's
best common ancestor predates both copies of that change.

`git merge-tree --write-tree production experimental` therefore reports a
content conflict in:

- `lib/audit/spatial/field.ts`

The request explicitly forbids an improvised conflict merge and requires a
stop if production cannot be promoted cleanly, so no merge was attempted.

## Recommended reconciliation

After explicit approval, use a controlled ancestry-reconciliation merge on a
temporary integration branch rooted at the accepted experimental tip:

1. merge the production tip with the `ours` strategy so both histories become
   parents while the accepted experimental tree remains unchanged;
2. prove the merge tree is byte-identical to the accepted experimental tip;
3. rerun the protected-runtime fingerprints, Phase 3A/3B proofs, lint, and
   production build;
4. push that integration merge to production with a normal non-force push.

This is appropriate only because the production tip is already tree-identical
to an experimental ancestor. It must not become a general conflict-resolution
pattern.

Until that reconciliation is approved, Railway deployment, `/api/version`,
visible marker verification, production smoke, and the real-production
hardening assessment remain intentionally unperformed.
