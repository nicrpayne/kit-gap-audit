# Signal Project Activation / Bootstrap V1

Status: **ready for implementation**

Production reference: `bce38dde332fa1d049363fe502c5921326556311`

Reference branch: `claude/product-timeline-audit-a72dmg`

This SHA was verified against both `origin/claude/product-timeline-audit-a72dmg` and the deployed `/api/version` endpoint on 2026-09-06. Implementation must fetch origin again and treat then-current production as authority; these artifacts do not depend on branch internals.

## The product sentence

> I am officially tracking this project now.

Activation reconstructs a dormant project world from historical knowledge, asks a human to govern every proposed delivery object, freezes the first accepted context boundary, and immediately runs the first Audit. Historical knowledge can propose Signal Reality. It cannot silently become Signal Reality.

## Recommended lifecycle

`Draft identity → Discover corpus → Compile package → Resolve ambiguity → Review candidates → Ready check → Activate atomically → Freeze first ContextSnapshot → Run first Audit → Open Audit World → Refresh continuously`

The operator-facing instrument compresses those internal states to `Identity → Scan → Review → Activate → Audit`. Review is the dominant workspace; its sections include Proposed Scope rather than sending the operator through a separate wizard stage. Global Search is suite infrastructure, not part of activation.

The pre-activation workspace is deliberately not Forecast. Candidate decisions, dependencies, milestones, people, and scope concepts have zero simulation effect. Activation writes only the items the operator explicitly accepted, edited-and-accepted, or linked to an existing canonical object.

## Canonical architecture decision

V1 should add a pre-Reality `ProjectBootstrap` aggregate and keep the existing `Scope` id as the active project/delivery aggregate.

- A `ProjectBootstrap` exists before a `Scope`; it owns draft identity, scan runs, the immutable bootstrap package, candidate disposition history, and activation readiness.
- The activation transaction creates the `Scope`, accepted source registrations, durable capabilities, decisions, dependencies, and timeline landmarks.
- `Scope.teamKey` must become nullable because Linear is execution truth **when present**, not a prerequisite for acknowledging that a project exists. Every Linear reader must distinguish `not_configured`, `unavailable`, and `available`.
- A durable `Capability` plus `CapabilityWorkLink` is required before Proposed Scope can honestly persist acceptance. The present `Feature` is a derived/session-local read model, not a canonical owner.
- `Scope.dependsOnScopeIds` should be migrated to provenance-bearing `ScopeDependency` rows. Arrays cannot retain why a dependency was accepted or which evidence supported it.
- `DecisionGate` remains the only serial forecast constraint caused by a decision. A generic dependency never becomes a gate by implication.
- `TimelineEvent` remains the owner of accepted landmarks; candidate mentions stay outside Timeline Reality. Projected dates remain derived Forecast readings.

See [DATA-CONTRACTS.md](./DATA-CONTRACTS.md) for the proposed models and versioned transport contract, and [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) for migration order.

## Artifact map

| Artifact | Decision it contains |
| --- | --- |
| [PRODUCT-LIFECYCLE.md](./PRODUCT-LIFECYCLE.md) | State machine, activation transaction, invariants |
| [ADD-PROJECT.md](./ADD-PROJECT.md) | Entry points, form, scan mode, honest copy |
| [CORPUS-DISCOVERY.md](./CORPUS-DISCOVERY.md) | Deterministic + semantic retrieval, lineage and thresholds |
| [BOOTSTRAP-PACKAGE.md](./BOOTSTRAP-PACKAGE.md) | Hermes → Signal package contents and validation |
| [REVIEW-WORKSPACE.md](./REVIEW-WORKSPACE.md) | Candidate review interaction and information architecture |
| [PROPOSED-SCOPE.md](./PROPOSED-SCOPE.md) | Capability candidates, manual reverse flow, canonical owner |
| [PROPOSED-DEPENDENCIES.md](./PROPOSED-DEPENDENCIES.md) | Dependency taxonomy and causal safeguards |
| [PROPOSED-MILESTONES.md](./PROPOSED-MILESTONES.md) | Candidate/planned/committed/projected rules |
| [FIRST-AUDIT.md](./FIRST-AUDIT.md) | First snapshot, graph build, Audit handoff |
| [SEARCH-V2.md](./SEARCH-V2.md) | Hybrid retrieval architecture and deployment recommendation |
| [CONTINUOUS-IMPROVEMENT.md](./CONTINUOUS-IMPROVEMENT.md) | Incremental refresh loop and disposition memory |
| [DATA-CONTRACTS.md](./DATA-CONTRACTS.md) | Versioned contracts and proposed persistence model |
| [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) | Exact phases, likely files/APIs, bridge boundaries |
| [TEST-MATRIX.md](./TEST-MATRIX.md) | Fixtures, acceptance laws, failure coverage |
| [prototype/index.html](./prototype/index.html) | Build-excluded operator prototype: five-state activation plus global Search |
| [screenshots/](./screenshots/) | Browser-verified prototype evidence |

## Existing architecture this respects

- `ProjectContextPackage` 1.1 remains the active-project context transport. Bootstrap gets a sibling package because it exists before a `scopeId`.
- `ContextSnapshot` remains immutable and is not created merely because a scan finished. The first one is created at activation.
- External intelligence remains read-only and cannot write Signal objects.
- `DecisionCandidate` and `TimelineEventCandidate` demonstrate the right candidate boundary, but the activation workspace needs a shared, versioned disposition ledger across all candidate kinds.
- `SignalSearchIndex` / `SearchDocument` remain the Level 1 exact/lexical path. Semantic retrieval sits beside them and merges results; it does not replace exact identifiers or quotes.
- Audit remains the mechanism that exposes what the accepted bootstrap failed to cover. Bootstrap is not allowed to declare itself complete.

## Prototype

The prototype uses the invented project **Harbor Relay**. It contains no claims about any real future product or implied staffing. Open `prototype/index.html` directly or serve the repository root and navigate to the artifact. It demonstrates:

1. compact Add Project sheet from the normal project control;
2. asynchronous knowledge scan with safe partial entry;
3. primary Bootstrap Review workspace with Proposed Scope as a section;
4. explicit activation manifest and `ACTIVATE PROJECT` act;
5. first Audit handoff;
6. suite-wide Search V2 result drilldown from global Search / `⌘K`.

The prototype is static HTML/CSS/JavaScript under `artifacts/`; Next does not import or build it.
