# Forecast

## 1. Purpose

**Question:** Given governed inputs, where are we likely to land, within what window, and why?

## 2. Why it is powerful

Forecast replaces a hand-typed date with a repeatable uncertainty-native consequence. It responds immediately to Scenario inputs while preserving Reality as a visible baseline.

## 3. Mental model

The solid forecast body is the active model; in Scenario, the dashed ghost is Reality. The center date is likely (P50). The window spans lower-to-upper outcome percentiles. A target is a lookup against the same runs, not an input that moves the distribution.

## 4. Truth / ownership boundary

Forecast owns the simulation result and coverage interpretation. It does not own Scope, gates, Dependencies, Capacity, targets, commitments, or source truth. Tools link to those owners.

## 5. Inputs

Covered executable work with low/likely/high estimates, effective capacity, open serial DecisionGates, declared dependencies, start date, active Scenario, and saved/hypothetical target.

## 6. Outputs

Likely date, outcome window, confidence at target, miss tail, scenario delta, dependency propagation, floor/driver explanations, and coverage state consumed by Timeline, Control Room, Reports, and readiness.

## 7. Screen tour

| Area | Meaning / control |
|---|---|
| Project strip | Project selector and Reality/Scenario chips |
| Coverage banner | `forecastable`, `modeled_subset`, or `unavailable`; reasons are part of the result |
| Currentness | Age/state of live Forecast inputs |
| Forecast body | Distribution across completion days |
| Central date | Likely landing; opens Forecast detail |
| Reality ghost | Baseline shown during Scenario; opens comparison |
| Target line | Saved or hypothetical target against the unchanged runs |
| Confidence at target | Fraction of runs landing on/before target |
| Hatched tail | Miss probability beyond target |
| Gate wall | Serial Decision delay; opens Gate detail |
| Macro strip | Work, gates, people/capacity, detail/context tools |
| Toggle macros | Opens/closes deeper inputs without changing them |
| What the model knows | Work count, gates, capacity source, report history, sources/ages |

## 8. Primary happy path

1. Read coverage before the date.
2. If canonical, read likely and window.
3. Inspect target confidence separately; no target means no commitment claim.
4. Open macros and identify dominant work, gate, dependency, or capacity input.
5. Change one input in its owner Scenario.
6. Compare solid Scenario with dashed Reality; note likely movement and spread change.
7. Return to Reality before communicating.

## 9. Secondary journeys

- **Target evaluation:** evaluate hypothetical target, step ±1/±7 days, then return to saved target. No simulation reruns.
- **Assume gate resolved:** Scenario only; inspect whether the wall was dominant.
- **Context detail:** verify modeled work count, gate count, capacity source, source ages, and reports.

## 10. Writes / side effects

Forecast itself does not persist scenario or target edits. Gate assumptions and target overrides are local. Canonical target is owned by Timeline/project settings through the supported write path.

## 11. What it does not do

It does not promise a date, hide incomplete coverage, translate an open ungated Decision into delay, or let target pressure move the distribution.

## 12. Warnings / empty states

- **FORECAST UNAVAILABLE:** no reliable execution input; no project date.
- **FORECAST INCOMPLETE — EXECUTION COVERAGE UNRESOLVED:** displayed outcome excludes named missing work; never call it full-project.
- **Stale:** live owner read is older than horizon.
- A dependency with incomplete coverage contaminates the downstream claim.

## 13. Handoffs

Scope for coverage/work, Decisions for gates, Dependencies for topology, Portfolio for capacity, Timeline for targets/commitments, Audit for freshness, Reports for snapshot.

## 14. Common mistakes

Leading with the date before coverage; calling P50 “the deadline”; interpreting target move as model improvement; adding people against a serial gate; ignoring unchanged uncertainty.

## 15. Troubleshooting

Use coverage reasons verbatim. If the model stops, inspect dependency cycles and owner-fetch errors. If Scenario change does nothing, inspect floor and dominance before assuming a bug.

## 16. Operator checklist

- [ ] Coverage and currentness read first
- [ ] Likely/window/target/commitment kept separate
- [ ] Capacity source understood
- [ ] Gates/dependencies inspected
- [ ] Scenario state cleared before final statement

## 17. Real example

Platform may land October 9 with a September 30 target and 35% confidence. Moving the target to October 15 raises the hit probability but does not move the model. Adding covered effective capacity may move the distribution; resolving a serial gate may move it more.

