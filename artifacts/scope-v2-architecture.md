# Scope v2 — three-source reconciliation architecture

## Outcome

Scope v2 compiles a reviewable proposal from three independently preserved sources. Knowledge may propose product shape; accepted Scope Reality remains the authority for what is currently true; Linear corroborates executable work but cannot create product shape by itself.

## Data flow

```text
accepted ContextSnapshot     accepted Scope Reality      current Linear project
  structured objects          capability revisions        parent/child issues
           |                         |                           |
           v                         v                           v
   Knowledge candidates       Reality candidates          execution clusters
           \                         |                          /
            +---------------- three-source reconciler --------+
                                      |
                  aligned / no-execution / exception / deferred
                         boundary / conflict proposal items
                                      |
                   persisted proposal (outside canonical Reality)
                                      |
                     local, reversible Scope Scenario staging
                                      |
                reviewed + idempotent governed commit only
                                      |
                         accepted Reality revision/event
```

## Reconciliation rules

- Every accepted Reality capability starts as a candidate, including capabilities with no work.
- Knowledge can independently propose a candidate only from structured capability-like fields or a sufficiently corroborated set of structured current references. Broad prose is never promoted on its own.
- Linear parent/child clusters can attach only to an already grounded Knowledge or Reality candidate through deterministic matching. Linear-only clusters remain visible execution exceptions with `action: none`.
- A parent and its children are counted once. Existing capability links are retained and only missing links are proposed.
- Conflicting in/out evidence is fail-closed: accepted Reality stays authoritative, the item becomes a conflict, and commit is disabled pending operator correction.
- Source watermarks, origin labels, provenance, reconciliation state, confidence, and a deterministic fingerprint are persisted with the proposal.

## Interaction model

- Overview: compact source freshness, reconciliation counts, and Review / Out-later / Work banks.
- Focus: a substantial three-column surface for product intent and current Reality, structured Knowledge evidence, and Linear execution plus modeled consequence.
- Corrections: capability and release-boundary controls live in Focus, not a permanent form column.
- Out / later: capabilities sit in a readable horizontal governed bank and retain the existing drag-to-release behavior.
- Scenario: staging is local and reversible; forecast truth remains unavailable when the existing engine lacks canonical inputs.

## Truth and persistence boundaries

- Proposal generation is read-only over Knowledge, Reality, and Linear.
- Proposal rows live outside canonical Reality and may be superseded without rewriting history.
- Scenario staging does not mutate shared Reality.
- Only the existing governed commit route crosses into Reality, with conflict checks, revision checks, event history, and idempotency preserved.
- The production-input proof used authenticated read-only GET responses and records zero production writes. It hashes Context and Reality identifiers and omits statements and personal names.

## Current JSA read-only result

The captured production inputs contained 172 current Knowledge objects, 9 Reality capabilities, and 77 Linear issues in 22 clusters. Notifications, PDF / Docufy, offline support, and submission/job-lead approvals each reconciled from all three origins. All four correctly surfaced as conflicts because current Knowledge carries an out/deferred signal while accepted Reality remains in-release. Fourteen unmatched Linear clusters remain explicit execution exceptions rather than invented capabilities.

## Verification gates

- Compiler proof covers aligned, Knowledge-only/no-execution, accepted Reality/no-execution, Linear-only exception, deferred, boundary conflict, deterministic ordering, and parent/child de-duplication.
- Browser proof covers overview, capability Focus, reconciliation/evidence Focus, scenario staging, governed nested drag preview, selected-state persistence, forecast truth boundary, and 1440px horizontal overflow.
- Type checking and optimized production build pass.
- The redacted current-input artifact is reproducible from saved read-only endpoint responses; no identifiers are embedded in compiler behavior.
