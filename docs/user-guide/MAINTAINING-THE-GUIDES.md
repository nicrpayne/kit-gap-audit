# Maintaining the Signal Guides

## Release-time workflow

1. Fetch origin and call live `/api/version`.
2. Record commit, tree, deployment ID, environment, time, and reported branch in `SOURCE-STATE.md`.
3. Compare the deployed tree with the documentation base. Stop if they differ.
4. Walk the authenticated production route matrix read-only, including project switching, Back/Forward, warnings, empty states, Inspector, Trace, and narrow-screen refusal.
5. Run consequential states only in the documented disposable fixture.
6. Update the owner guide first, then cross-instrument guides, quick reference, training sessions, scripts, visuals, and handbook.
7. Update coverage matrix and bug logs. Never resolve a finding by deleting the row; record disposition/backlog link.
8. Run link, required-section, image, and production-marker checks.
9. Review the rendered handbook and every annotated image at 100% scale.
10. Commit the documentation and push the branch. Product deployment is a separate decision.

## Screenshot contract

Each screenshot needs:

- deployed short SHA in its companion index;
- environment (`production` or named fixture);
- project and route;
- capture date/time and timezone;
- state/preconditions;
- whether a write was used to create the state.

Recapture when a label, control, layout, warning, value contract, route, or ownership rule changes. A screenshot is stale when its recorded SHA differs from production and the affected surface changed; SHA difference alone is a review trigger, not proof of visual drift.

## Known limitations lifecycle

- Add a limitation only when verified in the production tree or live app.
- State the operator consequence and safe behavior.
- On retirement, link the release/commit and remove related script fallback lines.

## Bug handoff

Move product findings from `BUGS-FOUND-DURING-DOCUMENTATION.md` into the team backlog with the same ID and evidence. Keep the documentation row until the fix is deployed and verified; then mark it resolved with the production commit.

## Training script drift

When UI changes, search the scripts for the old label and update narration, cursor action, screenshot cue, fallback, and expected duration together. Do a silent screen run, then a spoken timing run against the stable fixture.

## Lightweight validation checklist

- [ ] Live `/api/version` equals documentation base.
- [ ] Every production rail destination has a guide and quick reference.
- [ ] Every major control appears in the coverage matrix.
- [ ] Writes say what they change and what they do not change.
- [ ] Scenario and Reality are never visually or verbally blurred.
- [ ] Likely, target, and commitment remain distinct.
- [ ] Live/current/historical/stale remain distinct.
- [ ] Modeled subset is never described as a full forecast.
- [ ] All visuals carry provenance and readable callouts.
- [ ] Full and showcase scripts have fallback lines.
- [ ] Stable fixture numbers still match.
- [ ] Handbook links and print layout render correctly.

