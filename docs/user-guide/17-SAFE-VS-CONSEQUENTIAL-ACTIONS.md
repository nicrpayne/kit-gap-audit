# Safe vs Consequential Actions

## The three-part rule

```text
SAFE EXPLORATION         GOVERNED WRITE              AUTOMATIC CONSEQUENCE
Search / inspect         Accept Scope change         Forecast recomputes
Switch project           Decide a Decision           Timeline projection moves
Adjust Scenario          Declare Dependency          Control Room re-reads
Scrub target             Confirm actual team         Readiness changes
Preview report recipe    Activate project            Reports use new live inputs
```

Consequences on the right are not extra writes. They are new readings derived from the owner state in the middle.

## Safe / reversible exploration

| Action | What changes | Recovery |
|---|---|---|
| Switch project | URL-owned view context | Re-select or use Back/Forward |
| Search, Trace, Inspector | Selection/focus only | Clear selection or close panel |
| Audit layout, zoom, pan, hover | Canvas view only | Fit/reset or switch layout |
| Open a Control Room View | Local workspace presentation | Choose another View or reset |
| Move Scenario capacity/allocation levers | Browser-local Scenario | Back to Reality / Discard |
| Remove/re-estimate a capability in Scenario | Browser-local Scope overlay | Back to Reality |
| Assume an existing gate decided | Browser-local suite Scenario | Back to Reality |
| Scrub Forecast target | Output-side evaluation | Release/reset the scrub; it is not automatically committed |
| Preview/report recipe changes | Presentation configuration before creation | Reset audience/purpose or modules |
| Browser Back/Forward | Navigation context | Forward/Back; verify project label |

## Governed Reality writes

| Action | Canonical owner/write | Important non-effects |
|---|---|---|
| Accept Audit Scope proposal | Creates/updates an accepted Capability through Scope ownership | Does not invent execution links |
| Accept Audit Decision proposal | Creates an open, ungated Decision | Does not move Forecast |
| Accept Dependency proposal | Creates explicit dependency after required endpoints are complete | Does not follow from semantics alone |
| Accept milestone proposal | Creates a Timeline-owned event | Does not create a commitment unless the event state says so |
| Create / decide / revisit Decision | Updates Decision lifecycle and audit fields | Ungated decisions have zero model effect |
| Connect Decision to delivery | Creates DecisionGate for a target Scope with evidence and duration | Models strictly serial wait; does not prove correctness |
| Set actual team | Replaces legacy aggregate bases with confirmed complete named roster/allocations | Does not infer people from knowledge |
| Commit Scenario changes | Writes intended supported roster/allocation Reality | Refuses until complete actual team is established |
| Set canonical target | Updates owner target date through the supported control | Does not make it likely or committed |
| Add/edit/delete Timeline event | Writes Timeline-owned plan object | Cannot edit Report, Decision, Forecast, or Linear marks |
| Activate project | Atomic Scope/accepted objects/sources/snapshot/Audit/activation write | Creates no ticket mappings, gates, people, allocations, or milestones by implication |
| Create report | Stores an immutable snapshot plus recipe | Does not update itself when Reality changes |

## Derived consequences

- Forecast re-runs from updated Scope, Capacity, serial gates, and Dependencies.
- Dependent project landings propagate through the model.
- Timeline refreshes the live Forecast mark and preserves historical snapshots.
- Control Room re-reads owner instruments; it owns nothing.
- Report Readiness may clear or gain blockers.
- A future report uses the new state; previously generated reports remain historical.

## Before any consequential click

1. Confirm the selected project.
2. Read the exact button verb.
3. Read the “will” and “will not” language beside it.
4. Verify the evidence and currentness.
5. Confirm the target owner and object.
6. Know how you would recover. A Scenario has Discard; a governed write may require a new compensating write and audit trail.

