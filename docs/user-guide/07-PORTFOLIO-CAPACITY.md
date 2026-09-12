# Portfolio / Capacity

## 1. Purpose

**Question:** Who is actually available, how are people allocated, what does switching cost, and what happens if that picture changes?

## 2. Why it is powerful

The mixer makes staffing a modeled input rather than a vague headcount. It distinguishes raw named allocation, effective FTE after shared switching cost, legacy aggregate bases, Reality, and a disposable Scenario.

## 3. Mental model

The portfolio is a mixing desk. People are the finite pool; project channels receive allocations; shared context-switch cost reduces effective output. Moving a fader asks a question. **Commit changes** crosses into Reality only after the complete actual team is confirmed.

## 4. Truth / ownership boundary

Capacity owns Person availability, named allocations, complete-roster reconciliation, and the portfolio-wide switch-cost setting. Forecast consumes the exact effective sum only when named capacity is authoritative; it may continue using a clearly labeled legacy aggregate basis otherwise.

## 5. Inputs

Active Person rows, available FTE, allocations across all Scopes, context-switch percentage, legacy scope team capacity, Scenario hires/transfers/allocation changes.

## 6. Outputs

Per-project raw/effective FTE, workforce/free capacity, reconciliation state, Forecast capacity source, Scenario delta, and cross-project date consequences.

## 7. Screen tour

| Area | Meaning / control |
|---|---|
| Scenario bar | Reality or Scenario · unsaved; changed capacity lines |
| Set actual team | Opens complete named roster reconciliation |
| Project channel/fader | Project allocation input in Scenario |
| Named people / patchbay | Person availability and split allocations across projects |
| Raw FTE | Sum of allocated person capacity before switching penalty |
| Effective FTE | Raw allocation after the shared context-switch factor |
| Forecast basis | What Forecast actually consumes and why |
| aggregate_unreconciled | Legacy project capacity remains operational but supports no named staffing claim |
| named_partial | Some people exist; roster is not fully authoritative |
| named_exact | Complete roster confirmed and exact effective sum reconciles with Forecast |
| Scenario Inspector | Changed input, affected projects, movement, constraint explanation |
| Discard | Remove local changes |
| Commit changes | Persist supported actual roster/allocation changes after reconciliation |

### Set actual team drawer

Current basis → person name → available FTE (0–1) → per-project allocations → remove/add person → Review reconciliation → confirm intentional differences from legacy totals → confirm complete roster → **Confirm complete roster**.

## 8. Primary happy path

1. Read the current reconciliation state and Forecast basis.
2. If not `named_exact`, open **Set actual team**.
3. Enter every tracked team member once, available FTE, and allocations across all projects.
4. Fix duplicate, unknown-project, invalid-FTE, duplicate-scope, or over-allocation errors.
5. Review raw/effective totals and free FTE.
6. Confirm intentional differences from legacy bases and complete roster.
7. In the mixer, state a Scenario question and move one allocation.
8. Read affected and unaffected project Forecasts.
9. Discard, or commit only when the scenario is the intended actual state.

## 9. Secondary journeys

- Test a named transfer from Platform to iTrack.
- Add a hypothetical hire in Scenario.
- Compare one person split across two projects with the same raw FTE concentrated on one.
- Adjust the shared context-switch assumption and inspect portfolio-wide reach.

## 10. Writes / side effects

Faders/patching are local Scenario state until commit. Confirm complete roster writes Person/Allocation Reality and makes named allocations authoritative wherever capacity is assigned. Commit writes supported Scenario changes; it refuses while the actual team is incomplete.

## 11. What it does not do

It does not infer staffing from meeting mentions, assign people to capabilities/tickets, measure productivity, or prove a person is available merely because their allocation is low.

## 12. Warnings / empty states

Aggregate or partial state blocks named claims. Over-allocation is invalid. Free FTE is unallocated available capacity, not idle-time proof. A scenario that improves one project may harm another.

## 13. Handoffs

Forecast for distributions, Dependencies for propagation, Scope for load, Control Room for meeting view, Reports for staffing brief.

## 14. Common mistakes

Entering percentages that exceed available FTE; omitting someone and confirming complete; reading raw as effective; treating forecast basis as a named team when aggregate; committing a what-if.

## 15. Troubleshooting

If commit is refused, reconcile complete roster. If named totals differ from Forecast, verify `named_exact`, completeness confirmation, and context-switch factor. If a move has no date effect, another constraint may dominate.

## 16. Operator checklist

- [ ] Roster complete and current
- [ ] Allocations do not exceed availability
- [ ] Raw/effective distinction understood
- [ ] Forecast basis matches reconciliation state
- [ ] Scenario discarded or deliberately committed

## 17. Real example

Moving James from Platform to iTrack can speed iTrack directly while slowing Platform enough to offset the gain if iTrack depends on it. The mixer exposes that system effect; a staffing spreadsheet usually does not.

