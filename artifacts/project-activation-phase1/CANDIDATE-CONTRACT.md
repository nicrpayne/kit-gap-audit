# Candidate contract

Supported kinds in this slice:

- `source`: matched artifact association;
- `person`: structured owner/person mention, explicitly not staffing;
- `capability`: explicit capability/feature/name field or typed capability/scope/requirement claim;
- `decision`: current external Decision or typed Decision claim; `createsGate=false`;
- `dependency`: emitted only when structured `from` and `to` endpoints exist;
- `milestone`: dated structured Commitment or typed event claim; candidate only;
- `risk` and `unknown`: matching typed external intelligence;
- `missing_information`: deterministic coverage/compiler gaps.

Every package proposal includes type, human title/statement, why/match basis, retrieval relevance (not truth confidence), currentness, evidence refs, intelligence refs, grounding, independent lineage-root count, contradiction state, typed payload, candidate key, and fingerprint.

Human states: `pending`, `accepted`, `deferred`, `rejected`, `information-only`, `superseded`. Accepted means only “include in a future activation manifest.” Edit stores `reviewedProposal` without modifying `originalProposal`. Manual entries are labelled `operator assertion · no evidence yet`.

Unsupported deterministic compilation becomes a visible gap, not an invented proposal. In particular: lexical relatedness never creates a dependency; a Decision never creates a gate; a person mention never creates Person/Allocation rows; an undated commitment never creates a milestone date.
