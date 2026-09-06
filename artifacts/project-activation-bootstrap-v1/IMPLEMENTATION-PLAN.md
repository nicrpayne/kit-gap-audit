# Implementation plan

Design reference: production `bce38dde332fa1d049363fe502c5921326556311`, verified from Git and deployed `/api/version` on 2026-09-06. When implementation begins, fetch origin and use **current production** as authority. Do not implement from an old design SHA or unstable branch internals.

## Current seams found in the repository

| Area | Current seam | Constraint / opportunity |
| --- | --- | --- |
| Project identity | `Scope` in `prisma/schema.prisma`; `POST /api/scopes`; `/scopes`; `ScopesManager` | Scope requires `teamKey` and is immediately visible as Reality; unsuitable as a pre-activation draft |
| Global entry | `components/instrument/CommandMenu.tsx`; `InstrumentShell.tsx` | Add Project opens one compact route-backed sheet from normal project control; global Search remains suite-wide |
| Project selection | `useProjectParam`; suite payload from `/api/instrument/project` | Only active Scopes should enter normal selectors; bootstrap routes use `bootstrapId` |
| Context transport | `lib/context/package.ts`, `validate.ts`, `snapshot.ts`, `/api/refresh` | Strong immutable/idempotent pattern; add sibling bootstrap contract rather than create early ContextSnapshot |
| Source policy | `SourceRegistration`, source APIs, `sourcePolicy.ts` | Reuse roles/statuses after activation; review suggestions pre-activation |
| External intelligence | `lib/audit/intelligence.ts` | Already structurally read-only; bootstrap may display same objects without promotion |
| Decision candidates | `DecisionCandidate`, `lib/decisions/candidates.ts`, accept/dismiss APIs | Correct boundary but too type-specific for whole bootstrap; share disposition ledger and reuse promotion logic |
| Timeline candidates | `TimelineEventCandidate`, `lib/timeline/candidates.ts`, accept/dismiss APIs | Correct date/acceptance laws; reuse validators and canonical writer |
| Scope concepts | `lib/scope/features.ts`, `ScopeInstrument`, `SuiteScenario.draftFeatures` | No durable Capability/Feature owner; must be added before candidate acceptance |
| Dependencies | `Scope.dependsOnScopeIds`; `DecisionGate`; Orbit adapters | Cross-Scope dependency lacks provenance; DecisionGate is correctly separate |
| Audit | `loadAuditGraphInputs`, `runAudit`, `AuditRun`, `/api/audit` | `runAudit` assumes Linear; first Audit needs typed unavailable/not-configured behavior |
| Search | `SearchDocument`, `SignalSearchIndex`, search lens, `docs/SIGNAL-SEARCH.md` | Level 1 seam explicitly anticipates vector store beside MiniSearch |
| Visual system | semantic tokens in `app/globals.css`; shared shell components | Use current tokens; do not block on portfolio-wide restyling |

## Phase 1 — Project identity + corpus discovery manifest

Outcome: operator can create a draft identity, launch/retry a scan, resolve collisions, and inspect provider/artifact coverage. No candidate acceptance and no Scope creation.

### Signal changes

Models/migration:

- `ProjectBootstrap`
- `BootstrapPackage`
- `BootstrapScan` (job id, stage, provider statuses, started/completed/error timestamps)

Likely files:

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_project_bootstrap_foundation/migration.sql`
- `lib/bootstrap/package.ts`
- `lib/bootstrap/validate.ts`
- `lib/bootstrap/hash.ts`
- `lib/bootstrap/identity.ts`
- `lib/bootstrap/status.ts`
- `app/api/project-bootstraps/route.ts`
- `app/api/project-bootstraps/[id]/route.ts`
- `app/api/project-bootstraps/[id]/scans/route.ts`
- `app/api/project-bootstraps/[id]/scan-status/route.ts` (or server-sent events if already supported; polling is sufficient V1)
- route-backed Add Project sheet from the normal project selector (a thin `/projects/new` fallback may remain for deep links)
- `app/projects/bootstrap/[id]/page.tsx`
- `components/bootstrap/AddProjectSheet.tsx`
- `components/bootstrap/ScanProgress.tsx`
- `components/instrument/CommandMenu.tsx`
- `components/ScopesManager.tsx` / `/scopes` copy to separate identity from execution binding

APIs:

- `POST /api/project-bootstraps`
- `GET/PATCH /api/project-bootstraps/:id`
- `POST /api/project-bootstraps/:id/scans`
- `GET /api/project-bootstraps/:id/scan-status`
- authenticated callback `POST /api/project-bootstraps/:id/packages` for Hermes push, or Signal pulls a completed package from bridge; choose one transport and keep idempotency identical.

Proofs:

- creating draft changes no `Scope`, Forecast, Decision, Timeline, source registration, or snapshot row;
- duplicate normalized name collision;
- same package retry vs identity conflict;
- provider outage retained in manifest;
- geometry rejection;
- current project selectors unchanged.

### Hermes/bridge required

- corpus inventory with provider availability/currentness;
- exact identity/alias/entity lookup;
- lexical retrieval over wiki/intelligence/evidence/raw sources/imports/connectors;
- result lineage (`derivativeOf`, `lineageRootIds`);
- stable artifact/passage ids and source-native locators;
- content-addressed bootstrap package assembly;
- asynchronous job/callback or pull handle.

Semantic retrieval may be stubbed behind an interface in Phase 1, but the manifest must already distinguish absent/not-run from zero results.

## Phase 2 — Bootstrap review + candidate objects

Outcome: complete review workspace and durable dispositions. Still no canonical writes.

Models/migration:

- `BootstrapCandidate`
- `BootstrapEvidenceLink`
- optional append-only `BootstrapReviewEvent` if audit requirements exceed row timestamps.

Likely files:

- `lib/bootstrap/candidates.ts` (discriminated proposal validators)
- `lib/bootstrap/project.ts` (package → review projection)
- `lib/bootstrap/disposition.ts`
- `lib/bootstrap/readModel.ts`
- `app/api/project-bootstraps/[id]/candidates/route.ts`
- `app/api/project-bootstraps/[id]/candidates/[candidateId]/route.ts`
- `app/api/project-bootstraps/[id]/candidates/[candidateId]/merge/route.ts`
- `app/api/project-bootstraps/[id]/readiness/route.ts`
- `components/bootstrap/ReviewWorkspace.tsx`
- `components/bootstrap/SectionRail.tsx`
- `components/bootstrap/CandidateList.tsx`
- `components/bootstrap/CandidateInspector.tsx`
- `components/bootstrap/EvidenceTrace.tsx`
- `components/bootstrap/ReadySummary.tsx`

Reuse/adapt:

- provenance grammar from `lib/audit/provenance.ts`;
- source/knowledge visual families from Audit graph tokens;
- disposition semantics from Decision/Timeline candidate APIs;
- do not reuse those immediate acceptance APIs because bootstrap acceptance must remain pending until atomic activation.

Proofs:

- every action updates only bootstrap tables;
- edit preserves original proposal;
- merge preserves all evidence ancestry;
- detaching last evidence blocks knowledge-derived acceptance readiness;
- operator assertion can be ready only with explicit acknowledgment;
- rejection/defer survives identical package refresh;
- changed evidence fingerprint resurfaces with history;
- derivative repetition contributes one lineage root.

### Hermes/bridge required

- typed candidate compiler for identity/source/person/capability/decision/dependency/gate/milestone/risk/unknown/commitment;
- `whyProposed`, evidence refs, intelligence refs, currentness, grounding inputs, duplicate hints;
- contradiction sets and stable candidate keys/fingerprints;
- alias/entity collision explanations;
- gaps/insufficient-evidence output.

## Phase 3 — Accepted-object persistence + first snapshot/Audit

Outcome: one explicit activation creates canonical identity and accepted objects, freezes first snapshot, and runs first Audit.

Models/migration:

- make `Scope.teamKey` nullable;
- add Scope aliases/description/owner/activation trace fields;
- add activation idempotency/manifest fields;
- add `AuditRun.kind`, status, provider coverage/partial metadata, idempotency key as needed.

Likely files:

- `lib/bootstrap/readiness.ts`
- `lib/bootstrap/activate.ts` (transaction; no external calls)
- `lib/bootstrap/acceptanceManifest.ts`
- `lib/context/package.ts` + `validate.ts` for explicit contract 2.0/additive acceptance manifest
- `lib/context/snapshot.ts`
- `lib/linear.ts` for typed configuration/availability result
- every caller of `getScopedIssues`: `lib/audit/run.ts`, `lib/audit/graphInputs.ts`, `lib/forecast/compute.ts`, `lib/estimate/runForScope.ts`, `lib/timeline/entries.ts`, and debug/route callers
- `app/api/project-bootstraps/[id]/activate/route.ts`
- `app/api/project-bootstraps/[id]/activation-status/route.ts`
- `components/bootstrap/ActivationProgress.tsx`
- `components/bootstrap/FirstAuditHandoff.tsx`
- `lib/audit/run.ts`, `lib/audit/graphInputs.ts`, `lib/audit/truth.ts`, `lib/audit/graph.ts`

Compatibility rules:

- existing Scopes migrate unchanged with Linear configured;
- all ordinary project selectors query active Scopes only if lifecycle is added;
- Forecast on no-Linear Scope returns a typed `unavailable` read model, never 0 work / fake likely date;
- Audit can run partial with no Linear and records that absence;
- activation canonical transaction completes before network/model work;
- one snapshot id threads into first Audit, as current `/api/refresh` already demonstrates.

Proofs:

- injected failure at each canonical write rolls back all;
- activation retry returns identical ids;
- accepted item has provenance and source candidate back-reference;
- deferred/rejected/info candidates have no canonical rows;
- first Audit sees accepted canonical state plus external intelligence/evidence;
- bootstrap does not suppress missing-work/gap findings;
- no Linear state is honest; Linear outage cannot prove absence.

## Phase 4 — Proposed Scope, Dependencies, Milestones handoffs

Outcome: each accepted candidate persists through its correct owner and becomes continuously reviewable after activation.

Models/migrations:

- `Capability`, `CapabilityWorkLink`;
- `ScopeDependency`, `ScopeDependencyEvidence`;
- `TimelineEvent.planningState`, `sourceBootstrapCandidateId`;
- canonical object candidate back-references as needed;
- migrate `dependsOnScopeIds` with parity phase.

Likely Scope files:

- `lib/scope/features.ts`
- `lib/instrument/useProject.ts`
- `lib/forecast/compute.ts` (read model only; no simulation math)
- `components/instrument/ScopeInstrument.tsx`
- `components/instrument/FeatureDetail.tsx`
- `app/api/capabilities/route.ts`
- `app/api/capabilities/[id]/route.ts`
- `app/api/capabilities/[id]/work-links/route.ts`

Likely dependency files:

- `lib/orbit/graph.ts`, `adapt.ts`
- `lib/forecast/compute.ts`, `portfolio.ts` adapter at the dependency input seam
- `app/api/scope-dependencies/route.ts`
- `components/OrbitPageClient.tsx`

Likely milestone files:

- `lib/timeline/candidates.ts`, `entries.ts`, `plan.ts`
- `app/api/timeline-events/route.ts`
- `app/api/timeline-candidates/[id]/accept/route.ts`
- `components/timeline/AddEventTool.tsx`, `TimelineInspector.tsx`

Migration sequence for dependencies:

1. create row model;
2. backfill array entries as migrated;
3. parity proof: same samples/dates/graph edges;
4. dual-read rows preferred, detect disagreement loudly;
5. switch writers;
6. remove array only in a separate cleanup release.

Proofs:

- capability with no work has zero load and visible gap;
- mapping Linear root does not double-count work;
- accepted missing-work candidate does not duplicate its forecast placeholder;
- scope dependency parity with existing array;
- semantic `related_only` cannot persist canonical dependency;
- Decision acceptance cannot create gate;
- candidate milestone cannot store committed without explicit confirmation;
- projected date never persists as commitment.

## Phase 5 — Semantic Search V2

Outcome: hybrid exact/lexical/semantic/graph retrieval shared by global Search and bootstrap.

Infrastructure:

- `SemanticRetriever` provider interface;
- canonical `SearchRecord`/content-hash queue in primary Postgres;
- pgvector in verified primary database or dedicated Railway pgvector service;
- asynchronous embedding worker;
- exact vector scan first; HNSW only after benchmarks.

Likely files:

- `lib/search/document.ts` extracted/shared from `lib/audit/searchDocument.ts`
- `lib/search/lexical.ts` adapter around existing `SignalSearchIndex`
- `lib/search/semantic.ts`
- `lib/search/graphExpand.ts`
- `lib/search/fuse.ts`
- `lib/search/reasons.ts`
- `lib/search/provenance.ts`
- `app/api/search/route.ts`
- `app/api/search/[id]/trace/route.ts`
- global Search UI and Audit search adapter
- worker entry point under `scripts/` or a dedicated service package, plus Railway service config documented outside current `railway.json` until chosen.

Prisma does not need to own vector operations. Use a small parameterized SQL repository for extension types/operators and keep canonical metadata in Prisma-managed tables.

Proofs:

- every current Level 1 query/ranking invariant remains;
- exact quote/id always outranks semantic neighbor;
- semantic hit labels why it matched without distance;
- graph-only never outranks primary hits;
- wiki derivative collapsed with source lineage;
- source drilldown resolves exact passage/location where available;
- embedding outage preserves Level 1;
- stale/mismatched embedding model rows excluded;
- cross-project authorization enforced before retrieval and graph expansion.

## Exact missing Hermes/bridge capabilities

The current Signal repository has transport and external-intelligence projection but explicitly documents no real Hermes integration. Implementation cannot complete without these upstream capabilities:

1. **Bootstrap-before-scope transport** — current `ProjectContextPackage` requires Signal `scopeId`; bridge needs a bootstrap package keyed by `bootstrapId`.
2. **Corpus inventory and provider coverage** — explicit attempted/available/partial/unavailable provider rows with source observed-at timestamps.
3. **Project entity/alias registry** — stable identities, collisions, same/related/distinct resolution; current topic tags are not Scope ids and cannot safely attribute projects.
4. **Deterministic exact + lexical retrieval across all corpus layers** — with matched fields and query variants.
5. **Semantic retrieval interface** — later pgvector/shared index, with model version and explainable match reason.
6. **Graph-aware expansion** — typed relations and bounded paths, including provenance/derivative lineage.
7. **Derivative lineage** — wiki/intelligence/passages must trace to raw origin roots; missing means unknown, never independent.
8. **Stable passage anchors/deep links** — quote hash, char/block/segment/row locator, offset unit, provider link.
9. **Typed bootstrap candidate compiler** — capability, Decision, dependency, gate, milestone, person/team, risk/unknown/commitment, with `whyProposed` and citations.
10. **Dependency assertion basis** — explicit vs structured vs semantic; semantic similarity cannot be causal.
11. **Date normalization trace** — source timestamp/timezone/precision and original phrase; no prose-only invented date.
12. **Contradiction/current-head sets** — stable head ids, supersession chains, and conflicts rather than one flattened “current” answer.
13. **Stable candidate keys/fingerprints** — dispositions survive refresh; materially changed evidence resurfaces.
14. **Incremental refresh/delta packages** — changed/tombstoned artifacts, evidence, heads, candidate deltas, coverage changes.
15. **Search/source doors** — structured intelligence → passage → exact source location; wiki explicitly derivative.

No Hermes/bridge repository changes belong in this tranche. These are versioned interface requirements and acceptance fixtures for that separate work.

## Release slicing and gates

Each phase is a separately reviewable branch/release. Do not combine schema foundation, candidate UI, canonical Capability migration, dependency migration, and vector infrastructure into one release.

Go/no-go gates:

- Phase 1: no Reality writes proven.
- Phase 2: disposition history/provenance law proven.
- Phase 3: atomic activation + first Audit, including no-Linear behavior.
- Phase 4: Scope/Dependency/Timeline parity and no double-count.
- Phase 5: Level 1 regression suite + grounded semantic drilldown + fallback.
