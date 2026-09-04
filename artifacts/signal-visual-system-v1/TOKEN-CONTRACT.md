# Token and implementation contract

## Naming model

Use names that describe product meaning, then state, then variant:

```css
:root {
  /* Surfaces */
  --signal-surface-void: #090c0f;
  --signal-surface-canvas: #0e1317;
  --signal-surface-panel: #151b20;
  --signal-surface-raised: #1c242a;
  --signal-surface-recessed: #070a0c;

  /* Structure */
  --signal-border-subtle: #29323a;
  --signal-border-strong: #3a4650;
  --signal-border-selected: #bec9d0;

  /* Text */
  --signal-text-primary: #f3f0e7;
  --signal-text-secondary: #a1abb3;
  --signal-text-tertiary: #808c95;
  --signal-text-disabled: color-mix(in srgb, var(--signal-text-primary) 52%, transparent);

  /* Semantic light */
  --signal-reality: #51c9db;
  --signal-reality-soft: rgb(81 201 219 / 14%);
  --signal-scenario: #a397fa;
  --signal-scenario-soft: rgb(163 151 250 / 16%);
  --signal-attention: #e3b455;
  --signal-attention-soft: rgb(227 180 85 / 14%);
  --signal-risk: #f07162;
  --signal-risk-soft: rgb(240 113 98 / 14%);
  --signal-positive: #53d7aa;
  --signal-positive-soft: rgb(83 215 170 / 14%);
  --signal-source: #63acd0;
  --signal-source-soft: rgb(99 172 208 / 15%);
  --signal-evidence: #bec9d0;
  --signal-evidence-soft: rgb(190 201 208 / 13%);
  --signal-inactive: #808c95;

  /* Interaction */
  --signal-focus-ring: #a397fa;
  --signal-hover-overlay: rgb(255 255 255 / 4%);
  --signal-selected-overlay: rgb(190 201 208 / 9%);

  /* Material recipes */
  --signal-control-fill: linear-gradient(180deg, var(--signal-surface-raised), var(--signal-surface-panel));
  --signal-control-shadow: inset 0 1px rgb(255 255 255 / 5%), 0 2px 5px rgb(0 0 0 / 45%);
  --signal-recess-shadow: inset 0 2px 7px rgb(0 0 0 / 58%), inset 0 -1px rgb(255 255 255 / 3%);
  --signal-widget-shadow: -18px 14px 40px rgb(0 0 0 / 42%);
}
```

The actual implementation may tune values after browser QA, but it must keep
these roles and naming boundaries. Components use semantic names; palette
values remain centralized.

## Compatibility aliases

Phase 1 adds aliases so existing components do not churn:

```css
:root {
  --i-void: var(--signal-surface-void);
  --i-bg: var(--signal-surface-canvas);
  --i-panel: var(--signal-surface-panel);
  --i-panel-raised: var(--signal-surface-raised);
  --i-recess: var(--signal-surface-recessed);
  --i-border: var(--signal-border-subtle);
  --i-border-strong: var(--signal-border-strong);
  --i-text: var(--signal-text-primary);
  --i-text-soft: var(--signal-text-secondary);
  --i-text-faint: var(--signal-text-tertiary);
  --i-signal: var(--signal-reality);
  --i-violet: var(--signal-scenario);
  --i-amber: var(--signal-attention);
  --i-red: var(--signal-risk);
  --i-mint: var(--signal-positive);
  --i-source: var(--signal-source);
  --i-silver: var(--signal-evidence);
}
```

`--i-reality` must not be blindly aliased: it currently means the muted
Reality comparison ghost, not live Reality. Replace those call sites with
`--signal-reality-reference` (neutral) before retiring it.

Legacy `--color-*` continues only inside `.i-legacy` during migration. New code
must not consume it.

## Composite state contract

A component never asks for “purple.” It declares axes:

- `data-signal-status="reality|scenario|attention|risk|positive|neutral"`
- `data-signal-time="current|stale|superseded"`
- `data-signal-basis="attested|inferred|external"`
- `data-signal-interaction="rest|hover|selected|disabled"` when CSS state alone
  is insufficient.

Status chooses hue. Time chooses marker/opacity. Basis chooses stroke pattern.
Interaction adds edge/elevation without replacing status.

## Component contracts

- `SignalWidget`: surface, header, body, footer, rail, dock mode.
- `SignalStateMark`: icon + text + optional semantic hue.
- `SignalBasisMark`: solid/long-dash/stitch sample + text.
- `SignalHandoff`: owner name + directional arrow + source hue.
- `SignalPanel`: in-flow structural window; not floating by default.
- `SignalControl` and `SignalMeter`: preserve the raised/recessed law.

Names describe behavior, not metaphor. `MixerChannel`, `Cartridge`, and
`TimelineObject` can compose these primitives without becoming generic cards.

## Literal-color policy

New or modified product UI may use literals only for:

1. Alpha black/white used inside a centralized material recipe.
2. Browser/SVG masks whose black/white value is mathematical rather than
   semantic.
3. Data-derived user content with a documented contrast fallback.

Canvas/SVG renderers may resolve tokens to concrete values through the existing
palette resolver. No renderer invents a separate palette.

## Migration checks

- Reject new `--color-*` references outside `.i-legacy`.
- Warn on new hex/rgb literals in UI files outside approved renderer/material
  modules.
- Snapshot semantic axis combinations, not every component permutation.
- Run contrast checks against panel, canvas, raised, and recessed surfaces.
- Browser-test selected + focused, stale + inferred, and external + critical;
  these combined states expose most channel collisions.
