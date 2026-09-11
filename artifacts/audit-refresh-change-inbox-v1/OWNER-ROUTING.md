# Owner Routing

| Audit delta | Canonical owner action | Guardrail |
| --- | --- | --- |
| Capability added/removed/changed | Scope `Capability` upsert | Stable proposal source key prevents duplicates |
| Target date | Scope target-date update | Confirmation sheet when semantic/date confirmation is required |
| Open contradiction | Decisions creates `Decision(status=open)` with options and evidence | Never chooses an option; never creates a DecisionGate |
| Decided choice | Decisions creates/updates a decided Decision | Resolution and chosen option must be explicit |
| Synthetic Decision retirement | Decisions dismisses the identified test Decision | History retained; open gate no longer participates in Forecast because Decision is not open |
| Dependency | Dependencies creates `ScopeDependency` and backwards-compatible Forecast projection | Both valid endpoints and causal evidence required |
| Occurred/planned milestone | Timeline creates typed `TimelineEvent` | DateOnly contract; semantic and temporal states preserved |
| Stale/resolved Finding | Findings updates the existing Finding | No duplicate governing object |
| Source health/configuration | Project setup handoff | Cannot be accepted as product truth |
| Capacity | Capacity/allocation handoff | Person mentions never become staffing |

Every canonical owner mutation runs in a serializable transaction with the proposal acceptance receipt and derived-state invalidation. Unsupported or incomplete owner actions return a completion requirement and leave Reality unchanged.
