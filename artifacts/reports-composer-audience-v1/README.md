# Signal Reports — Audience Lenses + Brief Composer

## Product recommendation

Make **Delivery Leadership / Weekly Update** the flagship default. It answers, in the first viewport: where delivery is likely to land, how that differs from target, whether a commitment exists, what moved, why, what can accelerate, and which asks have actually been promoted by the operator.

Reports now follows one directional pipeline:

`canonical owners → immutable DecisionBriefV1 → BriefRecipeV1 → BriefPresentationV1 → saved/print/Markdown/Site handoff`

The recipe changes selection, order, density, and explicitly authored context. It cannot change the source snapshot or run a new simulation. Every surface carries the `DecisionBriefV1` fingerprint.

## What is implemented

- Six audience presets and eight purpose presets.
- A constrained three-part composer: module browser, ordered arrangement rack, and selected-module inspector.
- Drag reordering, active/inactive modules, density control, audience/purpose transport, operator-confirmed leadership asks, and Reality/Scenario labeling.
- A finished in-app brief with progressive disclosure, Markdown, plain text, and browser-print output.
- `InteractiveBriefBundleV1` plus a guarded `@Sites` handoff prompt.
- Immutable persistence of `briefSnapshot` and its `briefRecipe`; legacy DecisionBriefV1 and older Report rows remain readable.
- Deterministic Signal's Read and schedule-driver selection from frozen facts only.
- Local deterministic prototype at `/reports/composer/fixture` and print fixture at `/reports/composer/fixture/print` (development only).

## Protected boundaries

- No Monte Carlo or Rubric runtime changes.
- No new Forecast semantics.
- No Finding-to-current-Decision inference.
- No invented commitment, named Capacity, allocation split, support tail, KIT Construct world, or scenario outcome.
- No production write, deployment, Site creation, or publishing action.

## Visual evidence

- [Composer rack](screenshots/composer-rack.png)
- [Executive finished brief](screenshots/executive-finished-brief.png)
- [Site handoff preview](screenshots/site-handoff-preview.png)
- [Responsive composer](screenshots/composer-responsive.png)

The local visual layer is intentionally isolated in a Reports CSS module so the Visual System branch can later replace palette/material hooks without touching the truth and recipe contracts.
