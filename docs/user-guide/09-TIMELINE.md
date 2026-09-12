# Timeline

## 1. Purpose

**Question:** How did we get here, what do we believe now, and what comes next?

## 2. Why it is powerful

Timeline places planned events, actual occurrences, Decisions, execution, Forecast, commitments, and historical report memories on one time axis without rewriting the past with today's model.

## 3. Mental model

Press Play to let the project story unfold. Historical Forecast holds between saved reports and steps only when the next report is crossed. Today/NOW transitions into the live Forecast. Adjacency is not causality.

## 4. Truth / ownership boundary

Timeline owns TimelineEvent rows and their planned/committed/occurred states. Reports own historical forecast snapshots; Forecast owns the live projection; Decisions and Linear own their marks. Only Timeline-owned objects can move or be deleted here.

## 5. Inputs

Timeline events/candidates, Decisions, Linear/execution dates, immutable Reports, current Forecast, project targets, active project context.

## 6. Outputs

Time projection, next milestone, commitment context, conflicts, playback story, and owner links consumed by Control Room and Reports.

## 7. Screen tour

| Area | Meaning / control |
|---|---|
| Master ribbon | NOW, Forecast/target/commitment context and project cells |
| Today / playhead | Current or replayed point in time |
| Transport | Play/pause, speed, jump to NOW, step through story |
| Time field | Lanes and date geometry |
| Planned/projected/committed/occurred marks | Different temporal semantics; never collapse them |
| Forecast memory | Historical report value held until a later saved report |
| Live Forecast | Current derived outcome at NOW, with currentness |
| Layers | Show/hide story layers only |
| Lanes | Focus/reorder visible projects without rewriting topology |
| Zoom/pan/window | View controls |
| Inspector | Selected object's owner, date, source, editability, links |
| Add event | Opens Timeline-owned event form |
| Intake/candidates | Proposed temporal objects; not Reality |
| Undo/redo | Timeline command recovery for owner writes in the current session |

## 8. Primary happy path

1. Verify project and NOW.
2. Press Play; watch events articulate as crossed.
3. Note where historical report Forecast steps rather than drifts.
4. At NOW, compare live Forecast, target, and commitment.
5. Select the next milestone; inspect ownership/source.
6. Add or edit only a Timeline-owned event when the real plan changed.
7. Return to Control Room/Reports.

## 9. Secondary journeys

- Accept/dismiss a Timeline candidate.
- Use Layers to isolate decisions or reports.
- Open via Control Room **Add event**; form should already be open.
- Inspect a historical report and compare its generated-at state with live.

## 10. Writes / side effects

Add/edit/delete writes TimelineEvent only. Candidate acceptance creates the owner event. Undo/redo issues explicit compensating commands. Playback, layers, lanes, pan, zoom, selection, and playhead are view state.

## 11. What it does not do

It never re-simulates the past, interpolates beliefs between reports, claims causality from adjacency, or edits Forecast/Report/Decision/Linear owner objects.

## 12. Warnings / empty states

A dormant project may have no Timeline-owned plan objects, Forecast, or Decisions; that is empty truth. Missing live Forecast is not a zero-length milestone. Conflicts are disclosure, not automatic resolution.

## 13. Handoffs

Forecast for current outcome, Reports for historical snapshot, Decisions for choice lifecycle, Scope/Linear for work, Control Room for composition.

## 14. Common mistakes

Dragging a read-only mark; treating a planned milestone as projected; reading an adjacent decision as the cause of movement; assuming the old report changed.

## 15. Troubleshooting

If an object cannot move, inspect owner. If historical forecast appears to glide, log it: the contract is hold then step. If Add event door opens Timeline but not the form, check `?add=1` consumption.

## 16. Operator checklist

- [ ] NOW and project correct
- [ ] Historical vs live Forecast distinguished
- [ ] Planned/projected/committed/occurred labels preserved
- [ ] Only owner events edited
- [ ] Next milestone/conflict understood

## 17. Real example

A JSA Decision may be recorded August 14, a report saved August 16, and the remembered forecast step on August 16. Timeline may state the adjacency, but only the report's frozen facts may explain movement.

