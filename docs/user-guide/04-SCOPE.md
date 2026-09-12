# Scope

## 1. Purpose

**Question:** What are we actually shipping, and how completely is that product shape represented by executable work?

## 2. Why it is powerful

Scope keeps product intent separate from tickets without losing the connection. It shows accepted Capabilities, their modeled distributions, mapped work, unrepresented execution, open shape Decisions, and the release floor.

## 3. Mental model

Capabilities are modules on a deck. Accepted shape stays cyan; unsettled shape is violet; unmapped execution is amber/hatching; parked/out-of-release shape has a broken conductor. Scenario removal leaves a vacated seat so Reality remains visible.

## 4. Truth / ownership boundary

Scope owns product-shape Capabilities and their active execution links. Decisions owns shape tension; Dependencies owns precedence; Capacity owns FTE; Forecast owns delivery consequence. Scope reads all three and provides doors.

## 5. Inputs

Accepted Capabilities, CapabilityWorkLinks, current Linear work, three-point estimates, open product-shape Decisions, Scenario overlays, Capacity/Forecast reads.

## 6. Outputs

Covered executable set, accepted-shape census, modeled load, coverage reasons, and scenario deltas consumed by Forecast, Timeline, Control Room, Reports, and Audit readiness.

## 7. Screen tour

| Area | Meaning |
|---|---|
| Project selector / Scope strip | Selected project and Reality/Scenario state |
| Accepted shape mapped | `mapped accepted capabilities / accepted capabilities`, plus execution item count |
| Product-shape summary | Coverage state, unresolved shape, modeled execution |
| Capability module | Accepted capability with distribution and mapped items |
| Distribution | Low→high span, likely locator, peak concentration; width is uncertainty, not size |
| NO EXECUTION WORK MAPPED | Accepted capability exists but has no current active work link |
| NO CAPABILITY YET | Execution items are not represented by an accepted product capability |
| In-release bay | Active product shape |
| Out-of-release rail | Parked capability; not deleted |
| Add capability | Scenario draft/manual shape; not persistent in this production contract unless owner path supports it |
| Open shape Decision | Read-only Decision door; Scope cannot settle it |
| Lock rail / floor | Serial gates and earliest modeled floor; individual locks light only when dominant |
| Forecast basis strip | Effective FTE, modeled load, likely result, delta vs Reality |
| Open Forecast | Handoff to consequence owner |

## 8. Primary happy path

1. Verify project and Reality state.
2. Read the accepted-shape mapping summary.
3. Open each amber/unmapped module; identify whether the missing piece is a link, missing current ticket, or unresolved shape.
4. Inspect **NO CAPABILITY YET** work separately; decide whether a Capability should be governed or work is intentionally outside shape.
5. Follow open shape Decisions to Decisions.
6. Use a Scenario to remove or re-estimate one capability and read load/forecast effect.
7. Return to Reality; govern actual shape through the supported owner action.

## 9. Secondary journeys

- Compare a capability's active curve with its dashed Reality ghost.
- Park a capability in Scenario to learn whether the date is floor-dominated.
- Inspect mapped work and three-point estimate provenance.

## 10. Writes / side effects

Scenario composition is local. Accepted Audit changes can create/update canonical Capabilities. Execution mapping writes Scope-owned links/settings. A future/manual draft is not canonical merely because it is visible.

## 11. What it does not do

It does not decide an open Decision, allocate people, declare a dependency, promise a date, or infer a capability solely from tickets. A ticket parent is execution structure, not automatically product intent.

## 12. Warnings / empty states

- **No execution work mapped:** blocks canonical forecast coverage for accepted shape.
- **No capability yet:** product shape is incomplete even if execution exists.
- **Open shape Decision:** coverage remains modeled subset.
- Stale/empty execution source creates coverage reasons.

## 13. Handoffs

Decisions for shape tension; Scopes settings for execution source/mapping; Forecast for outcome; Capacity for people; Audit for upstream evidence.

## 14. Common mistakes

Equating work count with value; reading curve height as effort; assuming a candidate capability is accepted; treating parked work as deleted; committing a visual experiment as Reality.

## 15. Troubleshooting

If mapped links exist but coverage says absent, confirm those IDs appear in the current execution read. If zero work returns, distinguish configured-empty from source-unavailable. Verify project context.

## 16. Operator checklist

- [ ] Accepted capabilities reflect intended product shape
- [ ] Every accepted capability's current work mapping understood
- [ ] Uncontained execution reviewed
- [ ] Shape Decisions routed
- [ ] Coverage state understood before using Forecast

## 17. Real example

JSA may have an accepted Offline Capture capability with work mapped and an Investigation capability with **NO EXECUTION WORK MAPPED**. The model can compute the mapped subset, but Signal must label the project forecast incomplete until the accepted Investigation shape is represented.

