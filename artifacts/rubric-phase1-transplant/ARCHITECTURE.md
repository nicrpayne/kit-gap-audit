# Architecture and provenance

## Boundary

The direct Audit-local page serves Rubric's original HTML/CSS/canvas application. A small pre-runtime host shim replaces only Rubric's local HTTP endpoints with a frozen fixture. It does not calculate positions, run physics, draw the canvas, move the camera, hit-test, select objects, or render the card.

```text
/audit?rubric=phase1
        -> /audit/rubric-phase1
        -> actual Rubric index/runtime
        -> Phase 1 static API shim
        -> Rubric-native frozen fixture
```

The normal `/audit` route and all other Signal instruments remain on their existing code paths.

## Actual Rubric sources executing

These deployed Audit-local files are byte-for-byte copies of the supplied reference:

| Module | SHA-256 | Responsibilities now executing |
| --- | --- | --- |
| `_core.js` | `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213` | boot/ingest, Rings targets, Force/Circle/Hex/Rings simulations, camera, zoom/pan, pointer drag/release, hit testing, focus, animation loop, labels, tooltip, selection card, viewer, search/control panels |
| `_flows2.js` | `2fb3e9937a141df8ec9233c851426f845718216c54fb6336752291b539b07496` | bowed relationship geometry, orb/glow sprites, icons, node material drawing |
| `_core.css` | `51797b9f261c03255db8cc660897812f1106d16e4ca1eacaeb7f94de7bc7a06a` | Rubric world, HUD, cards, overlays, labels, controls, material styling |
| `_icons.js` | `59dfd3e24f8cf7504c05609eb0063c22898950c33f45facea13b92c2b173f48a` | Rubric icon definitions |
| `LICENSE` | `8325c0be8f8d2e523b56e661c10544e7f627df5d8bf25d4d5f4143fa010b143e` | supplied CC BY 4.0 license |

Named `_core.js` functions executing include `boot`, `ingest`, `setLayout`, `initRings`, `ringBlend`, `ringsGeom`, `placeRings`, `computeRingTargets`, `buildSim`, `rebuildFocus`, `w2s`, `s2w`, `flyCam`, `flyToNode`, `initCanvas`, `hitTest`, `loop`, `drawLabels`, `showTip`, `select`, `openViewer`, `jumpTo`, and `buildPanels`.

`index.html` is mechanically copied with one addition: `phase1-host.js` loads before Rubric's unchanged `_icons.js`, `_flows2.js`, and `_core.js`. The Next route injects only a base URL so its relative assets resolve beneath the Audit subroute.

## Attribution and change notice

Original Rubric work: Copyright (c) 2026 Jay E | RoboNuggets, licensed under CC BY 4.0. The original license is bundled beside the executing files. Signal changes are limited to the Audit route, static fixture transport, and this documentation.

