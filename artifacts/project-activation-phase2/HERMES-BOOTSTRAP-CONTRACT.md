# Hermes pre-Scope bootstrap contract

Signal accepts `BootstrapKnowledgePackageV1` versions `1.0` and `1.1`; `1.1` is the current compiler output. The endpoint is `POST /api/project-bootstraps/:bootstrapId/packages`, so an active Scope is not required.

Revision 1.1 carries requested and detected identity, aliases/collisions/related entities, provider coverage, discovery strategy state, bounded artifacts, exact evidence with locators and lineage roots, structured current heads, typed relations, candidates, ambiguities, gaps, and warnings. Candidate fields include stable fingerprint, proposal reason, match basis, direct/inferred basis, evidence and intelligence references, currentness, retrieval band, ambiguity markers, and grounding census.

No geometry or Forecast outputs are accepted. Semantic similarity may only affect retrieval relevance. Wiki-derived evidence retains its shared lineage root and derivative status, so it cannot increase independent corroboration.

Available now: exact identity/alias, MiniSearch lexical/prefix/fuzzy retrieval over Signal-held packages, current-head matching, evidence tracing, bounded typed relation retention, and producer push. `scripts/hermes-bootstrap-bridge.py` is the read-only pre-Scope producer adapter for the verified local KE/Hermes estate. It reads the compiler allowlist and `is_head` authority, canonical object batches, linked Evidence Passages, raw sources, and derivative project wiki; it can write a package file or push with a bearer token held only in `SIGNAL_APP_PASSWORD`.

Example compile-only invocation:

```sh
python3 scripts/hermes-bootstrap-bridge.py \
  --bootstrap-id <bootstrap-id> \
  --canonical-name "<canonical project name>" \
  --alias "<alias>" \
  --source-hint "<source hint>" \
  --out /tmp/bootstrap-package.json
```

Add `--signal-url https://<signal-host>` to push to Signal. The adapter does not create or require a Scope. It only proposes a dependency from a typed Hermes dependency object, treats wiki excerpts as derivative, and reports semantic retrieval unavailable. Not available: remote Hermes health orchestration, production-ready semantic embeddings, or live pre-Scope Notion/Figma/Linear collection. Those states are emitted honestly in coverage.
