# Decisions

Lifecycle remains Candidate → Open → Decided. Gating is an additional serial-effect structure and therefore a subset of Open, not another lifecycle state.

The shared count model returns `all`, `candidate`, `open`, `gating`, `openNotGating`, `decided`, and `dismissed`. Control Room and Decisions consume the same semantics. Gate ownership remains `DecisionGate.targetScopeId`; the selected decision's scope does not override it.

Permanent fixture: two JSA open Decisions, one with a serial gate targeting iTrack. Result: All 2, Open 2, Gating 1; JSA is open, while iTrack is labelled as the other gated delivery path.
