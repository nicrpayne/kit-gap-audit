# Canonical model mapping

| Accepted candidate | Canonical representation | Explicit non-effect |
|---|---|---|
| Project identity | `Scope` + `ScopeAlias` | Alias does not become an execution filter |
| Capability | `Capability` | Does not imply work exists |
| Execution link | `CapabilityWorkLink` | Does not synthesize tickets |
| Decision | `Decision` + exact evidence | Never creates `DecisionGate` |
| Dependency | `ScopeDependency` + compatibility projection | Semantic/temporal relation alone is insufficient |
| Milestone | `TimelineEvent` with `semanticState` | Projection is not a commitment |
| Source | `SourceRegistration` | Raw body is not copied into canonical Reality |
| Person mention | none | Never creates `Person` or `Allocation` |

Every activation-created model that can be traced to a candidate stores the source candidate ID and/or explicit provenance. Rejected/deferred/information-only candidates remain solely in the bootstrap ledger and snapshot context.
