# Master Control Room

## 1. Purpose

**Question:** What is happening right now, and where should I go look?

The Control Room is a read-only composition of owner instruments. It is the daily operating picture, not a dashboard that invents health scores and not a shortcut around governance.

## 2. Why it is powerful

It keeps Reality, unresolved choices, Capacity, modeled outcome, and time in one sequence. A leader can see the likely landing and immediately inspect the constraint, source age, decision, or dependency that explains it.

## 3. Mental model

Read left-to-right/top-to-bottom as five numbered instruments: **Reality → Choices → Capacity → Outcome → Time**. The Project Time Machine is the dominant working surface. The operational rail explains dependencies, constraints, changes, and status; the analysis row provides compact doors into Forecast, Capacity, Decisions, and release composition.

## 4. Truth / ownership boundary

The Control Room owns no canonical fact. Scope, Decisions, Dependencies, Capacity, Forecast, Timeline, Audit, and Reports retain ownership. A value here should always have a door to its owner.

## 5. Inputs

- project/portfolio read model and active browser Scenario;
- Decision lifecycle and gates;
- Timeline projection and historical snapshots;
- Forecast results and coverage;
- named Capacity contract;
- Scope composition, dependencies, and source/currentness readings.

## 6. Outputs

Attention and navigation only. No Reality row is written. The **Add event** control is a door to Timeline with the form open, not an event write on this page.

## 7. Screen tour

| Area | Meaning / control |
|---|---|
| Rail | Navigate instruments; Portfolio expands Capacity, Scope, and Dependencies; command menu and Add project are available |
| Master Control Room strip | Instrument identity and scenario/reality context |
| Live now | Timeline-owned NOW used across the composition |
| Timeline span | Days represented by the current time model |
| Last saved forecast report | Age of the latest immutable forecast-bearing report; “never run” is literal |
| Scenario mark / Back to Reality | Indicates a hypothetical overlay and discards it |
| Add event | Opens Timeline with `?add=1`; does not write here |
| Views | Switches local presentation lenses; no project truth changes |
| Gear | Customize visible surfaces or reset the workspace |
| Telemetry strip | Reality, Choices, Capacity, Outcome, Time headline readings |
| Project Time Machine | Project lanes, gates, edges, target/forecast context; selecting changes the Inspector question only |
| Operational rail | System/source status, dependencies, constraints, and recent changes |
| Analysis row | Compact Forecast, Capacity, Decisions, and release-shape readings with owner doors |
| Status bar | Stored ages/counts; not a fabricated “all systems healthy” grade |

## 8. Primary happy path

1. Verify the project and Reality/Scenario state.
2. Scan the five telemetry readings in order.
3. Select the project, gate, or dependency that looks material.
4. Read the Inspector for the owning fact and consequence.
5. Follow the owner link; govern there if needed.
6. Return and confirm the composed reading refreshed.

## 9. Secondary journeys

- Switch Views before a meeting: Command for the designed complete composition; other lenses for focused questions.
- Enter a Scenario elsewhere, return here, and compare the changed outcome without committing.
- Use **Add event** to hand off a time object to Timeline.

## 10. Writes / side effects

View selection and workspace customization are local presentation state. Scenario discard changes browser-local state. No project Reality is written.

## 11. What it does not do

It does not decide, change Scope, edit dependencies, allocate people, set targets, create reports, or declare health. It never proves causality merely because two events are adjacent.

## 12. Warnings / empty states

- **The forecast is stopped:** a model refusal or owner fetch failed. Nothing on the page is shown as trustworthy; follow **Fix project dependencies** or the named repair.
- **Reading the project…:** owner reads are still arriving; persistent loading without an error is a product issue.
- **Needs a wider screen:** widen beyond 1024 px.
- Stale readings use amber; live can still be stale.

## 13. Handoffs

Audit for unexplained external change; Scope/Decisions/Dependencies/Capacity for owner edits; Forecast for distribution and drivers; Timeline for time; Reports only after readiness.

## 14. Common mistakes

- treating a Control Room value as a separate source of truth;
- reporting likely as commitment;
- overlooking an active Scenario marker;
- reading feed age as system health;
- assuming a selected relationship is causal.

## 15. Troubleshooting

Confirm project URL context, return to Reality, inspect the named error, and open the owner instrument. If two surfaces disagree, capture both with times and log it.

## 16. Operator checklist

- [ ] Correct project and Reality/Scenario state
- [ ] Knowledge/source ages understood
- [ ] Forecast coverage understood
- [ ] Material open choices and constraints inspected
- [ ] Next owner instrument identified

## 17. Real example

In a JSA/iTrack/Platform review, a Platform capacity change may pull Platform and dependent iTrack earlier while JSA stays still. That unchanged JSA date is useful: another gate or dependency is dominant. Use the Inspector rather than forcing a narrative.

