# Accessibility

- Selected material uses the silver selection edge/inner ring; keyboard focus adds an independent violet outer outline. The two states remain visible simultaneously.
- Disabled state uses its own text token, opacity channel, cursor, and optional explanatory microcopy. The fixture’s disabled Run Audit control exposes its reason in the accessibility tree.
- Attested, inferred, and external basis are solid, `6 4`, and `2 3` patterns with distinct symbols and labels.
- Current, stale, and superseded states use `●`, `◷`, and `⊘` plus text labels.
- Touched shared and Audit controls have a 32px minimum hit target.
- Essential microcopy is 10px or larger in touched primitives; tertiary text is the contrast floor.
- Core foreground/surface pairs pass 4.5:1. The measured minimum is tertiary text at 4.57:1; primary text is 13.80:1.
- Global and embedded Audit styles preserve `prefers-reduced-motion`; forced-colors receives explicit structural borders.
- The Audit browser regression now includes a 720×450 viewport check, the practical 200% zoom equivalent for its 1440×900 acceptance viewport. It requires Menu, Legend, and Search to remain visible and at least 32px high.
