# Phase 2 · Signal data in the transplanted Rubric runtime

## Result

**YES — Phase 2 still looks like Rubric with Signal data.**

The literal Phase 1 Rubric runtime remains the viewport chassis. Phase 2 adds
an Audit-local, read-only `SignalRubricAdapter`, data route, and host boundary.
It does not mount the older Signal spatial renderer and does not send x/y,
forces, ring geometry, targets, or camera state to Rubric.

Review route:

```text
/audit?rubric=phase2
```

Safe deterministic review variants:

```text
/audit?rubric=phase2&fixture=jsa
/audit?rubric=phase2&fixture=production-mirror
```

## Data and veracity

`scripts/signal-rubric-adapter-proof.ts` passed against:

| Input | Canonical nodes | Canonical edges | Passage → source attachments | Unsupported canonical edges |
| --- | ---: | ---: | ---: | ---: |
| deterministic JSA fixture | 61 | 73 | 11 | 0 |
| redacted production-shaped JSA mirror | 438 | 543 | 164 | 0 |
| read-only current production capture | 438 | 543 | 164 | 0 |

Every canonical node is projected once. Every canonical edge retains its
relation, basis, rule, external relation subtype/currentness where present,
and valid endpoints. Reality alone uses Rubric's required `CLAUDE.md`
transport alias while retaining canonical ID `reality`. Presentation-only
hubs, source anchors, and Attention echoes use reserved `signal:*`, `hub:*`,
or `lhub:*` identities and never enter canonical counts.

The read-only production capture produced five truthful outer anchors:
Documents, Figma, Hermes, Linear, and Meetings / Transcripts. The redacted
mirror screenshot contains the three providers retained by that mirror:
Documents, Hermes, and Meetings / Transcripts. No missing provider is
manufactured.

No Audit was run. Reality and production storage were not written.

## Runtime preservation

The Phase 2 route serves the same accepted Phase 1 files directly:

| Rubric file | SHA-256 |
| --- | --- |
| `_core.js` | `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213` |
| `_flows2.js` | `2fb3e9937a141df8ec9233c851426f845718216c54fb6336752291b539b07496` |
| `_core.css` | `51797b9f261c03255db8cc660897812f1106d16e4ca1eacaeb7f94de7bc7a06a` |
| `_icons.js` | `59dfd3e24f8cf7504c05609eb0063c22898950c33f45facea13b92c2b173f48a` |

All four hashes equal the supplied Rubric reference copies. Phase 2 adapts
only the new host, API route, route wrapper, and adapter.

## Interaction checks

- Node click and the actual Rubric selection card: pass.
- Rubric drag gesture path and bounded-layout free-drop path: pass.
- Blank-field pan and wheel zoom: pass.
- Force, Circle, Hex, Rings, and layout morphs: pass.
- Signal-native visible labels: Reality, Project Model, Project World,
  Attention, Source Systems: pass.
- Popup actions: Open detail, Copy reference, Fly to, conditional Open source,
  presentation-only Hide from view: pass.
- Typed canonical connection-row navigation through Rubric fly-to: pass.
- Existing Signal `SignalSearchIndex` / MiniSearch result fly-to: pass.
- Search clear restores the prior selection and camera: pass.
- Trace overlay uses canonical supported provenance paths and Rubric live
  positions; source → passage → Finding → territory → Reality captured: pass.
- Browser console: zero warnings/errors.
- Production build: pass.

## Matched evidence

1. `00-phase1-reference-match.png` — accepted reference vs Phase 1 match.
2. `01-rubric-reference.png` — supplied Rubric reference.
3. `02-phase1-rubric-fixture.png` — literal Phase 1 transplant.
4. `03-phase2-signal-jsa-world.png` — Phase 2, production-shaped Signal world.
5. `04-signal-object-popup.png` — Signal passage and translated popup actions.
6. `05-connection-navigation.png` — canonical relation row after navigation.
7. `06-search-fly-to.png` — MiniSearch result selected and framed.
8. `07-trace-source-to-reality.png` — supported source-to-Reality trace.
9. `08-layout-force.png`, `09-layout-circle.png`, `10-layout-hex.png`,
   `11-layout-rings-return.png` — Rubric layout/morph checks.
10. `12-node-drag.png` — direct manipulation gesture check.
11. `13-zoom-and-pan.png` — Rubric wheel zoom and blank-space pan.
12. `14-source-system-anchor.png` — large Rubric-style Hermes source anchor,
    explicitly marked presentation-only with canonical membership count.

## Phase 3

Spatial disagreement is intentionally deferred. Phase 2 carries bounded
disagreement metadata into details and popup material, but the unmodified
Rubric runtime has no secondary radial-offset channel. Adding radial offset
now would require changing Rubric target generation and would risk recreating
the rejected Signal radial visualization. Phase 3 should decide whether a
small material-only treatment is sufficient or whether an explicitly bounded
core extension is justified.
