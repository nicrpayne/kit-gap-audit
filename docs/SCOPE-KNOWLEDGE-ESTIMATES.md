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
5. The estimate remains inert until the operator chooses **Use provisionally
   in Scenario**.
6. In Scenario it replaces that capability's ticket rollup. It is never added
   on top of those tickets, never writes to Linear, and never changes Reality.
7. When named Capacity is reconciled, the operator may also choose who is
   expected to stay focused on that capability and how much of that person's
   already-owned project capacity applies.
8. Signal then shows an isolated card-level landing window. That window is a
   what-if for the capability, not a project Allocation and not an assertion
   that the same person can execute several cards simultaneously.
9. **Generate Reality + Scenario** in Reports saves both immutable views. The
   Scenario report retains the meeting estimate, named staffing, estimate
   basis, card landing window, and the overall release consequence side by
   side with Reality.

## Producer fields

The object must be current and should carry one exact capability key:

- `capability_id` (preferred when Signal's id is known), or
- `capability_name` / `feature_name` matching the accepted card name.

Existing objects without those fields may attach only when their statement or
typed action contains exactly one complete accepted capability name. Signal
does not use fuzzy matching for estimate evidence.

The estimate may be supplied as:

- `estimate_low_days`, `estimate_likely_days`, `estimate_high_days`; or
- `estimate_range` / `duration_stated` with an explicit developer-day range,
  such as `8–13 developer days` or `8/10/13 dev days`.

Attribution is retained from `speaker_or_actor`, `speaker`, `owner`, the
object's observed date, and its cited Evidence Passage.

## Units and boundaries

Signal will not convert sprints, story points, calendar time, or a single
unbounded number into a three-point developer-day range. Those statements are
still displayed as evidence, but they cannot be staged until someone supplies
a usable range. This prevents the app from inventing sprint length, staffing,
velocity, or uncertainty.

The current implementation is deliberately Scenario-only. Persisting a
knowledge estimate into Reality requires a separate governed owner model with
history and supersession; a context refresh by itself is never that action.

## Forecast precedence

- Linear ticket ranges form the default capability rollup.
- A deliberately staged meeting estimate replaces that whole capability
  rollup in Scenario; it is not extra work.
- A card staffing plan changes only the isolated card schedule shown on Scope
  and in the Scenario report.
- The overall Scenario release forecast still uses governed project Capacity
  and the protected portfolio engine. Card staffing does not silently rewrite
  project capacity, ordering, or dependencies.
