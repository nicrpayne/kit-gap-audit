# Project Activation / Bootstrap V1

Project Activation is Signal’s missing front door: the governed moment a historically real but untracked project becomes an active delivery project.

## Product law

Historical knowledge may propose Signal objects. It may not silently become accepted delivery Reality.

Raw sources remain immutable evidence. Evidence passages remain exact located quotations. Hermes/current-state intelligence remains external interpretation. Wiki pages remain derivative human-readable synthesis. Signal owns accepted delivery Reality, scenarios, Forecast, Timeline, Reports, and the human governance boundary. Linear is execution truth when configured; Notion and Figma retain their source roles when present.

## Lifecycle

`Draft identity → corpus discovery → immutable bootstrap package → ambiguity resolution → sectioned candidate review → deterministic Ready check → atomic activation → first ContextSnapshot → first Audit → Audit World → continuous refresh/review`

No Scope exists during discovery/review. A `ProjectBootstrap` aggregate holds investigatory identity, packages, candidate dispositions, and activation readiness. Activation creates the existing canonical `Scope` aggregate and only the individually reviewed accepted objects.

## Canonical model

- Keep `Scope` as the active project/delivery aggregate in V1; a second Project model would duplicate identity across every current route/report/snapshot.
- Allow a Scope with no Linear binding; `teamKey` becomes nullable and source status becomes `not_configured | unavailable | available`.
- Add durable `Capability` / `CapabilityWorkLink`; current Features are derived/session-local.
- Migrate `dependsOnScopeIds` to provenance-bearing `ScopeDependency` rows with parity/dual-read rollout.
- Preserve `Decision` and the separate `DecisionGate` law: accepting a Decision never gates Forecast.
- Preserve `TimelineEvent` as accepted landmark owner; add planned-vs-committed precision. Projected remains derived.
- Keep a common bootstrap candidate disposition ledger and retain original vs reviewed payloads, evidence attachments, merge ancestry, and reject/defer history.

## Retrieval and knowledge package

Discovery combines exact identity, existing lexical/fuzzy search, semantic idea retrieval, and bounded graph expansion. Results carry explicit match reasons. Semantic-only matches are capped below automatic main inclusion, and no match band is accepted automatically.

Every artifact/passage carries derivative lineage. A wiki summary and intelligence objects derived from one transcript form one evidence family. Unknown independence never defaults to independent.

Hermes sends a versioned `ProjectBootstrapPackage` keyed by `bootstrapId`, containing source inventory/coverage, artifacts, exact evidence passages, current intelligence heads, entities, typed proposals, ambiguities, gaps, and match/provenance explanations. It contains no layout geometry. Signal stores it verbatim and creates no ContextSnapshot until activation.

## Review

The workspace sections are Identity, Sources, People, Proposed Scope, Decisions, Dependencies, Milestones, Risks/Unknowns, and Missing Information. Every item supports Accept, Edit, Merge, Defer, Reject, Information only, and evidence attach/detach. Accept means “include in pending activation,” not an immediate Reality write.

Ready is blocked by unresolved identity collision, invalid accepted payloads, knowledge-derived items without resolvable direct evidence, unresolved dependency endpoints/direction, dateless accepted milestones, and unacknowledged provider/derivative-only gaps.

## Activation and first Audit

Canonical persistence is one idempotent transaction. External calls occur after commit. Signal then freezes the complete bootstrap package plus an acceptance manifest as the first ContextSnapshot and runs the first Audit against accepted canonical state, external evidence/intelligence, provider coverage, and available Linear execution truth.

Audit is expected to find what the bootstrap did not account for. Activation never certifies completeness. A no-Linear project can be active, but Forecast must report execution source not configured rather than imply zero work.

## Search V2

Keep `SignalSearchIndex`/MiniSearch for exact identifiers, titles, quotes, and fuzzy keyword search. Add a semantic retriever beside it, merge by rank, then perform bounded graph expansion. Results label `Exact title`, `Quote`, `Keyword`, `Semantic match`, or `Related via graph` and drill from concept/intelligence through exact evidence to the source location.

Recommended implementation: asynchronous approved embedding API plus Postgres/pgvector, keeping lexical fallback always available. Railway’s standard Postgres image does not currently include pgvector, so verify an extension-compatible migration or use a dedicated rebuildable pgvector service. Start with exact vector scan at modest corpus size; add HNSW only after measurement.

## Delivery phases

1. project identity + corpus discovery manifest;
2. bootstrap review + candidate ledger;
3. accepted-object persistence + first snapshot/Audit;
4. Proposed Scope/Dependencies/Milestones canonical handoffs;
5. semantic Search V2.

Full contracts, UI behavior, failure states, exact repository seams, upstream Hermes/bridge needs, prototype, and deterministic acceptance laws live in [`artifacts/project-activation-bootstrap-v1/`](../artifacts/project-activation-bootstrap-v1/README.md).

## Verdict

**PROJECT ACTIVATION V1 READY FOR IMPLEMENTATION**

