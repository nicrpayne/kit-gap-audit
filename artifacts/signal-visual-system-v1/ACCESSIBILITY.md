# Accessibility findings and acceptance criteria

## Contrast

Calculated WCAG relative contrast for the proposed solid foregrounds:

| Foreground | On panel `#151b20` | On canvas `#0e1317` | On raised `#1c242a` | Result |
|---|---:|---:|---:|---|
| Primary `#f3f0e7` | 15.24:1 | 16.39:1 | 13.80:1 | AAA |
| Secondary `#a1abb3` | 7.43:1 | 8.00:1 | 6.73:1 | AA/AAA depending size |
| Tertiary `#808c95` | 5.05:1 | 5.43:1 | 4.57:1 | AA for normal text |
| Reality `#51c9db` | 8.87:1 | 9.54:1 | 8.03:1 | AAA |
| Scenario `#a397fa` | 6.92:1 | 7.44:1 | 6.26:1 | AA |
| Attention `#e3b455` | 9.03:1 | 9.72:1 | 8.18:1 | AAA |
| Risk `#f07162` | 5.99:1 | 6.44:1 | 5.43:1 | AA |
| Positive `#53d7aa` | 9.65:1 | 10.38:1 | 8.74:1 | AAA |
| Source `#63acd0` | 6.90:1 | 7.42:1 | 6.25:1 | AA |
| Evidence `#bec9d0` | 10.30:1 | 11.08:1 | 9.33:1 | AAA |

Soft fills are backgrounds/halos only. Text does not inherit their alpha.
Tertiary is the floor for visible normal-sized text; opacity must not be
applied again to essential tertiary text.

## Current findings

1. The global violet focus rule is good and reduced motion already exists.
2. Audit’s solid/long-dash/stitch basis grammar is an excellent non-color
   channel and should become suite-wide.
3. Several selected states already expose `aria-pressed`, but the visual
   recipe varies and not every selectable SVG object has the same keyboard
   path.
4. `--i-text-faint` is overused for essential 9–10px labels; raising its value
   and minimum label size is necessary.
5. Many disabled controls use opacity only. The disabled reason is not always
   programmatically available.
6. Some hover-only brightness and tooltips carry useful detail that needs a
   focus/touch equivalent.
7. World overlays can obscure the selection they describe. The docked widget
   pattern materially improves cognitive and low-vision continuity.
8. Dense graph and Timeline marks need ≥32px invisible hit targets even when
   the drawn glyph is smaller.

## Non-color channels

Every truth-bearing state uses at least two of: label, icon/glyph, stroke
pattern, fill/hollow form, position, or hue.

| Axis | Required non-color channel |
|---|---|
| Reality / Scenario | “Reality” / “Scenario” text; solid vs hollow/dashed |
| Current / stale / superseded | age/replacement text; clock vs notched glyph |
| Attested / inferred / external | solid vs long dash vs short stitch; basis text |
| Critical / warning / info | triangle vs diamond/clock vs circle; severity text |
| Accepted / available | check glyph and explicit accepted/available wording |
| Selected | perimeter/marker and ARIA state; semantic hue remains intact |

## Keyboard and focus

- All world nodes/cards/rows that respond to click are keyboard reachable and
  have an accessible name including type and state.
- Focus ring: 2px violet, 2px offset, never clipped by overflow.
- Selected + focused shows both selection edge and outer focus ring.
- Inspector focus moves only after an explicit “open details/review” action;
  simple world selection leaves focus on the selected object.
- `Escape` behavior follows the widget stack and focus returns to invoker.
- Arrow-key spatial navigation is recommended for world nodes; Tab must remain
  a complete fallback.

## Motion

- Continue respecting `prefers-reduced-motion`; camera flights arrive
  immediately and widget transitions collapse below 1ms.
- No essential fact exists only during an animation.
- Selection/Trace glow is static or gently settles once; no pulsing.
- Direct-manipulation values update without a delayed easing mismatch.

## Zoom, reflow, and density

- Reading surfaces reflow to 320 CSS px.
- Dense instruments keep their honest minimum-width message until a deliberate
  responsive control design exists.
- At 200% browser zoom, the selected object, Inspector close control, and owner
  handoff remain reachable.
- Widget headers wrap or truncate with full accessible names; no essential
  action is icon-only without a label or accessible name.

## Implementation acceptance

Test at minimum: keyboard-only path, 200% zoom, reduced motion, forced colors,
grayscale screenshot, and a selected+focused object for each migrated
instrument. Automated contrast is necessary but does not replace verifying
thin SVG strokes and alpha-composited marks in the browser.
