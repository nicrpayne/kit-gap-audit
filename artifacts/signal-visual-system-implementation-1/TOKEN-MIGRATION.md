# Token migration

## Added semantic roles

- Graphite depth: `surface-void`, `surface-canvas`, `surface-panel`, `surface-raised`, `surface-recessed`.
- Structure: `border-subtle`, `border-strong`, `border-selected`.
- Type: `text-primary`, `text-secondary`, `text-tertiary`, `text-disabled`.
- Meaning: `reality`, `scenario`, `attention`, `risk`, `positive`, `source`, `evidence`, `inactive`, including the approved soft/muted/contrast variants.
- Reality comparison: `reality-reference` and `reality-reference-soft`.
- Interaction: `focus-ring`, `hover-overlay`, `selected-overlay`, `selected-shadow`, `disabled-opacity`.
- Material recipes: `control-fill`, `control-shadow`, `recess-shadow`, `widget-fill`, `widget-shadow`.
- Narrow compatibility role: `time-frame` remains available until Timeline receives its own migration.

## Compatibility decisions

Existing `--i-*` consumers continue to resolve through semantic aliases, allowing staged adoption without broad body churn. `--i-signal` maps to current Reality cyan. `--i-violet`, `--i-amber`, `--i-red`, `--i-mint`, `--i-source`, and `--i-silver` map to Scenario, Attention, Risk, Positive, Source, and Evidence respectively.

`--i-reality` deliberately does **not** map to live/current Reality. Its established use is the comparison ghost, so it now maps to neutral `--signal-reality-reference`. This prevents baseline comparison material from silently inheriting cyan current-truth semantics.

Audit runs in an iframe, where root custom properties cannot inherit. `lib/visual-system/auditEmbeddedTheme.ts` is the single explicit bridge; the proof script verifies all 23 bridged values exactly match `app/globals.css`.

No new `--color-*` declarations were introduced, and no new literal semantic colors appear outside the two token bridge files.

