# First Context Snapshot and first Audit

## Handoff contract

Activation completes canonical persistence first, then launches an idempotent first-Audit job with:

```json
{
  "scopeId": "created-scope-id",
  "contextSnapshotId": "first-snapshot-id",
  "bootstrapId": "bootstrap-id",
  "activationRevision": 7,
  "auditKind": "activation_v1"
}
```

The job reads accepted canonical state at that activation revision, the exact first snapshot, available live Linear work, and explicit source coverage failures.

## First snapshot

The snapshot must freeze:

- complete validated bootstrap compiler package;
- project identity and aliases accepted by the operator;
- source manifest with provider status/currentness;
- evidence passages and exact locators;
- structured intelligence/current-state objects and relations;
- activation acceptance manifest for every candidate;
- reviewed edits and merge ancestry;
- operator assertions and “no evidence yet” acknowledgements;
- coverage acknowledgements and unresolved ambiguities allowed through Ready.

It does not copy current Forecast output or invent a Linear history. Existing `ContextSnapshot` immutability and one-snapshot-per-package rules remain.

## Graph build

Extend `loadAuditGraphInputs`/graph projections so the activation world contains:

- canonical project/Scope;
- accepted Capabilities and work mappings;
- accepted Decisions and separate gates;
- accepted ScopeDependencies;
- accepted Timeline landmarks;
- source artifacts/passages;
- external intelligence heads and relations;
- missing-provider and operator-assertion gap nodes;
- live Linear work if available.

Rejected/deferred candidates may be visible through a review-history lens but are not canonical graph nodes at rest and never reach Forecast.

## Audit questions

The first Audit asks what the accepted model still fails to account for:

- evidence-supported capabilities with no accepted Scope representation;
- accepted Capabilities with no executable mapping;
- executable Linear work with no Capability mapping;
- unresolved decisions and whether any are truly serial gates;
- dependency evidence not represented canonically, and canonical dependencies whose current evidence has weakened;
- mentioned milestones not planned, planned milestones contradicted by newer evidence, and commitments without owners;
- risks/unknowns/commitments not represented or not assigned;
- source/provider coverage gaps and stale sources;
- contradictory current intelligence;
- operator assertions without evidence;
- missing owners, staffing/capacity, target, or execution binding.

Bootstrap acceptance is not a reason to suppress a Finding. The same evidence may justify a candidate and later expose that its accepted representation is incomplete.

## Linear absence and failure

Current `runAudit()` fails before model work if `getScopedIssues()` fails, and current `Scope.teamKey` is required. Activation requires a typed direct-source state:

- `not_configured` — valid for a new active project; Audit proceeds with no Linear comparison and raises/exposes the gap;
- `unavailable` — configuration exists but the read failed; Audit can either proceed as partial with an explicit negative-provenance limitation or fail by policy, never treat it as zero work;
- `available` — Audit includes the live issue set.

For V1, recommendation:

- proceed on `not_configured` with explicit Finding/coverage node;
- on `unavailable`, mark Audit `partial` and prohibit conclusions that depend on absence of matching work;
- store the provider failure in AuditRun metadata;
- never report executable coverage as complete unless Linear was available or another configured execution owner explicitly owns it.

## Job and UI states

1. `Building accepted project world`
2. `Freezing first context snapshot`
3. `Comparing accepted model with evidence and execution truth`
4. `Building Audit World`
5. `Audit ready · N findings`

The handoff screen opens Audit World as soon as the graph is available. If model-based findings are still running, the structural graph can appear with `Audit analysis in progress` only if the app clearly distinguishes incomplete analysis.

## Failure behavior

- Snapshot persistence failure: activation transaction rolls back.
- Canonical graph build failure after commit: project remains active; show retryable technical failure.
- Audit model failure: project remains active; no fake zero findings.
- Linear unavailable: partial Audit with explicit inability to prove work absence.
- Invalid evidence refs: reject the affected Finding as current code already does; surface diagnostic.
- Retry: same `scopeId + contextSnapshotId + auditKind` returns or resumes one AuditRun.

## Immediate success screen

```text
Harbor Relay is now tracked.

Accepted Reality
5 capabilities · 2 Decisions · 1 dependency · 3 milestones

First Audit
7 findings · 2 require identity/coverage review

[Open Audit World]  [View activation record]
```

Do not land on Forecast when execution inputs are absent; Audit is the honest first destination.

