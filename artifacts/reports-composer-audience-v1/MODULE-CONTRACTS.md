# Module contracts

Every module binds to a frozen `DecisionBriefV1` slice. The inspector exposes owner, bindings, permitted facts, as-of, currentness, and suitable audiences.

| Module | Owner | Frozen bindings | May say |
|---|---|---|---|
| Delivery Outlook | Forecast | headline window/confidence/target | likely window, target, confidence, Reality/Scenario |
| Signal's Read | Presentation | headline/calls/changes/caveats | deterministic synthesis only |
| Why This Date | Forecast + canonical inputs | gated Decisions, dependencies, Scope, Capacity | up to four supported drivers |
| Commitment | Timeline boundary | likely/target/milestone | likely and target separately; commitment or explicit absence |
| Movement | ReportHistory | headline.movement | comparison against identified historical saved brief |
| What Changed | Audit/Scope | changes.audit/delivery/currentness | comparable Audit and delivery deltas |
| Acceleration Levers | Forecast | movable.scenarioOptions | owner-provided consequences only |
| Leadership Asks | Decisions | calls.decisions | confirmed promotions and clearly separate candidates |
| What's Next | Timeline | nextMilestone/calls | nearest milestone/call/dependency |
| Decisions | Decisions | calls.decisions | first-class open Decisions; gated/ungated semantics |
| Dependencies | Dependencies | calls.dependencies | declared Scope dependency edges |
| Executable Scope | Forecast | movable.scope | de-duplicated executable count and effort range |
| Capacity | Capacity | movable.capacity | named/effective FTE only when reconciliation passes |
| Timeline | Timeline/Forecast | timeline | LIVE Current Forecast, milestone, conflicts |
| Audit Delta | Audit | changes.audit | run IDs, new/resolved Findings, comparison currentness |
| Evidence | Audit | evidence | grounding/currentness and deep links |
| Source Health | ContextSnapshot | sourceSnapshots/currentness | owner, as-of, temporal role, provider health |
| Missing Inputs | ContextSnapshot | caveats | missing/stale/unreconciled/weak-grounding limits |
| Operator Note | Presentation | recipe.operatorNote | explicitly authored context only |

No module owns a read path, database call, simulation, or mutation.
