# Project Activation Phase 2

Project Activation is Signal's governed boundary from dormant knowledge into canonical Reality:

`ProjectBootstrap → review → activation manifest → Scope + accepted objects → ContextSnapshot 01 → first Audit`

Knowledge proposes. Only candidates with the explicit `accepted` disposition are eligible for canonicalization. Rejected, deferred, information-only, unsupported, contradictory, and unresolved material stays in the immutable bootstrap package and review ledger.

## Pre-Scope transport

`BootstrapKnowledgePackageV1` revision `1.1` is accepted at `POST /api/project-bootstraps/:id/packages`. It requires no Scope. It carries identity, provider coverage, bounded artifacts and passages, current intelligence heads, typed relations, proposals, gaps, and ambiguities. Signal's built-in scan also searches its stored source/context estate by exact identity, alias, lexical/fuzzy relevance, current heads, evidence lineage, and bounded typed relations. Semantic retrieval is reported as unavailable when it is not configured.

The repository includes `scripts/hermes-bootstrap-bridge.py`, a read-only compatibility producer for the verified KE/Hermes layout. It selects from canonical project identity and aliases before a Scope exists, takes currency only from `current-state.json`'s `is_head`, follows bounded typed graph edges, resolves linked Evidence Passages, distinguishes raw-source lineage from derivative wiki context, and produces a deterministic v1.1 package. Its optional push mode authenticates from an environment variable and targets the same package endpoint. No standalone Hermes repository was modified.

After activation, `GET /api/projects/bootstrap-identity?scopeId=…` supplies the canonical name and aliases to a producer. A later package posted to the bootstrap is frozen as external context and audited. It never mutates canonical Scope, Capability, Decision, ScopeDependency, or TimelineEvent rows.

## Activation transaction

`activateProjectBootstrap(bootstrapId, expectedRevision)` runs at PostgreSQL `Serializable` isolation. It validates the review revision and blockers before writing, resolves accepted dependency endpoints, then atomically creates Scope identity and aliases, accepted canonical objects, source registrations, the first frozen ContextSnapshot, the first Audit and Findings, the versioned activation record, and review event. Validation failure rolls back every write. A unique activation per bootstrap plus retry reconciliation makes response-loss and simultaneous-click retries converge on the original result.

Accepting a Decision does not create a DecisionGate. Person mentions do not create people or allocations. Semantic relations do not create dependencies. Capability acceptance does not imply executable work.

## Readiness

New Scopes default at activation to `executionState = not_configured`. They appear in normal Scope-backed selectors immediately. Forecast returns `409 FORECAST_UNAVAILABLE` with `Missing executable work mapping`; Reports refuses to fabricate a delivery brief from that missing truth. The first Audit explicitly reports unrepresented capabilities, execution gaps, provider gaps, contradictions, and unaccepted dependency candidates.

## Migration and rollback

Migration `20260907120000_project_activation_phase2` is additive. Existing Scope rows retain `executionState = configured`, preserving production behavior. Rollback is application-first: revert the Phase 2 application commit; additive tables/columns may remain inert. Do not drop activation data after real use without a reviewed data-retention plan.

Merge ancestry remains intentionally disabled. It needs a durable ancestry model for source candidate IDs, evidence lineage, all dispositions, and rescan-stable merged fingerprints.
