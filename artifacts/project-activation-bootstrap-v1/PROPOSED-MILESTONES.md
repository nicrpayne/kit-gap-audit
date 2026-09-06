# Proposed Milestones and Timeline seed

## State vocabulary

| Product state | Persistence | Meaning |
| --- | --- | --- |
| mentioned / candidate | bootstrap candidate or `TimelineEventCandidate` | historical knowledge mentions a landmark; not Timeline Reality |
| planned / accepted | `TimelineEvent` with `temporalState = planned`, `planningState = accepted_plan` | operator accepts a date as the current plan |
| committed | `TimelineEvent` with `temporalState = planned`, `planningState = committed` | operator explicitly says the organization has committed to the date |
| projected | derived Forecast/Timeline entry | simulation projects an outcome date; never a stored commitment |
| occurred | `TimelineEvent.temporalState = occurred` or projection from the actual owning object | attested past event |

Candidate is not a weak commitment. Projected is not a weak plan. The words identify different owners.

## Candidate compilation

Hermes may propose:

- pilot;
- release candidate;
- review;
- handoff;
- expected approval;
- kickoff;
- delivery;
- phase start/end.

Required proposal fields:

- title and landmark kind;
- why proposed;
- evidence/intelligence refs;
- whether the date is explicitly stated, normalized from source-native structured metadata, or missing;
- source timezone/precision when known;
- suggested state (normally candidate; never committed unless source explicitly records commitment, and still requires human confirmation);
- duplicate hints against existing events/reports/decision dates;
- contradiction/currentness.

## Date law

- Prefer structured source dates and exact calendar language with a recorded normalization trace.
- Relative prose (“next Friday”, “in two weeks”) may be normalized only when the source occurred-at timestamp and timezone are known; show both original phrase and resolved date.
- Ambiguous dates remain dateless.
- A dateless candidate cannot become Timeline Reality until the operator supplies a date.
- End dates are accepted only when explicitly stated or supplied by the operator; do not invent default durations.
- Date precision survives (`day`, `week`, `month`, `quarter`). If the current Timeline model can only store an instant, Phase 4 must either add precision or require a day before acceptance; silently picking the first day of a quarter is prohibited.

## Acceptance interaction

The review panel asks:

1. Is this the right landmark?
2. What date/precision should Timeline use?
3. Is it an accepted plan or an explicit commitment?
4. Does it replace/merge with an existing landmark?
5. Which evidence should remain attached?

The default for a future accepted candidate is `planned`, not `committed`. Commitment requires a second affirmative control with explanatory copy.

## Timeline seed after activation

- accepted planned/committed milestones become `TimelineEvent` rows;
- candidate mentions stay in review history and may appear in Event Intake, never on the canonical lane by default;
- rejected/deferred mentions have no Timeline effect;
- projected Forecast dates appear through the existing Timeline projection and remain visually/semantically distinct;
- Decisions’ needed-by dates remain advisory Decision projections;
- the Timeline initial viewport should start at today and extend through the furthest accepted/projected near-term landmark, while preserving backward navigation.

## Contradictory milestone evidence

Do not average dates. Present the competing statements, currentness, and lineage:

```text
Pilot review
  Aug 28 · workshop · direct passage
  Sep 11 · planning note · direct passage · newer
```

The operator chooses, edits, or defers. The rejected date stays in review history and provenance.

