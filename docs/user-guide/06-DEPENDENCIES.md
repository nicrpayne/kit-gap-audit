# Dependencies

## 1. Purpose

**Question:** What must happen before what, and what does an upstream delay cost downstream?

## 2. Why it is powerful

Declared topology lets Forecast propagate consequences across JSA, iTrack, Platform, or other Scopes without conflating related knowledge with delivery order.

## 3. Mental model

The production navigation names the instrument **Dependencies** at `/orbit`; the surface identifies itself as **Orbit**. Focus one project at the center. Declared dependencies orbit around it; direction and landing are structural. Candidate/inferred relations remain visibly noncanonical.

## 4. Truth / ownership boundary

Dependencies owns explicit Scope-to-Scope precedence. Decisions owns choice gates. Audit/knowledge may suggest relations but cannot declare topology. Forecast consumes accepted edges and the coverage of the dependency closure.

## 5. Inputs

Scope dependency IDs/rows, Scope forecasts and coverage, active Scenario assumptions, provenance/candidate relations.

## 6. Outputs

Dependency closure and propagated landing constraints consumed by Forecast, Scope floor, Timeline, Control Room, Reports, and readiness.

## 7. Screen tour

| Area | Meaning |
|---|---|
| Focus/project selector | Project at the center of the current question |
| Center P50 / confidence | Focus project's modeled result; copied from Forecast, not invented |
| Orbit nodes | Upstream/downstream projects around the focus |
| Declared edge | Canonical precedence; source and target direction matter |
| Candidate note | Knowledge relation that is not Reality |
| Assume control | Scenario assumption where supported; no canonical write |
| Cut control | Scenario-only test of removing a declared edge |
| Capacity required | Consequence cannot be computed without adequate upstream input |
| Omitted count | Additional objects excluded from current framing, not nonexistent |
| Inspector semantics | States explicitly what the relation means and does not mean |
| Provenance | Origin of declared/candidate relationship |

## 8. Primary happy path

1. Select the dependent project.
2. Read the declared upstream edges and direction.
3. Select an edge; read its meaning and provenance.
4. Verify the source project forecast coverage.
5. Use Scenario cut/assumption only to test consequence.
6. Return to Reality.
7. Govern a real new dependency only with explicit upstream and downstream endpoints and a true precedence statement.

## 9. Secondary journeys

- Focus Platform, then iTrack, to see the same edge from each side.
- Identify a dependency whose incomplete coverage makes the downstream forecast unavailable.
- Compare a DecisionGate with a Scope dependency: choice wait versus project precedence.

## 10. Writes / side effects

Orbit/Dependencies is principally a read/scenario surface. Dependency writes occur through the supported Scope/Audit/Decision tool path with explicit endpoints. Scenario cut does not delete Reality.

## 11. What it does not do

It does not infer precedence from semantic similarity, shared people, mentions, or temporal adjacency. It does not create a DecisionGate. It invents no dates or impact scores.

## 12. Warnings / empty states

Empty Orbit means no declared dependency topology for the selected focus, not “nothing is related.” Capacity/coverage required means the engine cannot safely propagate a canonical result. Candidate means proposal only.

## 13. Handoffs

Audit for proposed relations; Scope/settings for declared topology; Forecast for propagated outcomes; Decisions for choice gates; Reports for external calls.

## 14. Common mistakes

Reversing source/target; declaring “related to” as “waits for”; using dependency to represent a Decision; cutting an edge in Scenario and thinking it was deleted.

## 15. Troubleshooting

If the downstream date does not move, inspect whether the dependency is dominant, whether both forecasts are covered, and whether the Scenario is active. If the name says Dependencies but header says Orbit, this is a known copy/IA inconsistency, not two different models.

## 16. Operator checklist

- [ ] Focus project correct
- [ ] Direction and precedence evidence clear
- [ ] Upstream coverage understood
- [ ] Candidate vs declared relation clear
- [ ] Scenario returned to Reality

## 17. Real example

iTrack may explicitly depend on Platform. Adding Platform capacity can move both; JSA may stay unchanged. A shared source passage mentioning JSA and Platform is not enough to create that edge.

