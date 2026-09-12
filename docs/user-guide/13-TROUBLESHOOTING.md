# Troubleshooting

## Triage sequence

1. Verify the selected project in the strip/URL.
2. Decide whether the problem is **access**, **source freshness**, **coverage**, **governance**, or **computation**.
3. Read the named state and reason. Signal generally refuses rather than inventing a number.
4. Follow the owner door. Repair the owner input, then return to the composed surface.
5. Recheck Audit → Report Readiness before communicating.

| Symptom | Likely cause | Safe response |
|---|---|---|
| Login loop | Session cookie/password boundary | Re-authenticate; preserve the `next` destination |
| Wrong project after navigation | Missing/old URL context | Use project selector; verify `project=` survives Back/Forward |
| “Needs a wider screen” | Viewport below instrument floor | Widen to at least 1024 px; do not assume hidden controls exist off-screen |
| Knowledge companion offline | Local companion heartbeat expired | Restore companion; never try to make Railway read local files directly |
| Hermes ingestion in progress | Upstream state not complete | Wait; do not refresh partial knowledge |
| New intelligence never appears | Watermark/package/snapshot identities agree or bridge is not posting | Inspect companion, package time, and activation identity |
| Refresh stays running | Companion job stalled | Check scan/job status; avoid repeated clicks |
| Change cannot be accepted | Required owner fields/confirmation missing | Complete truthful endpoint/date/evidence; otherwise defer |
| Forecast unavailable | Execution source not configured/unavailable, including a dependency | Open Scope/project setup; restore reliable execution read |
| Forecast incomplete/modelled subset | Unmapped accepted shape, stale/empty execution, open shape Decision, or incomplete dependency | Use the exact coverage reasons; do not report the date as full-project |
| Forecast stopped | Dependency cycle or computation/fetch refusal | Follow Scopes repair door; remove the false cycle in the owner model |
| Capacity says aggregate unreconciled | Legacy FTE still powers Forecast | Set complete actual named team |
| Cannot commit Scenario | Actual team incomplete or unsupported change mix | Reconcile roster first; commit only supported Reality inputs |
| Date did not move | Changed input is not dominant, decision is ungated, or target scrub is evaluative | Inspect drivers, floor, and dependency path; unchanged can be correct |
| Open Decision shows zero effect | It has no DecisionGate | Correct by design; connect only with serial evidence |
| Timeline item will not drag/delete | It is owned by Forecast, Report history, Decisions, or Linear | Open the owning instrument; only TimelineEvent rows are editable here |
| Saved report disagrees with live Forecast | Reports are immutable historical snapshots | Read banner/live delta; create a new report after readiness |
| Search result does not imply causality | Match or inferred edge is not a declared dependency | Use Trace/Inspector; govern topology separately |
| Source is green but content is wrong | Provider health is connectivity/configuration, not truth | Correct upstream source and refresh Audit |

## Recovery rules

- **Scenario mistake:** Back to Reality / Discard.
- **Proposal mistake before acceptance:** Edit, defer, or reject.
- **Governed write mistake:** use the owning instrument to create an explicit compensating update; preserve history.
- **Activation uncertainty:** stop at the manifest. Activation is the boundary, not a preview.
- **Report mistake:** create a corrected new snapshot. Do not rewrite history.

## Escalate as a product issue when

- the state label and number contradict each other;
- two instruments disagree on the same owner fact;
- Back/Forward changes project context unexpectedly;
- a control writes without naming its effect;
- a read-only surface appears to own a write;
- the app presents a modeled subset as canonical;
- a historical report lacks generated-at/currentness provenance;
- the UI stays in a loading state after a deterministic refusal.

Log project, route, reproduction, expected/actual, screenshot, source-vs-data classification, and whether documentation is blocked.

