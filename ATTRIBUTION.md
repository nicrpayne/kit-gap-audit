# Third-party attribution

## Rubric Second Brain — CC BY 4.0

Parts of Signal's Audit graph viewport are **adapted from Rubric Second
Brain**.

- **Original work:** Rubric Second Brain
- **Copyright:** © 2026 Jay E | RoboNuggets
- **Author link:** https://skool.com/robonuggets
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **License text:** https://creativecommons.org/licenses/by/4.0/legalcode
- **Reference copy of the source used:** `lab/rubric-reference/second-brain/`
  (build-excluded; not part of any Signal bundle or deployment)

**Changes were made.** The adaptation is not a redistribution of Rubric. Its
viewport state/lifecycle, rendering, layout and camera mechanics are directly
adapted inside Signal-owned modules, with Signal's own data model, semantics,
colours and product behaviour throughout.

### Signal files containing adapted work

| File | Adapted from |
| --- | --- |
| `components/audit/canvas/rubric/engine.ts` | `public/_core.js` single `S` viewport state, `start()`/`stop()`, resource ownership and `loop()` lifecycle — reorganised as a typed class |
| `components/audit/canvas/rubric/sprites2.ts` | `public/_flows2.js` lines 17-58 — cached orb/glow sprites, deterministic edge curvature |
| `components/audit/canvas/rubric/backdrop.ts` | `public/index.html` `drawBackdrop()` 127-152 — hex field and vignette |
| `components/audit/canvas/rubric/painter.ts` | `public/_core.js` `loop()` 932-1069, `drawLabels()` 1071-1092; `public/index.html` `underLayer()` 154-203, `drawLink()` 205-235, `midLayer()` 238-269, `drawNode()` 271-463, `drawSelection()` 476-484 |
| `lib/audit/spatial/field.ts` | Direct mechanical modularization of `public/_core.js` `setLayout()` / `refreshLayout()` 310-337, `ringsGeom()` / `computeRingTargets()` / `placeRingNode()` 394-545, and the Force/Circle/Hex branches of `buildSim()` 547-736. Signal supplies roles and a bounded disagreement offset inside Memory; Rubric retains spatial authority. |
| `lib/audit/spatial/anchors.ts` | `public/_core.js` `buildSim()` group-pull mechanism 711-732 (mechanism only; the anchor policy is Signal's) |
| `components/audit/rubricCamera.ts` | `public/_core.js` camera 811-816, wheel 819-830, fly advance 934-940 |

Each file carries its own attribution header and an explicit list of the
changes made in it.

`lib/audit/rubricVisualAdapter.ts` is original Signal integration code. It is
listed here for clarity because it is the sole semantic boundary into the
adapted engine, but it does not copy Rubric implementation code.

### Summary of substantive changes

- **Content semantics are replaced; structural roles are retained.** Rubric's
  filesystem/ARMS labels and data do not cross into Signal, while its actual
  router / skills / memory / routines / applications hierarchy remains the
  runtime chassis. Signal's thin adapter maps canonical objects into those
  roles and creates presentation-only source-system application anchors.
- **Random seeding replaced with a deterministic id hash,** so Signal reloads
  to the same field.
- **Frame-count timings replaced with elapsed milliseconds,** so motion does
  not change speed with display refresh rate.
- **Reduced motion honoured** throughout; Rubric has no such path.
- **File-byte node sizing not taken.** It has no meaning in an audit.
- **Ambient comet flow not taken.** Motion along a stored relationship would
  imply live activity; the mechanism is used only for an explicit Trace.
- **Label placement replaced** with a deterministic screen-space collision
  pass; Rubric has none.
- **Rubric's graph search not taken.** Signal keeps its own MiniSearch index.
- **Generic relationship springs held at zero,** matching Rubric's own shipped
  bounded configuration, and stated as a law rather than a dial.
- **The monolithic browser-global state became a typed viewport engine.** It
  retains Rubric's ownership model while exposing only Signal-safe inputs and
  callbacks.

### Not used

`public/_icons.js` contains brand and icon path data whose individual
copyright and trademark permissions are separate from the CC BY 4.0 grant. It
is present in the reference copy for completeness and **no icon data from it
is used in Signal**. Rubric brand artwork, naming and the RoboNuggets identity
are likewise not used.

### External dependencies of the reference

Rubric's `index.html` loads D3 v7, Marked, Google Fonts and optional Simple
Icons from CDNs. Signal vendors none of these. It adds `d3-force` (BSD-3-
Clause) and `d3-quadtree` (BSD-3-Clause) as pinned npm dependencies, which are
the upstream libraries rather than anything of Rubric's.
