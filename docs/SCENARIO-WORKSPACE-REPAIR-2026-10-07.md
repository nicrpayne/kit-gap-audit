# Signal Scenario workspace repair

This release candidate adds named Scenarios, dated staffing moves, and clearer source freshness. It also repairs stale Scenario previews and report save feedback. It is a local engineering candidate, not production acceptance or real-project report signoff.

## What changes for the operator

- **Saved Scenarios:** save a named what-if, reopen it on another visit, update it, save a copy, or archive and restore it. Returning to Reality clears the working draft, not named saves.
- **Reload recovery:** the current tab keeps a recovery copy. A recovered or reopened Scenario waits for a fresh project-input check before showing its forecast. If inputs changed, the draft stays intact and asks for review.
- **Dated staffing:** Portfolio has a “Plan a staffing move” control. Choose a person, source project, destination, share of their capacity, and a date. Forecast and report replay use the same dated plan. Accepted assignments do not change.
- **Freshness:** Control Room separates the latest project read, knowledge-package receipt, source observation dates, and saved-report age. A historical quote is not automatically a broken connection or a current blocker.
- **Consistent displays:** changing a Scenario shows a recalculating state, not a previous Scenario date. Returning to Reality immediately selects its own result. A failed Scenario never falls back to a successful date under a Scenario label.
- **Report feedback:** every failed live Forecast read blocks generation. A successful report save remains successful if the following history refresh fails; the UI identifies the failed read separately.

## Staffing limits that remain explicit

The move date is a hypothesis chosen by the operator. “Move Pancho after Offline finishes” is not yet a supported completion trigger. No handoff date was invented for the real project.

The model conserves named capacity and outside commitments. It refuses a plan that cannot finish the modeled work within its funded capacity window. A blocking decision consumes waiting time before work begins, so capacity available only before that decision cannot be counted as delivered effort.

Forecasting still uses calendar days and pooled effective FTE, not a weekday and holiday calendar or a task-level resource scheduler. Existing project dependencies remain completion floors. Capability-level isolated forecasts do not become a complete task schedule through this feature.

Immediate staffing experiments and dated transfers cannot be combined in one draft. Portfolio faders show current allocation; future moves appear in the dated plan and its forecast. Past dates retained in a saved plan apply at the current forecast start after review; the add-move form only accepts dates on or after that start.

## Persistence and access

The migration adds `SavedScenario` and `SavedScenarioMutation`; it does not alter or remove accepted project data. Scenario replacement and archive actions use revision checks and durable retry keys. Unknown fields and oversized payloads are refused. A changed forecast start day also requires review; incidental same-day read times do not.

Named Scenarios belong to Signal’s existing shared workspace. They are not private executive publications. The API inherits the app’s current authentication: `APP_PASSWORD` protects it when configured; without that setting the existing middleware permits access. This release does not add individual user identities, email allowlists, or executive report hosting.

Same-tab recovery uses session storage. Opening a fresh tab does not automatically load a named Scenario; use the library. Browser storage restrictions may prevent recovery, but they do not remove named server saves.

## Required browser acceptance before production

Use a disposable staging fixture with at least two named people, two projects, and fully classified test scope. Do not accept or reclassify real iTrack decisions to make this test pass.

1. Open Control Room. Verify a recent source receipt and an old quoted conversation appear as different concepts. Compare Live Now and Timeline at Now in the local timezone.
2. Change scope and a remaining estimate in Scenario. Navigate through Scope, Decisions, Forecast, Portfolio, Timeline, and Reports. Confirm chips and dates refer to the same draft, with recalculating states rather than stale results.
3. Save the Scenario, reload the tab, return to Reality, and reopen the named save. Confirm every lever survives and accepted Reality remains unchanged. Open the library in another tab and verify the named version is available.
4. Edit the same named Scenario in two tabs. The second outdated update must receive a revision conflict without losing its draft. Retry an uncertain response and confirm no duplicate saved version is created.
5. Change a fixture ticket or accepted estimate. Reopen the saved Scenario. Verify it is marked for review, cannot silently forecast against the new inputs, and still preserves its original levers. Check the same behavior when the forecast start day advances.
6. Add a dated staffing transfer. Compare Forecast, Portfolio, and a generated Reality versus Scenario brief. Verify the person’s outside commitment and total capacity remain conserved. Test zero initial destination capacity followed by a later arrival.
7. Move all source capacity away before its high remaining-work bound can finish. Verify a visible refusal rather than an old forecast or invented completion. Add a serial decision wait and confirm work does not consume pre-decision capacity.
8. Archive and restore a named Scenario. Confirm the draft and accepted Reality remain intact. Test keyboard focus, Escape, small screens, and rapid changes without losing input focus.
9. Generate the Reality and Scenario report pair using the fixture. Simulate a failed history read after the save; verify the saved receipt remains visible and a retry does not create a duplicate comparison.
10. Inspect report rendering and exports. This candidate does not satisfy the separate requirement to deploy an email-restricted executive report site.

## Evidence boundary

Local verification covers deterministic model checks, generated capacity schedules, server-rendered refusal checks, actual route handlers, isolated PostgreSQL persistence, report transactions and frozen replay, TypeScript, and the production build. These are not substitutes for interactive browser acceptance.

The final integrated run passed all 38 recorded checks, including 250 generated capacity schedules inside the phased-capacity proof. Focused lint had zero errors and ten pre-existing unused-variable warnings in Portfolio.

The supported browser tool refused both production and the separate loopback development page because its admin-enforced security policy could not be verified. No alternative browser automation or direct production API calls were used to bypass that refusal. No production data was changed during this tranche.

Detailed check logs and the completion manifest are in the adjacent repair workspace output folder, `outputs/scenario-workspace-2026-10-07/checks/`.

## Work still needed for the complete product

After browser acceptance, apply the additive migration in staging, verify the candidate there, and then release it through the normal deployment path. Recheck the deployed build and preservation before calling production verified.

The owner’s wiki refresh, iTrack ticket classification, remaining estimates, decisions, and staffing review are separate business-input steps. Those unresolved inputs must remain visible; this release does not manufacture their answers.

Private executive publishing still needs named-recipient access control, revoke and denied-access tests, a deployable report snapshot with drill-down and timeline content, and an end-to-end acceptance journey from fresh Audit through that restricted site. Completion-trigger staffing is a later modeling feature.
