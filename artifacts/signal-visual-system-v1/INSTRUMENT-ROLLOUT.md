# Cross-instrument application and rollout

## Minimum application map

| Instrument | Keep | Minimum v1 alignment | Retire |
|---|---|---|---|
| Master Control Room | Graphite depth, pipeline/cascade hierarchy, dominant readouts | Replace short color names with semantic aliases; normalize selection/focus and panel recipes | Any hue used as stage decoration without a live state |
| Audit World | The complete current production Rubric world: geometry, Rings/Circle/Force/Hex, density, Source Systems horizon, Attention structure, Reality/Project Model composition, fog/haze, placement, camera, drag physics, morphs, progressive identity, and topology | Put Search, Legend, Menu, controls, Trace, and Inspector into shared Signal material; adjust typography, semantic mappings, and non-semantic interaction treatment around the unchanged world | Retro/orange widget chrome and centered modal as default detail; never replace the production world with prototype geometry |
| Forecast | Dominant distribution, direct target manipulation, Reality ghost, summoned tools | Alias chart/status colors; distinguish stale/context/source states; adopt common widget headers and focus | Legacy `--color-*` settings treatments and ad hoc source/link colors |
| Portfolio / Capacity | Shared temporal axis, distribution shape, mixer mechanics, persistent inspector | Establish one dominant portfolio outcome, selected-scope rail, raised controls/recessed meters, semantic capacity/risk overlays, stronger type contrast | Per-Scope rainbow identity, equal-weight card wall, decorative channel numbering |
| Decisions | Circuit metaphor, cartridge/socket physics, Scenario handling | Replace local chassis literals with material recipes; separate Decision identity from unresolved/risk status | Violet as universal selected/inferred/human-required state |
| Scope | Composer/deck metaphor, owner handoffs | Normalize deck material, candidate/current/superseded states, source styling, and Inspector anatomy | Local gradients that duplicate shared materials; legacy form whites |
| Dependencies / Orbit | Sparse topology and explanatory Inspector | Adopt source/evidence palette, trust patterns, widget subset, and current/stale labels | Generic violet for every inferred object |
| Timeline | Temporal density, family shapes, now line, direct manipulation | Alias surface/edge literals gradually; unify current/stale/superseded and Inspector; reserve hatching | One-off purple/blue material families and hatch/dash reuse for unrelated states |
| Reports | Reading measure, report history | Start future Reports on semantic tokens, provenance blocks, time-state banner, print-safe fallbacks | New `--color-*` usage, generic KPI cards, unsourced status color |
| Shared shell/nav | Fixed rail, identity strip, command menu | Shared active/focus/hover recipe; semantic owner handoffs; token compatibility layer | Route-specific active treatments and orange generic chrome |

## Why Portfolio / Capacity feels bland

It is not short of color. It is short of hierarchy. The current view gives the
portfolio headline, chart, channel modules, and metadata similar graphite
weight; per-Scope colored dots add variety without clarifying what matters.
The result is a dense wall where every module politely waits to be read.

### Recommendation

1. Make the portfolio landing outcome the single dominant readout and bind it
   visibly to the gating Scope.
2. Give the shared temporal field more vertical authority; channels become
   compact control strips below/alongside it, not equal-size cards.
3. Use a 2px selected rail, brighter name/readout, and a recessed forecast
   window for the active Scope. Other Scopes stay fully legible but quiet.
4. Render capacity availability in mint, over-allocation/risk in coral, and
   unresolved basis in amber. Do not assign a different semantic hue to each
   Scope.
5. Separate operable faders (raised) from derived Raw/Effective meters
   (recessed) more strongly; group capacity provenance in the Inspector.
6. Keep density. Improve hierarchy through scale, contrast, and depth—not
   extra whitespace, cards, or larger chrome.

This is a focused material/hierarchy pass, not a layout rewrite or workflow
change.

## Reports visual requirements (preview only)

- Same shell and surface tokens as every instrument; a centered reading
  measure, not an instrument canvas.
- Header names Scope, generated-at time, source snapshot, and current/stale/
  superseded state in text and glyph.
- Executive answer first; evidence and assumptions remain expandable but
  citation-visible.
- Reality statements use cyan only when current and verified. Scenario content
  is violet, framed as hypothetical, and cannot visually masquerade as current.
- Risks/conflicts coral, attention items amber, accepted/available mint, source
  links blue, evidence passages silver.
- Tables use subtle row rules, tabular numbers, and no zebra color that could
  compete with status.
- Print/export maps surfaces to white/ink while retaining glyph, label, dash,
  and pattern channels; dark screenshots are not the export strategy.
- Deep links say which instrument owns the fact: “Open in Decisions →”.

No Reports UI is implemented in this branch.

## Conflict-minimizing rollout

### 1. Token foundation

Add semantic custom properties and compatibility aliases in one small shared
commit. No component restyling. Add automated contrast and forbidden-literal
checks for new/modified UI files.

### 2. Shared shell and widgets

Create shared material recipes, widget header/body/footer primitives, focus,
hover, disabled, state badge, provenance link, and owner handoff. Migrate shell
and ToolWindow without touching instrument bodies.

### 3. Audit / Control Room convergence

Apply shared widgets around the protected Audit world. Alias Control Room to
the new semantic names. Do not change or reinterpret geometry,
Rings/Circle/Force/Hex, density, Source Systems horizon, Attention structure,
Reality/Project Model composition, fog/haze, node placement, renderer, camera,
drag physics, morphs, progressive identity, topology, or data contracts. Do
not implement a center glyph; that belongs to the Reality Glyph exploration
branch. Coordinate with the Audit Inspector branch because it may touch
`AuditInstrument`, Inspector components, and `ToolWindow`.

### 4. Portfolio / Capacity

Make the hierarchy/material pass described above. Keep simulation and direct
manipulation untouched. This is the highest-value product restyle after Audit.

### 5. Decisions / Scope / Dependencies / Timeline

Migrate one instrument per commit. Decisions first (well-bounded material
recipes), Scope and Dependencies next, Timeline last because its 155 literal
color references sit inside complex SVG behavior.

### 6. Forecast chart material

Only migrate the chart/material references that remain inconsistent after the
foundation. Preserve distribution geometry and target behavior.

### 7. Reports

Build future Reports directly against the new system after upstream truth
contracts are production-proven.

## Priority

1. Foundation + shell/widgets (system leverage, low product risk)
2. Audit/Control Room convergence (highest coherence gain)
3. Portfolio/Capacity (largest perceived-quality gap)
4. Decisions
5. Scope
6. Dependencies/Orbit
7. Timeline (high value, highest implementation risk)
8. Forecast refinement
9. Reports from the new system when product work begins

## Merge-conflict risk

Overall: **low for this branch; medium for implementation**.

This branch adds only new documentation/artifacts. Later implementation has
three hotspots: `app/globals.css`, shared `ToolWindow`/`Panel`/shell files, and
Audit Inspector/AuditInstrument files likely active in the parallel widget
track. Land foundation first, rebase each instrument tranche immediately
before work, and keep Timeline separate from generic token cleanup.
