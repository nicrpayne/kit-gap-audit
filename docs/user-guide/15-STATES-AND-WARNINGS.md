# States and Warnings

This catalog describes the production contract. Labels may appear in sentence case or uppercase depending on surface density.

## Knowledge and refresh

| State | What it means | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| Knowledge · Current | Latest completed package and frozen ContextSnapshot agree | No, if source health is also acceptable | Continue to Change Inbox/Control Room | Current means complete or correct |
| New intelligence available · Refresh | A completed package or Hermes watermark is newer than the snapshot | Usually actionable | Refresh Audit, then govern proposals | Reality already changed |
| Hermes ingestion in progress · waiting | Upstream knowledge is between stable states | Wait, not failure | Let ingestion finish | Partial state is safe to ingest |
| Refreshing Audit… | Companion is compiling the latest completed knowledge | No | Wait and reopen inbox when complete | The old snapshot changed in place |
| Knowledge companion offline | Local companion missed its online window | Yes if freshness matters | Restore companion/bridge | Railway can read the local corpus directly |
| Knowledge refresh unavailable | Project lacks activation/companion identity | Configuration gap | Use project setup/activation path | Refresh is merely hidden |

## Audit proposal lifecycle

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| pending | Proposal awaits operator disposition | Review | Compare evidence and owner effect | Proposal is correct |
| needs_completion | Owner write requires missing explicit fields/confirmation | Yes before acceptance | Supply truthful endpoints/date/confirmation or defer | Audit may infer them |
| accepted | Named owner mutation completed | Verify downstream | Open canonical object | Acceptance validated every upstream claim |
| deferred | Proposal retained for later | Only if it blocks work/reporting | Reopen when ready | Deferred is rejected |
| rejected | Operator declined proposal | No, if reason is sound | Leave historical record | Source evidence was deleted |
| information_only | Retained as context with no owner mutation | No | Use for understanding | It changes delivery truth |

## Forecast coverage

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| forecastable / Canonical Delivery Forecast | Execution source is configured; accepted capabilities are mapped into current work; no open shape Decision; dependency closure is covered | Normal uncertainty remains | Read likely/window/target confidence | Forecast is a commitment |
| modeled_subset / Forecast Incomplete | Model ran, but accepted shape or dependency closure is not fully represented; unmapped work is excluded | Yes for project-wide claims | Follow coverage reasons to Scope/Decisions/dependencies | Displayed date covers whole project |
| unavailable / Forecast Unavailable | No reliable execution input for the project or dependency closure | Yes | Configure/restore execution source and mapping | No work or instant delivery |
| Forecast stopped | The model refused, e.g. cyclic dependency or fetch error | Yes | Follow repair door; do not use page readings | Loading will eventually finish |

Coverage reasons include execution source not configured/unavailable/stale/empty, accepted capability unmapped, mapped work absent from the current read, open product-shape Decisions, and incomplete dependency coverage.

## Capacity reconciliation

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| aggregate_unreconciled | Forecast still uses a legacy project-level capacity basis | Yes for named staffing claims | Set the complete actual team | Aggregate FTE names real people |
| named_partial | Some named allocations exist, but reconciliation is incomplete | Yes | Complete roster and confirm totals | Partial people sum is authoritative |
| named_exact | Complete roster confirmed; Forecast consumes the exact effective named sum | Good | Keep roster current | People-to-ticket assignment is known |
| raw FTE | Sum allocated before shared switching cost | Informational | Compare to effective | It is Forecast capacity |
| effective FTE | Raw allocation after context-switch factor | Important | Use to explain consequence | It measures productivity |

## Scope and execution

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| Accepted capability, mapped | Product shape exists and at least one active link is present in current execution work | Good | Inspect work/estimate coverage | Mapping proves delivery completion |
| NO EXECUTION WORK MAPPED | Accepted capability has no active current execution link | Yes for forecast coverage | Map current executable work | Capability is not real |
| NO CAPABILITY YET | Execution work has no accepted product-shape container | Yes for product understanding | Govern a capability or intentionally park | Tickets define product intent |
| Out of release / parked | Capability is intentionally outside active modeled release shape | Contextual | Confirm the state is deliberate | Work was deleted |
| Open shape Decision | Product boundary is unresolved | Yes for canonical forecast | Settle in Decisions | Scope may decide it silently |

## Source temporal state

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| live + current | Current owner feed inside freshness horizon | Usually no | Use with provenance | Complete/correct |
| live + stale | Current owner feed exists but is older than the horizon | Yes | Refresh owner/source | Historical only |
| historical | Immutable past snapshot/report | No if clearly labeled | Compare to live state | Current |
| current | Age within threshold | Good | Still judge evidence | Canonical |
| stale | Age beyond threshold (default source currentness is over seven days) | Context-dependent | Refresh or disclose | False |

## Report readiness and history

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| Report Ready | Current execution, Scope, capacity, source health, and Forecast checks pass | Good at that moment | Open Reports and review recipe | Future report remains current forever |
| Report Not Ready | One or more named readiness blockers exist | Yes | Follow blocker doors | Reports should hide the caveat |
| Reality report | Snapshot generated from Reality inputs | Normal | Verify generated-at and sources | It is live after save |
| Scenario report | Snapshot generated from explicit Scenario inputs | Be explicit | Label scenario for audience | It is approved Reality |
| Historical snapshot | Frozen report retained exactly as generated | Normal | Read provenance banner and live delta | Copying it omits staleness warning |

## Decision lifecycle

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| candidate | Machine-suggested choice | Review | Accept or dismiss | Decision exists in Reality |
| open | Real unresolved Decision | Sometimes | Resolve or connect only if truly serial | Forecast moves |
| decided | Chosen option/resolution recorded | No | Inspect rationale/evidence | Historical gate effect remains active |
| dismissed | Not a Decision to pursue | No | Leave audit trail | Evidence disappeared |
| revisited | A settled choice was reopened/reframed | Yes | Re-evaluate downstream claims | Old rationale still governs |
| superseded | Replaced by another canonical Decision | No if linked clearly | Follow successor | Both decisions are active |
| gated | Open Decision has a serial DecisionGate | Material | Validate target, why, evidence, range | Importance alone justifies gate |
| ungated | Decision has no DecisionGate | Common | Keep open without schedule effect | Unimportant |

## Timeline states

| State | Meaning | Worry? | Do next | Do not assume |
|---|---|---|---|---|
| planned milestone | Timeline-owned intended date | Normal | Adjust only in Timeline | Projected outcome |
| projected milestone / Forecast mark | Derived current model landing | Watch movement | Open Forecast for drivers | User commitment |
| committed | Explicit canonical commitment state | Material | Keep separate from likely/target | Forecast guarantees it |
| occurred | Historical event happened | No | Preserve actual date | Planned date was accurate |
| Today / NOW | Timeline's current reference instant | No | Use as comparison point | Browser time owns model truth |

## UI and navigation warnings

| Warning | Meaning | Next action |
|---|---|---|
| Needs a wider screen | Dense instrument would clip controls below 1024 px | Widen window; Audit, Reports, Settings remain usable |
| Reading the project… | Required owner reads have not completed | Wait briefly; if it persists, look for a named error |
| No Scope configured | Project mapping does not exist | Use Scopes settings or Activation |
| Candidate / NOT REALITY | Preview/review object is noncanonical | Govern explicitly or leave it outside Reality |
| Derivative only | Support comes through synthesis, not independent raw evidence | Inspect lineage; seek primary evidence if material |

