# Proposed Scope

Proposed Scope is a section inside the primary Bootstrap Review workspace. It is not a standalone wizard page. Its candidate bay, evidence inspection, manual-add flow, and canonical handoff all use the shared Review disposition model.

## Product model

Scope gets a persistent **Proposed Scope bay** beside the canonical release composition. It contains capability candidates from Hermes and manual operator assertions. Nothing in the bay contributes work, load, Forecast, or completeness until explicitly accepted into the canonical Capability owner and, separately, linked to execution work.

Candidate card fields:

- capability/feature statement;
- intent/outcome;
- why proposed;
- exact evidence links and independent origin count;
- structured intelligence links;
- grounding and currentness;
- possible Linear parent/project or Notion requirement mapping;
- duplicate/overlap hints;
- contradiction/staleness warnings;
- disposition history.

## Why a new canonical Capability is required

The current system has no durable Feature table:

- `lib/scope/features.ts` derives Features from Linear parent chains;
- Hermes missing-work Findings appear as candidate read-model features;
- manual capabilities live only in `SuiteScenario.draftFeatures`;
- `acceptedCandidateIds` is also session-local and changes no simulation input;
- `docs/SCOPE-INSTRUMENT.md` already identifies `Feature` + `FeatureWorkLink` as the missing migration.

Therefore acceptance cannot honestly be implemented by setting a flag on the current read model. V1 should add durable `Capability` and `CapabilityWorkLink` models, then adapt `composeFeatures` to merge:

1. canonical Capability rows;
2. Linear root-parent structure;
3. explicit CapabilityWorkLinks;
4. unmapped executable work;
5. candidate bay items (visually separate, no load).

Do not create a generic copy of Linear issues. Linear remains execution truth; Capability links to external work ids.

## Acceptance paths

### Accept as a canonical capability

Creates `Capability` with reviewed name/intent, origin, candidate back-reference, and evidence ancestry. It does not create work or an estimate. If no executable work is linked, Scope says `Canonical capability · no executable representation` and Audit may raise a coverage gap.

### Link to an existing Linear feature/work parent

The operator selects a live Linear root. Signal creates/reconciles the canonical Capability and its external mapping. It must check whether that root is already mapped to another Capability and offer merge rather than duplicate.

### Merge

Merge candidate-to-candidate or candidate-to-canonical. Store all merged candidate ids, preserve non-duplicate evidence, and show original statements in history.

### Defer / Reject / Information only

Remain in candidate history and have zero canonical or Forecast effect.

## Manual reverse flow

`Add to Scope manually` opens the same candidate editor with `origin = operator_assertion`.

Required:

- human-readable capability name;
- intent statement.

Evidence choice:

1. attach existing knowledge: search wiki/intelligence/evidence/source and attach exact passages;
2. add a source hint for later retrieval;
3. explicitly mark `Operator assertion · no evidence yet` and provide a reason.

The manual item lands in Proposed Scope, not directly on the canonical deck. The operator then accepts it using the same reviewed activation/Reality boundary. When accepted without evidence, the Capability displays `Operator assertion` and Audit receives the information gap.

Later refresh behavior:

- supporting evidence links to the existing assertion and improves grounding;
- contradicting evidence opens a review item and never deletes or rewrites the assertion;
- a matching Linear root creates a mapping suggestion;
- unchanged absence of evidence does not repeatedly create duplicates.

## Forecast law

- A Capability by itself has no estimate or work load.
- Only execution items already admitted by the canonical work model affect Forecast.
- Accepting a candidate never copies a prose estimate into work.
- If a candidate originated from a missing-work Finding already counted by the existing forecast placeholder path, acceptance must not count it again. The Capability links to the Finding/external work identity rather than creating another item.
- Linking a Capability to Linear changes organization/coverage, not the underlying ticket count.

## Duplicate detection

Hints, not automatic merges:

- exact normalized name/alias;
- same Linear parent id;
- shared Notion requirement id;
- strong semantic overlap with different evidence roots;
- same evidence lineage root;
- current intelligence `supersedes`/`refines` chain.

The UI says why (`Same Linear parent`, `Similar outcome`, `Derived from the same workshop`). A vector score is never shown.

## Empty and partial states

- `No candidates found` means only that retrieval proposed none.
- `Insufficient evidence to establish scope` is used when sources mention the project but not deliverable capabilities.
- `5 capabilities accepted · 2 have no executable mapping` is preferred to a false `scope complete` message.
- A project can activate with zero capabilities if the operator acknowledges the gap; the first Audit should make that gap explicit.
