# Canonical product lifecycle

## State machine

```text
DRAFT_IDENTITY
  └─ start scan ─▶ DISCOVERING
                      ├─ provider partial ─▶ DISCOVERING (coverage warning)
                      ├─ blocking collision ─▶ NEEDS_IDENTITY_REVIEW
                      └─ package validated ─▶ REVIEWING

NEEDS_IDENTITY_REVIEW
  └─ human resolves identity ─▶ DISCOVERING (new scan revision)

REVIEWING
  ├─ dispositions saved ─▶ REVIEWING
  ├─ rescan/new package ─▶ REVIEWING (preserve prior dispositions)
  └─ all blockers resolved ─▶ READY

READY
  ├─ identity/candidate changes ─▶ REVIEWING
  └─ explicit Activate ─▶ ACTIVATING

ACTIVATING
  ├─ transaction fails ─▶ READY (nothing canonical written)
  └─ transaction commits ─▶ ACTIVE / SNAPSHOT_PENDING_AUDIT

SNAPSHOT_PENDING_AUDIT
  ├─ Audit succeeds ─▶ ACTIVE / AUDITED
  └─ Audit fails ─▶ ACTIVE / AUDIT_FAILED (retryable; activation remains true)

ACTIVE
  └─ knowledge refresh ─▶ REFRESH_REVIEW_AVAILABLE
```

Cancellation from any pre-activation state archives the bootstrap record and its review history. It does not delete source evidence and creates no `Scope`.

## What each boundary means

### Draft identity

The operator asserts only that a project identity should be investigated: canonical name, aliases, optional description/owner, and optional source hints. This is not a delivery plan. No Scope, Forecast input, source registration, Decision, dependency, or Timeline landmark exists yet.

### Discovering

Hermes searches the historical corpus and builds a content-addressed `ProjectBootstrapPackage`. Progress reports provider coverage and counts, never invented percentages of truth. A scan can finish `partial` when providers are unavailable.

### Reviewing

Signal stores candidates and their dispositions in the bootstrap aggregate. `Accept` here means “include this item in the pending activation set,” not “write it immediately into Reality.” That lets the operator review a coherent world and still cancel without leaving partial canonical state.

### Ready

Ready is a deterministic preflight, not a confidence judgment. Required conditions:

- identity collision resolved;
- every candidate has a disposition or is explicitly left pending with “activate with pending review” disabled;
- accepted objects pass type-specific validation;
- every accepted knowledge-derived object has at least one resolvable evidence passage;
- operator assertions without evidence are explicitly labelled and acknowledged;
- accepted scope dependencies resolve to existing active projects or a clearly declared external prerequisite;
- accepted milestones have a date and a planned/committed classification;
- source-provider omissions and derivative-only evidence are acknowledged;
- activation package hash and review revision still match.

### Activating

Activation is one explicit act and one database transaction for canonical writes:

1. Lock the bootstrap revision and re-run preflight.
2. Create the canonical `Scope` identity with `activationStatus = active`.
3. Create accepted source registrations as `active` or `candidate` exactly as reviewed.
4. Create accepted `Capability` records and work links.
5. Create accepted `Decision` records, always open and ungated unless a separate reviewed DecisionGate proposal was accepted.
6. Create accepted `ScopeDependency` records.
7. Create accepted `TimelineEvent` landmarks.
8. Mark rejected, deferred, merged, and information-only candidates in immutable review history.
9. Freeze the bootstrap knowledge package into the first `ContextSnapshot`, preserving the original package plus an activation acceptance manifest.
10. Set the bootstrap to `activated` with the created `scopeId`.

No Forecast is computed inside the transaction. After commit, Signal builds the graph and runs Audit. This avoids holding a transaction open across Linear, model, or provider calls.

### First Audit

The first Audit consumes:

- accepted canonical state;
- first ContextSnapshot and its evidence/intelligence;
- live Linear work when configured and available;
- explicit coverage failures and unresolved review items.

It must be able to raise gaps against the accepted model. “The bootstrap found it” is not a resolution. See [FIRST-AUDIT.md](./FIRST-AUDIT.md).

## Product invariants

1. **Proposal is not Reality.** A candidate row is never queried by Forecast.
2. **Acceptance is explicit and typed.** One bulk Activate act may promote many reviewed items, but each item has an individual recorded disposition and reviewed payload.
3. **Edit does not erase the source proposal.** Store original proposal and accepted payload separately.
4. **Merge preserves all ancestry.** The survivor links every merged candidate and all non-duplicate evidence.
5. **Reject and defer are durable.** Refresh does not resurrect unchanged rejected items.
6. **Information only is neither rejection nor acceptance.** It stays searchable/contextual and has zero canonical delivery effect.
7. **Evidence is not corroboration by count.** Several derivatives of one transcript form one lineage root.
8. **No causal inference from semantic similarity.** Dependency candidates require explicit causal language or human-authored rationale.
9. **No hidden Linear prerequisite.** A project can activate with no Linear binding; Forecast reports “execution source not configured,” not a fake zero-work forecast.
10. **Activation does not certify completeness.** Audit begins where activation ends.

## Atomicity and retry semantics

- `activationRequestId` is a client-generated idempotency key.
- A unique `(bootstrapId, activationRevision)` constraint permits exactly one successful activation of a review revision.
- Retrying after a response timeout returns the existing `scopeId`, snapshot id, accepted-object ids, and audit job state.
- A canonical write failure rolls back the full transaction.
- A post-commit Audit failure does not roll back the project identity. It leaves a visible `Audit failed — retry` handoff state.
- A refresh package can never mutate the activation snapshot. It creates a new immutable ContextSnapshot only after its own governed acceptance boundary.

## Lifecycle copy

- Before scan: “Signal will search historical knowledge and propose a delivery model. Nothing will be accepted automatically.”
- Before activation: “12 proposals will become project Reality. 9 deferred or rejected items remain in review history. This does not create Linear work or staffing.”
- After activation: “Harbor Relay is now tracked. Signal is auditing the accepted model against the available evidence.”
- Audit failure: “The project is active. Its first Audit did not finish; no result is being implied.”

