# Bootstrap Review workspace

Bootstrap Review is the primary Project Activation instrument, not one step among several equally weighted screens. The compact five-state header provides location only; most operator time is spent here.

## Layout

The workspace is a review instrument, not a wizard with one item per screen. Proposed Scope is one of its switchable sections, not a separate stage.

```text
┌ Project identity / package freshness / coverage / activation status ┐
├ Section rail ───────────┬ Candidate list ───────┬ Evidence inspector ┤
│ Identity                │ state + proposal       │ why proposed       │
│ Sources                 │ grounding/currentness  │ exact passages      │
│ People                  │ duplicate hints        │ knowledge/source    │
│ Proposed Scope          │ review actions         │ detach/attach       │
│ Decisions               │                        │ contradictions      │
│ Dependencies            │                        │                     │
│ Milestones              │                        │                     │
│ Risks / Unknowns        │                        │                     │
│ Missing information     │                        │                     │
└─────────────────────────┴────────────────────────┴─────────────────────┘
```

At desktop width, the evidence inspector is persistent. At smaller supported widths it becomes a drawer. The workspace is not usable if evidence is hidden behind hover.

## Header

- canonical name and aliases;
- `Bootstrap review · not Reality` state badge;
- package generated time and provider coverage (`5 of 7 providers responded`);
- current review revision;
- `Rescan` and `Ready check` actions;
- unsaved edit indicator.

No Forecast date, confidence, or capacity appears in this workspace.

## Section counts

Each section shows `accepted / pending / total`, with blocking ambiguity count. Counts are disposition counts, not completion percentages.

Suggested order:

1. Project Identity
2. Sources Found
3. People / Owners
4. Proposed Scope
5. Proposed Decisions
6. Proposed Dependencies
7. Proposed Milestones
8. Risks / Unknowns / Commitments
9. Missing Information

Identity and source lineage come first because every later proposal depends on them. The ordering is advisory: Nic can switch sections without completing a sequence.

## Candidate card

Always visible:

- human-readable statement;
- type;
- disposition;
- grounding (`Direct evidence`, `Derivative only`, `Semantic lead`);
- currentness (`Observed Aug 19`, `Stale`, `Unknown`);
- `Why proposed` one-line summary;
- evidence count and independent-origin count;
- contradiction/duplicate/collision warnings.

Expanded:

- editable typed fields;
- exact evidence excerpts;
- structured intelligence refs;
- possible canonical/Linear/Notion mappings;
- differences between original proposal and reviewed payload;
- merge targets;
- review history.

## Review actions

### Accept

Sets the candidate disposition to `accepted` for the pending activation set. It does not write the canonical object yet. A confirmation line says which owner will receive it at activation: `Will create Capability`, `Will create open Decision`, `Will register source`, etc.

### Edit

Creates/updates `reviewedProposal`; original proposal remains immutable and viewable. Type-specific validation runs immediately.

### Merge

Chooses a survivor candidate or existing canonical object. The merged candidate retains its own evidence and disposition history. If merged into an existing object during active-project refresh, activation writes only evidence/alias links allowed by that object's owner.

### Defer

Keeps the item in review history and future refresh comparison. No Reality/Forecast effect. Optional revisit reason/date is advisory.

### Reject

Requires a short reason from a bounded list plus optional note: wrong project, duplicate, contradicted, obsolete, not delivery scope, other. Rejection survives refresh while its fingerprint is unchanged.

### Mark as information only

Retains search/context visibility and provenance without proposing a canonical delivery object. Appropriate for market context, climate evidence, mentions of related projects, and low-grounding semantic matches.

### Attach/detach evidence

Evidence detachment changes the reviewed candidate link, never the immutable package. Detaching the last direct passage from a knowledge-derived accepted item makes Ready fail. Manual operator assertions may have none only after explicit acknowledgement.

## Keyboard and bulk behavior

- `J/K` moves between candidates; `E` opens evidence; `A` accepts; `D` defers; `R` rejects only after confirmation.
- Bulk actions are allowed only for low-risk disposition (`defer`, `information only`), never bulk Accept across different types.
- “Accept all high-grounding” is prohibited. High grounding does not equal governance.
- Filters: pending, accepted, changed since last package, contradiction, derivative-only, stale, provider.

## Ready to Activate summary

The ready screen groups exact canonical effects:

```text
Project identity              1 Scope
Recurring sources             4 active · 1 candidate
Canonical capabilities        5
Open Decisions                2 · 0 gates
Declared dependencies         1
Planned milestones            3 · 1 committed
People                        4 mentions · 0 staffing allocations
Review history                4 deferred · 2 rejected · 3 information only
Coverage                      5/7 providers · 2 unavailable acknowledged
```

Warnings must say what will not happen:

- `People mentions will not create staffing allocations.`
- `Open Decisions will not change Forecast without a separately accepted DecisionGate.`
- `Candidate milestones are not commitments; only the one explicitly marked committed will be stored that way.`
- `No Linear binding is configured; the first Audit can run, but Forecast cannot claim executable completeness.`

The final button is the explicit instrument act `ACTIVATE PROJECT`, with the project identity adjacent in the manifest. A secondary `Return to review` remains available. There is no “skip review and activate” route.

## Failure and ambiguity surfaces

- **Name collision:** sticky blocking panel in Identity; Ready disabled.
- **Sparse knowledge:** empty sections say `Insufficient evidence to establish scope`, not `No scope`.
- **Contradiction:** side-by-side intelligence heads and their evidence; must defer/reject/select a reviewed statement.
- **Stale source:** date and age beside the item, not hidden in details.
- **Derivative-only:** `Wiki synthesis only · raw origin unavailable`; cannot satisfy accepted provenance.
- **Provider outage:** coverage drawer with last success and Retry; partial continuation requires acknowledgement.
- **Huge semantic tail:** possible tray collapsed with result count and query refinement action.

## Knowledge navigation grammar

- `View knowledge` — open the structured intelligence object or wiki synthesis relevant to the object.
- `Trace provenance` — open the full chain: proposal/intelligence → evidence passage → source artifact.
- `Open source` — jump to the exact provider location when a deep link/locator exists.

The wiki label always includes `Synthesis · derived`, never `Evidence`.
