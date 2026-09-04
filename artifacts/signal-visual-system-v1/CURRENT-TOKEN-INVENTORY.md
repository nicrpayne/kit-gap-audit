# Current token inventory

## Method and scope

The inventory covers `app/` and `components/` at baseline
`edf3dfff8e952ac9c12f0c8151779f0963477292`. Counts are lexical references,
not rendered-property counts; a shared file can contribute to more than one
instrument’s total. This is intentional: it identifies migration surface area,
not bundle weight.

## Token families in use

### Legacy Workbench: `--color-*`

Declared in `app/globals.css`: `paper`, `ink`, `ink-soft`, `accent`,
`accent-dark`, `accent-soft`, `line`, `card`, `danger`, `danger-soft`, `amber`,
and `amber-soft`.

The family began as cream paper + green ink. `.i-legacy` and `.instrument-ask`
now shadow it into the dark application. That compatibility layer is useful,
but its names do not describe Signal semantics: `accent` can resolve to cyan in
one subtree and violet in another.

### Instrument core: `--i-*`

- Depth: `void`, `bg`, `panel`, `panel-raised`, `recess`.
- Structure: `border`, `border-strong`.
- Text: `text`, `text-soft`, `text-faint`.
- State: `signal`, `violet`, `amber`, `red`, `mint`, `reality`, with soft
  variants where defined.
- Audit additions: `cool`, `coral`, `slate`, `silver`, `source`, with soft
  variants.

This is the real design system today. Its semantics are mostly sound, but its
short names let call sites reinterpret hues, and several needed axes—temporal
state, provenance basis, focus, disabled, informational—have no first-class
tokens.

### Local literals and component-owned palettes

The scan found **143 distinct hex literals** in product CSS/TSX and many rgba
values. Most are surface micro-shades, specular edges, SVG fills, shadows, or
component-local gradients. The largest literal-color concentrations are
Timeline (155 references), shared shell/globals (115), Decisions (85),
Portfolio/Capacity (55), Audit (43), and Scope (42).

Known local families include:

- Timeline `FAMILY_COLOR` and extensive SVG material/shadow literals.
- Audit `STATE_COLOR`, `KIND_COLOR`, `INTEL_COLOR`, trust dash patterns, and
  disclosure opacity tiers.
- Portfolio channel dots and material gradients.
- Decisions circuit chassis gradients and cartridge materials.
- Legacy Tailwind `bg-white`, `hover:bg-black/*`, `text-white`, and white
  borders corrected by `.i-legacy` overrides.

## Instrument census

| Instrument | `var(...)` refs | `--i-*` | `--color-*` | color literals | gradients | shadows | Assessment |
|---|---:|---:|---:|---:|---:|---:|---|
| Control Room | 423 | 423 | 0 | 16 | 7 | 11 | Closest reference; disciplined, but some hues still do double duty |
| Audit World | 558 | 500 | 58 | 43 | 2 | 0 | Best semantic topology; controls/review need a shared widget material |
| Forecast | 256 | 168 | 88 | 11 | 2 | 4 | New instrument and legacy settings surfaces coexist |
| Portfolio / Capacity | 380 | 380 | 0 | 55 | 8 | 9 | Correct palette, weak hierarchy from equal-weight panels and per-scope color |
| Decisions | 260 | 260 | 0 | 85 | 13 | 27 | Strong physical metaphor; chassis shades are too local |
| Scope | 210 | 171 | 39 | 42 | 10 | 14 | Good deck metaphor; settings residue and local material values remain |
| Dependencies / Orbit | 89 | 89 | 0 | 0 | 0 | 0 | Smallest migration; mostly semantic remap |
| Timeline | 403 | 403 | 0 | 155 | 32 | 29 | Highest drift risk; preserve drawing fidelity while aliasing literals |
| Reports (reference) | 47 | 18 | 29 | 1 | 0 | 0 | Not a visual-system native yet; do not build in this track |
| Shared shell | 184 | 179 | 3 | 115 | 13 | 21 | Central leverage point; literals include global material recipes |

## Current visual grammar

### Material

The established depth ladder is excellent: void → field → panel → raised
control, with a separate recessed meter. Raised means operable; recessed means
computed. Crisp borders, small radii, subtle top-light, and dark inset shadows
make the product feel instrument-like without decorative chrome.

Drift occurs because each complex instrument restates the ladder with new hex
values. The result is not visibly broken, but it prevents deliberate global
tuning and makes Portfolio feel flatter than Control Room.

### Typography

- Instruments: system sans; tabular numerals; uppercase 9.5px micro-labels;
  tight, heavy readouts.
- Reading surfaces: serif display face for page titles; system sans for body.
- Weakness: `text-faint` is used for both optional metadata and essential tiny
  labels. Essential 9–11px information can become too quiet on raised panels.

### Interaction states

- Keyboard focus is broadly violet via `.instrument :focus-visible`.
- Selection varies: violet fill/border, cyan border, panel-raised background,
  brightness, halos, or only `aria-pressed` depending on component.
- Hover often uses `brightness`, faint→text color, or a white alpha fill.
- Disabled commonly uses opacity without a consistent surface/cursor/text
  contract.

### Truth and time

- Reality currently means both neutral gray ghost and cyan verified/live fact.
- Scenario is consistently violet, but violet also marks Decisions,
  human-required findings, inference, and keyboard focus.
- Current/superseded is strongest in Audit’s opacity/dash system; there is no
  suite-wide token or badge contract.
- Stale appears as amber in some places, faint text in others, and prose-only
  in legacy views.

### Provenance

Audit has the best grammar: solid = attested, long dash = inferred, short
broken stitch = external; source hubs are blue and passages silver. Elsewhere,
“inferred” often becomes violet text and source links inherit generic accent.
The semantics should be promoted, not redesigned.

## Retain, alias, retire

Retain the depth ladder, warm-white text, tabular readouts, restrained semantic
light, Audit’s non-color trust patterns, and the raised/control versus
recessed/output rule.

Alias `--i-*` to the new semantic contract for a staged migration. Retire
direct product use of `--color-*`, per-Scope rainbow identity, generic amber
decoration, white/black Tailwind fixes inside dark surfaces, and new literal
surface/color values outside rendering code.
