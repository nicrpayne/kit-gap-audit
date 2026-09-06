# Data contracts and canonical model

This document proposes contracts, not a migration. The implementation phase must convert these shapes into validated TypeScript and Prisma only after the slice-specific proof passes.

## Existing model comparison

| Existing model | What it owns today | Activation implication |
| --- | --- | --- |
| `Scope` | project label, Linear filter, target/capacity, dependency id array, and parent relations for reports/context/decisions/timeline | Keep as active project aggregate in V1; do not introduce a competing `Project` selector identity |
| derived `Feature` in `lib/scope/features.ts` | session/read model composed from Linear roots, inferred Findings, and manual drafts | Cannot own accepted Proposed Scope; add durable `Capability` |
| `Scope.dependsOnScopeIds` | canonical cross-Scope forecast floor | Cannot retain provenance or candidate ancestry; migrate to `ScopeDependency` |
| `Decision` + `DecisionGate` | accepted choice; optional explicit serial scope-wide forecast gate | Preserve. Accepting a decision candidate never implies a gate |
| `TimelineEventCandidate` + `TimelineEvent` | candidate landmark and accepted landmark | Preserve semantics; add planned-vs-committed precision |
| `ContextSnapshot` | immutable accepted active-project context package | Do not create during scan; first create at activation |
| `SourceRegistration` | mutable recurring-source policy | Candidate registrations may be reviewed pre-activation, then created at activation |

## Recommended persistence model

### `ProjectBootstrap`

Pre-Reality aggregate. Suggested fields:

```text
id
status                 draft | discovering | identity_review | reviewing | ready | activating | activated | archived
canonicalName
aliases[]
description?
ownerLabel?
sourceHints JSON
identityResolution JSON?
reviewRevision Int
activePackageId?
activePackageHash?
coverageAcknowledgedAt?
activatedScopeId? unique
activationRequestId? unique
createdAt / updatedAt / activatedAt?
```

It has no relation to Forecast-owned tables before activation.

### `BootstrapPackage`

Immutable compiler delivery:

```text
id
bootstrapId
packageId
packageVersion
producer
package JSON             // verbatim ProjectBootstrapPackage
packageHash
compilerVersion
generatedAt
acceptedForReviewAt
supersedesPackageId?
@@unique([producer, packageId])
```

The package is not a ContextSnapshot. It is investigatory input, not an accepted project context boundary.

### `BootstrapCandidate`

One common disposition ledger across sections:

```text
id
bootstrapId
packageId
candidateKey             // stable producer key; unique per bootstrap across refreshes
kind                     identity | source | person | capability | decision | dependency | decision_gate | milestone | risk | unknown | commitment | information
originalProposal JSON    // versioned discriminated union, immutable
reviewedProposal JSON?   // edited/merged payload that would be promoted
status                   pending | accepted | deferred | rejected | information | merged
dispositionReason?
mergedIntoCandidateId?
reviewRevision
sourceFingerprint        // evidence roots + normalized proposal; controls resurfacing
createdAt / updatedAt
@@unique([bootstrapId, candidateKey])
```

`accepted` still means pending activation. Only `ProjectBootstrap.status = activated` and a canonical object's back-reference prove promotion occurred.

### `BootstrapEvidenceLink`

Evidence links must survive candidate edits and detachments without mutating the package:

```text
candidateId
evidenceId
linkState                attached | detached
attachedBy               compiler | operator
reason?
@@unique([candidateId, evidenceId])
```

An evidence id is resolved only within its package. The link carries `packageId` implicitly through the candidate.

### `Capability` and `CapabilityWorkLink`

```text
Capability
  id
  scopeId
  name
  intent
  status                 active | deferred | retired
  origin                 manual | accepted_knowledge | linear_reconciled
  linearParentIdentifier?
  sourceBootstrapCandidateId? unique
  createdAt / updatedAt

CapabilityWorkLink
  capabilityId
  sourceSystem           linear | notion | manual
  externalId
  linkReason?
  @@unique([sourceSystem, externalId])
```

Why this model: the current `Feature` read model already knows how to compose Linear roots, Hermes suggestions, manual drafts, and unmapped work. Durable capabilities should feed that composer. A separate generic `Work` table would duplicate Linear and silently compete with execution truth; V1 should link external work, not copy it.

### `ScopeDependency`

```text
id
scopeId                  dependent / downstream Scope
prerequisiteScopeId?     null when external prerequisite
externalPrerequisite?
status                   active | retired
rationale
source                   manual | accepted_knowledge | migrated
sourceBootstrapCandidateId? unique
createdAt
```

Evidence belongs in a companion `ScopeDependencyEvidence` shape parallel to `DecisionEvidence`, or through the accepted snapshot + evidence ids. The implementation must not keep only prose.

Migrate each existing `Scope.dependsOnScopeIds` entry to `source = migrated`, then make reads prefer rows. Remove the array only after parity proofs. This preserves present forecast behavior while gaining provenance.

### Timeline precision

Keep `TimelineEvent.temporalState = occurred | planned`; add:

```text
planningState            accepted_plan | committed
sourceBootstrapCandidateId? unique
```

Candidate mention remains a `BootstrapCandidate` or existing `TimelineEventCandidate`. `projected` is a derived Forecast entry, never a stored promise. An occurred event does not need `planningState`.

### Scope compatibility changes

At activation:

- make `Scope.teamKey` nullable;
- add `aliases String[]`, `description String?`, `ownerLabel String?`;
- optionally add `activatedAt` and `activationBootstrapId` for traceability;
- make all Linear reads return a typed availability state rather than assuming configuration.

V1 should not add a second `Project` model. It would force every route, URL, report, snapshot, and graph node to choose between Project and Scope identities without removing any existing responsibility.

## `ProjectBootstrapPackage` 1.0

Top-level transport:

```ts
interface ProjectBootstrapPackageV1 {
  version: "1.0";
  packageId: string;              // content-addressed, includes version
  producer: "hermes";
  compilerVersion: string;
  generatedAt: string;
  bootstrapId: string;
  requestedIdentity: ProjectIdentityQuery;
  resolvedIdentity: IdentityProposal;
  discovery: DiscoveryManifest;
  artifacts: CandidateArtifact[];
  evidence: BootstrapEvidencePassage[];
  intelligenceHeads: BootstrapIntelligenceHead[];
  entities: EntityProposal[];
  proposals: BootstrapProposal[];
  coverage: CoverageReport;
  ambiguities: BootstrapAmbiguity[];
  gaps: InformationGap[];
  warnings: string[];
}
```

### Identity query

```ts
interface ProjectIdentityQuery {
  canonicalName: string;
  aliases: string[];
  description?: string;
  ownerHint?: string;
  sourceHints: { provider?: string; ref?: string; note?: string }[];
}

interface IdentityProposal {
  canonicalName: string;
  recommendedAliases: string[];
  matchedEntities: { entityId: string; label: string; relationship: "same" | "possible_same" | "related" }[];
  collisionState: "clear" | "review" | "blocking";
  why: MatchReason[];
}
```

### Artifact and evidence lineage

```ts
interface CandidateArtifact {
  artifactId: string;
  provider: string;
  artifactType: "transcript" | "wiki" | "intelligence_store" | "document" | "spreadsheet" | "notion" | "figma" | "linear" | string;
  title: string;
  canonicalRef: string;
  deepLink?: string;
  observedAt?: string;
  contentTimestamp?: string;
  availability: "available" | "partial" | "unavailable";
  retrievalReasons: MatchReason[];
  relevanceBand: "included" | "possible" | "excluded";
  lineageRootIds: string[];        // raw origin(s); empty when unknown
  derivativeOfArtifactIds: string[];
}

interface BootstrapEvidencePassage {
  evidenceId: string;
  artifactId: string;
  exactQuote: string;
  locator: {
    externalRef?: string;
    segmentId?: string;
    blockId?: string;
    sheet?: string;
    row?: string;
    charStart?: number;
    charEnd?: number;
    offsetUnit?: string;
    quoteHash?: string;
  };
  speaker?: string;
  occurredAt?: string;
  independence: "independent" | "derivative" | "unknown";
  lineageRootIds: string[];
}
```

Wiki passages must carry `independence = derivative` and a raw lineage root when known. Missing lineage never defaults to independent.

### Structured intelligence head

```ts
interface BootstrapIntelligenceHead {
  intelligenceId: string;
  type: "Observation" | "Decision" | "Commitment" | "Risk" | "Dependency" | "Unknown" | "AvailabilityObservation" | "ClimateEvidence" | "Opportunity" | string;
  statement: string;
  isCurrent: boolean;
  status?: string;
  observedDate?: string;
  fields: Record<string, JsonValue>;
  evidenceRefs: string[];
  supersedes?: string[];
  contradictedBy?: string[];
  provenance: Record<string, JsonValue>;
}
```

These remain external intelligence. Presence in the package creates no Signal object.

### Proposal union

Every proposal shares:

```ts
interface ProposalBase {
  proposalId: string;
  kind: string;
  statement: string;
  whyProposed: string;
  evidenceRefs: string[];
  intelligenceRefs: string[];
  relevance: { band: "high" | "medium" | "low"; reasons: MatchReason[] };
  grounding: {
    directEvidenceCount: number;
    independentLineageRootCount: number;
    derivativeOnly: boolean;
    unresolvedContradiction: boolean;
  };
  currentness: { observedAt?: string; label: "current" | "aging" | "stale" | "unknown" };
  duplicateHints: { proposalId?: string; canonicalRef?: string; reason: string }[];
}
```

Typed payloads:

- capability: `name`, `intent`, optional Linear/Notion mappings;
- decision: `question`, options, owner hint, needed-by hint;
- dependency: `fromEntity`, `toEntity`, `relationshipKind`, `assertionBasis`;
- decision gate: decision reference, waiting target, serial rationale, three-point delay only when explicitly stated;
- milestone: title, date/date basis, kind, suggested planning state;
- person: stable external refs, display label, possible owner/team roles;
- risk/unknown/commitment: structured intelligence reference, not automatic canonical delivery input.

No x/y coordinates, layout lanes, orbit positions, colors, or screen geometry are legal package fields.

## Match reason contract

```ts
type MatchReason =
  | { kind: "exact_identity"; field: "canonical_name" | "alias" | "external_id"; value: string }
  | { kind: "lexical"; terms: string[]; field: string }
  | { kind: "semantic"; explanation: string; retrievalModel: string }
  | { kind: "graph"; viaEntityId: string; relation: string }
  | { kind: "source_hint"; hint: string }
  | { kind: "derivative"; originArtifactId?: string };
```

Raw vector distance is intentionally absent. Model version can be inspected technically, while the user sees a reason such as “Semantic match: discusses readiness for on-site use.”

## Activation acceptance manifest

The first ContextSnapshot should include a sibling manifest without rewriting the compiler package:

```ts
interface BootstrapAcceptanceManifestV1 {
  version: "1.0";
  bootstrapId: string;
  bootstrapPackageId: string;
  bootstrapPackageHash: string;
  reviewRevision: number;
  activatedAt: string;
  operatorId?: string;
  dispositions: {
    candidateId: string;
    candidateKey: string;
    status: "accepted" | "deferred" | "rejected" | "information" | "merged";
    canonicalObjectRef?: { type: string; id: string };
    reviewedPayloadHash?: string;
    reason?: string;
  }[];
  coverageAcknowledgements: string[];
}
```

The immutable snapshot stores both: what Hermes proposed and what the operator accepted. Neither is reconstructed later from mutable rows.

