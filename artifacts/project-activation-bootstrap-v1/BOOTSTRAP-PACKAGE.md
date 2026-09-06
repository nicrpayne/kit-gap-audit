# Project bootstrap package

## Purpose and boundary

`ProjectBootstrapPackageV1` is the immutable handoff from Hermes/knowledge compiler to Signal while the project has no canonical `Scope` yet. It is a sibling of the existing `ProjectContextPackage`, not a silent revision of it.

- Bootstrap package: investigatory, pre-Reality, keyed by `bootstrapId`.
- Context package/snapshot: accepted active-project context, keyed by `scopeId`.

Signal validates and stores the bootstrap package verbatim, then projects candidates into the review workspace. It does not create a ContextSnapshot until activation.

## Required contents

### Identity

- requested canonical name, aliases, description/owner hints, source hints;
- recommended canonical name and aliases;
- matched corpus entities;
- collision state and reasons.

### Candidate source artifacts

Every source includes provider, type, stable ref, deep link when possible, content and observation timestamps, availability, match reasons, relevance band, derivative parents, and raw lineage roots.

### Evidence passages

Exact quoted/located passages with artifact id and source-native locator. Excerpts are never generated summaries. If an artifact cannot support exact passage location, the package says so.

### Current structured-intelligence heads

Current and relevant non-head historical objects needed to explain supersession/contradiction, carrying producer ids, types, fields, status/currentness, dates, evidence refs, and provenance. These remain Hermes beliefs, not Signal Reality.

### Entities

People, teams, projects, systems, and external artifacts with stable upstream ids, aliases, mention counts by lineage family, and identity ambiguity. A person mention is not staffing or an owner assignment.

### Proposals

- capabilities/scope concepts;
- Decisions;
- dependencies and separate DecisionGate candidates;
- milestones/events;
- people/owner suggestions;
- risks, unknowns, commitments, opportunities;
- source registration suggestions;
- information-only context.

Each has `whyProposed`, evidence refs, intelligence refs, retrieval reasons, grounding band, currentness, duplicate hints, and contradiction state.

### Coverage and gaps

- every provider considered;
- availability/currentness per provider;
- exact/lexical/semantic/graph result counts;
- omitted low-band count;
- missing explicit hints;
- derivative-only knowledge;
- identity collisions;
- missing owners, dates, execution mapping, scope, or raw evidence.

## Package-level validation

Signal rejects the package when:

- version unsupported;
- package id reused with different content;
- `bootstrapId` mismatches request;
- evidence or intelligence references dangle;
- derivative artifact claims independent evidence;
- proposal kind/payload fails its discriminated schema;
- source coverage omits an inventoried provider without a coverage row;
- two artifacts reuse an id for different content;
- a passage lacks both a source-native locator and an explicit `locatorUnavailableReason`;
- any field contains layout geometry.

Signal accepts with warnings when:

- providers unavailable;
- raw origin missing for a derivative;
- identity remains ambiguous;
- semantic result volume is large;
- current intelligence objects contradict each other;
- there is insufficient evidence to propose a requested section.

Acceptance of the package means “valid input to review,” not “valid project model.”

## Example proposal

```json
{
  "proposalId": "capability:handoff-checklist",
  "kind": "capability",
  "statement": "Field teams can complete a handoff checklist before transfer.",
  "whyProposed": "Two workshops describe the same user outcome and one Notion requirement names the checklist.",
  "payload": {
    "name": "Field handoff checklist",
    "intent": "Capture readiness and approval before a field handoff",
    "possibleMappings": [
      { "system": "notion", "externalRef": "notion://page/relay-pilot#checklist" }
    ]
  },
  "evidenceRefs": ["ev-workshop-17", "ev-notion-04"],
  "intelligenceRefs": ["intel-capability-91"],
  "relevance": {
    "band": "high",
    "reasons": [
      { "kind": "exact_identity", "field": "alias", "value": "Relay" },
      { "kind": "lexical", "terms": ["handoff", "checklist"], "field": "statement" }
    ]
  },
  "grounding": {
    "directEvidenceCount": 2,
    "independentLineageRootCount": 2,
    "derivativeOnly": false,
    "unresolvedContradiction": false
  },
  "currentness": { "observedAt": "2026-08-19T15:00:00Z", "label": "current" },
  "duplicateHints": []
}
```

## Idempotency and refresh

- `packageId = hash(version + normalized immutable package content)`; generated time is excluded from the content identity or separated from the hashed semantic payload.
- Same package id + same hash returns the stored package.
- Same id + different hash is a conflict.
- A new scan creates a new package and points to the superseded package.
- Candidate keys remain stable across packages when normalized proposal identity and lineage roots are unchanged.
- Signal carries dispositions forward only when the candidate fingerprint is unchanged. Materially new evidence resurfaces the item with `previously rejected; evidence changed`.

## From bootstrap to first ContextSnapshot

At activation, Signal builds an active-project context package from the compiler package without discarding anything:

1. assign the new `scopeId`;
2. preserve artifacts, evidence, intelligence, coverage, and warnings;
3. include the bootstrap package id/hash;
4. attach the activation acceptance manifest;
5. persist once through `persistContextSnapshot` under a new supported contract revision (recommended `ProjectContextPackage 2.0`, or an additive wrapper if the current validator can preserve all fields);
6. pass that one snapshot id to the first Audit.

The contract revision must be explicit because changing the hashed transport semantics under package version 1.1 would recreate the identity bug already documented in `docs/CONTEXT-MODEL.md`.

