# Audit World Widgets + Inspector v1

Branch: `claude/audit-world-widgets-inspector-v1`  
Starting production SHA: `edf3dfff8e952ac9c12f0c8151779f0963477292`

## Outcome

- The Audit World now owns the full body viewport. The Inspector is a 340–392px floating right dock layered over the live world, not a permanent grid column.
- Inspector close/reopen preserves the canonical selection, exact camera state, and mounted Rubric world.
- Findings use the Inspector for first-level reading. `Review finding` opens the existing governed actions in a wide second-level side sheet; closing returns to the same camera and selection.
- Trace remains visible with the Inspector and remains anchored while the reader follows a highlighted Finding → passage → source path.
- Search, current/prior Audit context, Menu/layout, Legend, Project Overview, Inspector, and Run Audit now read as one Signal-native widget/chrome family while remaining distinct controls.
- The protected Rubric files were not edited and retain their starting hashes.
- `RealityGlyph` establishes a product-owned mark boundary with three deliberately non-final SVG variants: `signal`, `orbit`, and `relay`.

## Audit-local palette mapping

This branch does not change shared tokens or other instruments. `AuditWorld.module.css` maps Audit meanings onto the Master Control Room vocabulary:

| Audit meaning | Local alias | Existing Signal token | Use |
|---|---|---|---|
| live Reality / primary Signal | `--audit-live` | `--i-signal` | current Audit, active Trace, Reality mark |
| decision / structure / scenario | `--audit-structure` | `--i-violet` | governed review and human structure |
| attention / unresolved | `--audit-attention` | `--i-amber` | missing owner, unresolved state only |
| risk / conflict / critical | `--audit-critical` | `--i-red` | blocking and conflict |
| accepted / capacity / available | `--audit-accepted` | `--i-mint` | confirmed or available state |
| evidence source / provenance | `--audit-source` | `--i-source` | source nodes and provenance legend |
| passage / neutral information | `--audit-passage` | `--i-silver` | quoted passage material |
| ground / inactive | `--audit-ground`, `--audit-inactive` | `--i-bg`, `--i-reality` | world ground and inactive/absent state |

Amber/orange is no longer generic widget chrome. Active product controls use cyan; graphite, silver, and restrained borders carry the shell.

## Automated evidence

- `test-results.txt`: 24/24 browser interaction checks.
- `browser-regression.json`: machine-readable results, camera values, and video path.
- `renderer-proof-results.txt`: 124/124 existing renderer/gesture checks.
- `build-results.txt`: typecheck, scoped lint, diff check, and optimized production build result.
- `video/audit-world-interaction-proof.webm`: full automated acceptance flow.

The browser proof uses the repository's invented JSA-shaped fixture and intercepts read endpoints in the browser. It does not call a governed action or write product data.

## Visual evidence

Before:

- `before/01-world-overview.png` — production starting state with the world reduced by a permanent Inspector column.

After:

- `after/01-world-overview.png` — full-bleed world with floating Project Overview dock.
- `after/02-finding-inspector.png` — first-level Finding Inspector beside the live world.
- `after/03-trace-with-inspector.png` — Trace visible while the Inspector remains readable.
- `after/04-deep-review-sheet.png` — governed review as a second-level side sheet.
- `after/05-menu-legend-widget-family.png` — Signal-native Menu, layout, Legend, Search, context, and Inspector family.
- `after/06-final-world-state.png` — final stress-test state.

## Scope boundary

No Reality/Scenario/Forecast contract, Decision/DecisionGate semantic, Capacity model, Scope model, Timeline truth, Hermes contract, database schema, Reports code, or other instrument was edited. No deployment or merge was performed.

See `MERGE-CONFLICT-SURFACE.md` for the exact parallel-branch integration risk.

