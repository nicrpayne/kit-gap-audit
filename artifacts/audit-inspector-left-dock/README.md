# Audit Inspector left-dock restoration

## Authority and trace

- Production base: `6c46ce984ffb231f4c33dc8653077cec55c30389`.
- The current embedded Inspector was placed on the right by `1bcc3ec1190e1d45d048dcb3cb4ff93fbc2abcbb` (`Integrate Audit Inspector with current Rubric world`).
- The owning declaration is the Signal Phase 3 presentation layer in `app/audit/rubric-phase3/route.ts`: that commit added `right: 12px; left: auto` for `#brain-card` and `#signal-inspector-overview`.
- Rubric's protected `_core.css` still defines the original object card on the left (`left: 26px`). No protected Rubric source, renderer, geometry, topology, camera, layout, fog, morph, Search, Trace, or data contract is changed here.

## Fix boundary

Only the embedded Inspector presentation rules change: dock side, entrance direction, reopen position, and collision-safe stacking/breakpoint behavior. The dock remains an overlay on Rubric's full-size canvas. It begins below the parent Audit knowledge/readiness card and ends above Legend; Menu and Legend panels temporarily stack above it when opened.

## Matched evidence

Both sides use the same 1440×900 viewport, production-shaped 438-object / 543-relationship read-only mirror, selected Finding, and production-base code path.

- `before/01-overview.png` and `after/01-overview.png`
- `before/02-selection-trace.png` and `after/02-selection-trace.png`
- `before/01-current-world.png` and `after/01-current-world.png`
- `before/02-selected-finding.png` and `after/02-selected-finding.png`

`visual-comparison.json` records matching census, canvas size, selection, screenshot hashes, and browser errors. `proof.json` records matched interaction/camera sequences and geometry checks at 1024, 1180, 1280, and 1440 pixels.

## Verification

- TypeScript: pass.
- Optimized Next.js production build: pass.
- ESLint: pass with 40 pre-existing warnings and no errors.
- Audit interaction/browser suite: 38/38.
- Focused left-dock production-build browser proof: 29/29.
- Rubric renderer: 129/129.
- Phase 3 / 3A / 3B protected-law proofs: pass.
- Search proof: all executable checks pass (two fixture/environment-only checks skip).
- Protected Audit fingerprint: recorded after commit so the checked tree, not the working copy, is the review SHA.
