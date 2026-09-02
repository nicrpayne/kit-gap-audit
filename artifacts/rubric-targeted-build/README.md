# Rubric-targeted Signal Audit build proof

Starting SHA: `1c6fd27a226d97530ff14da3f397399a17cfede8`

Architecture law exercised: **Rubric owns space. Audit owns meaning.**

## Browser measurements

- Rings Fit: 55 of 427 canonical identities projected, 27 opened, 8 aggregate regions.
- Constellations Fit: 55 of 427 canonical identities projected, 91.7% of far-tier members nearest their own hub, 28.0% largest territory area share.
- Full opened Constellations proof: 370 of 408 members nearest their own hub (90.7%).
- `notifictions`: 421 opened in the audit baseline; 152 after this pass; clearing returns to 27. A second identical search repeats 152 -> 27 without accumulation.
- Transcript search/selection: 222 identities remained open in the audit baseline; 29 remain after this pass and clearing Search.
- Finding Trace: 0 route endpoints offscreen; selected Finding onscreen.
- External-intelligence Trace: 0 route endpoints offscreen; selected claim onscreen.
- Rings -> Constellations morph: 37% -> 37%; selected Finding remained onscreen.
- Direct pan/zoom: exercised at 69%; selected Finding remained onscreen and the flight did not resume.

## Verification

- Production build: passed.
- Standalone TypeScript: passed.
- Focused lint: passed.
- Renderer/spatial/camera proof: 124/124 passed.
- Search proof: all checks passed, 2 environment-dependent checks skipped.
- Browser matrix: Rings Fit, Constellations Fit, typo Search, transcript Search, selected Risk, Finding Trace, external Trace, layout morph, direct pan/zoom.

The database-backed legacy interaction proof could not start because this isolated checkout intentionally has no `DATABASE_URL`. Its relevant interaction cases were exercised directly in the fixture-backed browser candidate.

## Screenshots

- `screenshots/rings-fit-after.jpg`
- `screenshots/constellations-fit-after.jpg`
- `screenshots/search-notifictions-after.jpg`
- `screenshots/transcript-selected-cleared-after.jpg`
- `screenshots/selected-risk-after.jpg`
- `screenshots/finding-trace-after.jpg`
- `screenshots/external-trace-after.jpg`
- `screenshots/morph-rings-before.jpg`
- `screenshots/morph-constellations-after.jpg`
- `screenshots/dense-cluster-pan-zoom-after.jpg`
