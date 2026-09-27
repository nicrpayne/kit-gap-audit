# Scope knowledge estimates

Developer estimates stated in refinement are useful before Linear is fully
estimated, but they are not Linear truth and must not silently rewrite the
canonical forecast.

## Flow

1. The meeting transcript is ingested into the wiki/knowledge system.
2. Hermes promotes a current, evidence-backed Observation or Commitment with
   an exact capability reference and the estimate as structured fields.
3. `kit-gap-bridge` transports the object and its evidence into an immutable
   `ContextSnapshot` during Audit refresh.
4. Scope attaches the object to the exact accepted Capability. The Evidence
   and Estimate tabs show the statement, raw estimate, speaker/owner, meeting
   date, source, and excerpt.
5. The estimate remains inert until an operator opens **Review interpretation and
   boundary**. There is no one-click acceptance or raw-evidence Scenario path.
6. Review requires an exact supporting passage; an explicit remaining-versus-total
   choice; a manually entered low/likely/high developer-effort-day range; the
   origin of each point; a rationale; every current open linked ticket classified
   as covered or additional; a typed reviewer label; and an attestation.
7. Only covered tickets are replaced by the reviewed capability range. Additional
   tickets remain ordinary forecast inputs exactly once. Nothing writes to Linear.
8. When named Capacity is reconciled, the operator may also choose who is
   expected to stay focused on that capability and how much of that person's
   already-owned project capacity applies.
9. Signal then shows an isolated card-level landing window. That window is a
   what-if for the capability, not a project Allocation and not an assertion
   that the same person can execute several cards simultaneously.
10. **Generate Reality + Scenario** in Reports saves both immutable views. The
   Scenario report retains the meeting estimate, named staffing, estimate
   basis, card landing window, and the overall release consequence side by
   side with Reality.

## Producer fields

The object may be current or historical and should carry one exact capability key:

- `capability_id` (preferred when Signal's id is known), or
- `capability_name` / `feature_name` matching the accepted card name.

Existing objects without those fields may attach only when their statement or
typed action contains exactly one complete accepted capability name. Signal
does not use fuzzy matching for estimate evidence.

The estimate may be supplied as raw source evidence in any of these shapes:

- `estimate_low_days`, `estimate_likely_days`, `estimate_high_days`;
- only low/high bounds;
- a single value; or
- `estimate_range` / `duration_stated` with an explicit developer-day range,
  such as `8–13 developer days` or `8/10/13 dev days`.

Signal preserves the raw unit (`developer_days`, elapsed days, sprints, story
points, or unknown), raw values, and raw shape. Two bounds remain two bounds:
Signal does not manufacture a midpoint. Remaining versus total work is read only
from an explicit producer field and otherwise remains unknown until review.

Attribution is retained from `speaker_or_actor`, `speaker`, `owner`, the
object's observed date, and its cited Evidence Passage.

## Units and boundaries

Signal will not convert sprints, story points, elapsed time, or a single value
into developer-effort days. Those statements remain evidence. A reviewer may
enter a separate developer-day remaining range and explain it, but the UI does
not prefill a conversion, a midpoint, or remaining-work meaning.

An accepted Reality estimate is persisted as
`accepted-capability-estimate.v2` on the capability with four distinct records:
the immutable source assertion, the reviewed modeled interpretation, the exact
covered/additional boundary, and acceptance metadata. The reviewer display name
is an operator-entered label, not authenticated identity. Capability revision,
idempotency, and append-only `accept_estimate_v2` event history guard the write.
A context refresh never replaces the assertion.

New v2 writes also freeze the producer-supplied remaining/total/unknown meaning
beside the raw text, unit, values, and shape. Early v2 fixtures without that one
field remain readable, but all current source content is compared when deciding
whether the reviewed assertion is still publishable.

New open links, removed/completed reviewed links, a source becoming historical,
newly explicit supersession, or changed selected-passage/raw assertion content
under a reused object ID makes the adapter return
`review_required`. The last v2 range may remain visible only as qualified
exploration; it is non-publishable and report generation is blocked. No automatic
ticket-rollup fallback, residual-work subtraction, status percentage, or source
rebase is allowed. Legacy unversioned JSON remains readable and visibly review
required. Because it has no reviewed replacement boundary, the legacy quote is not
applied: applying it would guess which tickets to remove and could double-count or
hide work. Existing ticket ranges remain visible only as a **ticket-only subset
pending review**, not as a replacement basis or a publishable full-scope date.
A non-null stored assertion that does not parse as supported v1 or v2 follows
the same fail-closed publication gate, but has no range or provenance view to
carry forward. A genuinely null or absent assertion remains the normal
no-estimate state.

Quote locators use the immutable snapshot and the actual resolved passage. Original
external URLs and surrounding context are preserved only when supplied; Signal does
not invent a document URL or speaker. Two snapshots reusing an intelligence-object
ID remain separate identities. Saved reports freeze their own estimate/quote/input
basis; legacy reports without it must say the provenance was not captured.

These are implementation contracts, not a claim that the real refinement transcript
has passed end-to-end acceptance. Sprint-only statements and later narrowed feature
boundaries still require explicit owner-reviewed interpretation before numerical use.

## Forecast precedence

- Linear ticket ranges form the default capability rollup.
- A current reviewed v2 estimate replaces only `coveredOpenItemIds`.
- `additionalOpenItemIds` remain ticket inputs once. A new unclassified item
  blocks publication rather than being silently covered or dropped.
- Review-required v2 values may be shown only as qualified exploration. Legacy
  accepted values do not have a safe boundary and are not numerically active;
  any dates computed from remaining tickets are labeled as a ticket-only subset
  pending review and cannot be published as the legacy quote's consequence.
- A card staffing plan changes only the isolated card schedule shown on Scope
  and in the Scenario report.
- The overall Scenario release forecast still uses governed project Capacity
  and the protected portfolio engine. Card staffing does not silently rewrite
  project capacity, ordering, or dependencies.
