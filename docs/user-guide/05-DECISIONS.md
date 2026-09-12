# Decisions

## 1. Purpose

**Question:** What choices are unresolved, which are settled, and which truly hold delivery?

## 2. Why it is powerful

It makes organizational tension operable without turning every important conversation into schedule delay. A Decision and a DecisionGate are separate records by design.

## 3. Mental model

The delivery circuit is the path. Only explicit gates touch it. Open ungated choices, candidates, decided choices, and dismissals sit in separate lanes. Scenario can temporarily assume an existing gate resolved without deciding it.

## 4. Truth / ownership boundary

Decisions owns lifecycle, options, owner, rationale, needed-by, evidence, chosen option, resolution, and optional gate. Forecast reads only open serial DecisionGates targeted at a Scope.

## 5. Inputs

Operator-created/imported Decisions, machine candidates, evidence, target Scopes, modeled resolution duration, and the shared Scenario resolved-gate set.

## 6. Outputs

Open/decided/dismissed lifecycle; explicit serial gates consumed by Forecast; evidence and leadership asks consumed by Reports; marks consumed by Timeline/Control Room.

## 7. Screen tour

| Area | Meaning / control |
|---|---|
| Scenario strip | Reality vs suite Scenario and changed assumptions |
| New decision | Title, Scope, context, optional owner/needed-by; creates OPEN and ungated |
| Import | Paste lines or spreadsheet; never creates gates |
| Candidate tray | Machine suggestions; not Reality |
| Open lane | Real unresolved Decisions |
| Circuit Scope | Scope whose delivery path is drawn |
| Gate connection | Explicit serial wait touching the path |
| Gates elsewhere | Gates targeting other Scopes; select to change focus |
| Decided band | Settled choices and resolution record |
| Dismissed bar | Declined choices retained historically |
| Inspector | Lifecycle, options, evidence, gate, target, range, actions |
| Connect to delivery | Requires target Scope, why it waits, supporting evidence, and low/likely/high duration |
| Assume resolved | Scenario only; removes that gate delay from preview |
| Status strip | Reality landing vs Scenario landing and gate effect |

## 8. Primary happy path

1. Capture a real choice with **New decision**; do not gate it yet.
2. Add options, owner, needed-by, context, and evidence.
3. Ask whether target work literally cannot proceed before resolution.
4. If yes, use **Connect to delivery** and complete all four structural questions.
5. Test **Assume resolved in Scenario** to understand leverage.
6. Return to Reality.
7. When the organization chooses, record chosen option, rationale, and resolution; the lifecycle becomes decided.

## 9. Secondary journeys

- Import a batch for review; inspect duplicates before creation.
- Accept a candidate into an open ungated Decision.
- Revisit/supersede a settled choice while preserving history.

## 10. Writes / side effects

Create/import/accept candidate writes Decisions only. Gate creation writes one serial DecisionGate. Decide/dismiss/revisit writes lifecycle and audit fields. Assume resolved writes only browser Scenario state.

## 11. What it does not do

An open Decision does not move Forecast. Severity, importance, owner, or “blocking” language does not create a gate. The current engine does not model parallel gate resolution.

## 12. Warnings / empty states

Missing gate target/why/evidence/range prevents connection. Multiple gates add strictly; do not model two parallel choices separately. Duplicate warning means review existing choices.

## 13. Handoffs

Scope for shape, Dependencies for project precedence, Forecast for modeled effect, Timeline for needed-by/commitment context, Reports for asks.

## 14. Common mistakes

Gating every important Decision; double-counting parallel uncertainty; assuming candidate acceptance includes a gate; deciding in Scenario; using a free-text dependency instead of a target Scope.

## 15. Troubleshooting

If a date does not move, verify the Decision is open, has a serial gate, targets the modeled Scope, and is not assumed resolved in Scenario. If two gates appear additive but should be parallel, remove the false structural claim.

## 16. Operator checklist

- [ ] Choice is real and clearly phrased
- [ ] Options/evidence/owner/needed-by are useful
- [ ] Gate exists only with serial proof
- [ ] Scenario assumptions cleared
- [ ] Resolution/rationale recorded when decided

## 17. Real example

“How should addresses be stored?” is a Decision. If sign-in implementation can proceed while it is discussed, it stays ungated and Forecast does not move. If a named target Scope truly cannot proceed, an evidenced 3/8/15-day gate may be created and tested in Scenario.

