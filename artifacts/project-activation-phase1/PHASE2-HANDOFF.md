# Phase 2 handoff: activation

Phase 1 stops before canonical activation. Phase 2 should implement one idempotent transaction only after these accepted prerequisites are ready:

1. Make `Scope.teamKey` nullable and prove every Linear/Forecast reader distinguishes `not_configured`, `unavailable`, and `available`.
2. Add durable Capability/CapabilityWorkLink; do not persist accepted Proposed Scope into the session-local Feature projection.
3. Add provenance-bearing ScopeDependency with dual-read/backfill parity before replacing `dependsOnScopeIds`.
4. Add Timeline planning precision and bootstrap trace fields without turning candidate mentions into commitments.
5. Implement deterministic readiness: identity collision resolved; accepted typed payloads valid; evidence/explicit operator-assertion acknowledgements present; dependency direction/endpoints known; milestone dates present; coverage gaps acknowledged.
6. Implement one atomic/idempotent activation request that creates Scope and individually accepted canonical owners, never deferred/rejected/information-only items.
7. Freeze bootstrap package plus acceptance manifest as the first ContextSnapshot after commit.
8. Run first Audit after the canonical transaction. External calls occur after commit and expose partial provider state.
9. Implement merge-to-existing/canonical ancestry before enabling Merge in Review.

Bridge dependency: add generic identity/alias discovery and a `bootstrapId` package mode that does not require resolving a live Scope or SourceRegistration first. Until then, Signal can accept an inbound versioned bootstrap package but can only initiate scans over Signal-held knowledge.

