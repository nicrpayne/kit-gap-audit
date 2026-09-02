# Audit-local direct Rubric integration

## Boundary

Rubric owns the Audit Canvas world after `adaptSignalSceneToRubric(...)` returns. The adapter supplies identity, visual role, source-system ownership, trust/disagreement metadata, labels, and canonical links. It supplies no coordinates, forces, camera state, hit regions, or gesture state.

The runtime remains Audit-local. The implementation changes only `components/audit/**`, `lib/audit/**`, the Audit proof, and repository attribution. No shared instrument, API contract, database schema, Graphology builder, Reality mutation path, Forecast/Scenario engine, Hermes contract, or other Signal page changed.

## Reference gate

The required handoff, license, source modules, and 2026-09-02 fidelity diagnosis were present before editing. The reference is CC BY 4.0; `ATTRIBUTION.md` and the source headers carry the attribution and change notice.

| Required source | SHA-256 |
|---|---|
| `RUBRIC-SIGNAL-ENGINE-HANDOFF.md` | `582e6372f191f746f16b7b75c686f1ae02654dd73db681ccf3bc961fcd2d4260` |
| `second-brain/LICENSE` | `8325c0be8f8d2e523b56e661c10544e7f627df5d8bf25d4d5f4143fa010b143e` |
| `public/_core.js` | `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213` |
| `public/_flows2.js` | `2fb3e9937a141df8ec9233c851426f845718216c54fb6336752291b539b07496` |
| `public/index.html` | `f6419d36dd4696bc4be4e13828deb574bda9603df46432fc4e610eb9d3135de6` |
| `public/_core.css` | `51797b9f261c03255db8cc660897812f1106d16e4ca1eacaeb7f94de7bc7a06a` |
| `public/_icons.js` | `59dfd3e24f8cf7504c05609eb0063c22898950c33f45facea13b92c2b173f48a` |
| fidelity diagnosis | `eea86d229a84755fb431655b8bfb9ad79ff44884c46148e1bb18e1775a5e0c4f` |

## Actual Rubric machinery retained in the production Audit bundle

| Reference machinery | Audit-local module | Adaptation |
|---|---|---|
| `_core.js::setLayout`, `ringsGeom`, `computeRingTargets`, `placeRingNode` | `lib/audit/spatial/field.ts` | Mechanically modularized; actual router/skill/memory/routine/app branches retained. Signal adds only deterministic seeding and a 0/6/12 disagreement offset inside Memory. |
| `_core.js::buildSim` | `lib/audit/spatial/field.ts` | Force, Circle, Hex bounds, radial hierarchy, collision, charge, retained positions, free-drop, and settlement retained. Unsupported generic relationship pull remains zero. |
| `_core.js::w2s`, `s2w`, wheel handler, `flyCam`, `flyToNode` | `components/audit/rubricCamera.ts` | Same affine/cursor-anchored model; frame counts converted to elapsed milliseconds and reduced motion honored. |
| `_core.js` pointer lifecycle and five-pixel click/drag threshold | `components/audit/canvas/rubric/engine.ts` | Runtime owns down target, drag, blank-space pan, release, double-click, hit test, and camera interruption. |
| `_core.js::drawLabels`, `select`, selection neighbors | `painter.ts` and `AuditInstrument.tsx` | Rubric eligibility, source-anchor priority, card, and navigable neighbor rows; filesystem actions replaced by safe Signal actions. |
| `_flows2.js::glowSprite`, `orbSprite`, `hex`, `linkCtrl`, `linkPoint` | `sprites2.ts` and `painter.ts` | Cached glow/orb material, app hexes, deterministic bowed links, focus/fog, and Trace geometry. |

## Retired spatial authority

- ALIGNED / DRIFT / CONFLICT / SOURCES headline rings.
- Band-first global seating and the fixed 706-unit Signal field as Canvas Fit authority.
- Tiny individual source artifacts on the outer horizon.
- Signal lane wedges as the top-level Rings hierarchy.
- React/shared-Signal ownership of Canvas pointer, hit, pan, zoom, and fit state.
- Automatic layout-switch refit and parallel Canvas coordinate navigation.

The legacy static graph layout still helps derive Audit disclosure and labels before the adapter. Its coordinates do not enter the Rubric runtime.

