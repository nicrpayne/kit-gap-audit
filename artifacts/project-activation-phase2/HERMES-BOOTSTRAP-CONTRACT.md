# Hermes pre-Scope bootstrap contract

Signal accepts `BootstrapKnowledgePackageV1` versions `1.0` and `1.1`; `1.1` is the current compiler output. The endpoint is `POST /api/project-bootstraps/:bootstrapId/packages`, so an active Scope is not required.

Revision 1.1 carries requested and detected identity, aliases/collisions/related entities, provider coverage, discovery strategy state, bounded artifacts, exact evidence with locators and lineage roots, structured current heads, typed relations, candidates, ambiguities, gaps, and warnings. Candidate fields include stable fingerprint, proposal reason, match basis, direct/inferred basis, evidence and intelligence references, currentness, retrieval band, ambiguity markers, and grounding census.

No geometry or Forecast outputs are accepted. Semantic similarity may only affect retrieval relevance. Wiki-derived evidence retains its shared lineage root and derivative status, so it cannot increase independent corroboration.

Available now: exact identity/alias, lexical/prefix/fuzzy retrieval, current-head matching, evidence tracing, bounded typed relation retention, and producer transport. The operational producer is `kit-gap-bridge` version `0.2.0`, local commit `d227238a2cb95d4c2ccbae6b8e61f6e20e167543`. It reads the compiler allowlist and `is_head` authority, canonical object batches, linked Evidence Passages, raw sources, and derivative project wiki. It validates the complete package locally, writes a gitignored local artifact, and transports it with a bearer secret read only from `APP_PASSWORD`.

Example compile-only invocation:

```sh
./bin/kit-gap bootstrap \
  --canonical-name "<canonical project name>" \
  --alias "<alias>" \
  --owner-hint "<optional owner>" \
  --source-hint "<source hint>" \
  --ke-root "<local KE root>" \
  --dry-run
```

For live transport, set `KIT_GAP_BASE_URL=https://<signal-host>` and `APP_PASSWORD` in the process environment and omit `--dry-run`. The bridge creates or resolves a ProjectBootstrap through `/api/project-bootstraps`, then posts exactly once to `/api/project-bootstraps/:bootstrapId/packages` with `Authorization: Bearer <APP_PASSWORD>`. The token is not placed in the package, local receipt, command line, or log. The adapter does not create or require a Scope. It only proposes a dependency from a typed Hermes dependency object, treats wiki excerpts as derivative, and reports semantic retrieval unavailable.

The standalone repository has no configured Git remote. It must receive a reviewed remote and immutable distribution/versioning path before production operation.
