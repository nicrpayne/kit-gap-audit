# Rubric reference materials

This directory contains local reference materials for the private Rubric-to-Signal
engine work. It is excluded from Signal production and build concerns and must
not be imported, bundled, deployed, or treated as canonical Signal code.

The files are preserved here so the experimental Audit-engine branch can inspect
the actual Rubric renderer, layout, and camera implementation. Product behavior,
data semantics, and production implementation remain owned by Signal.

## Source inventory

The requested files were copied unchanged from these paths on Nic's Mac:

- `~/Downloads/RUBRIC-SIGNAL-ENGINE-HANDOFF.md`
- `~/Downloads/rubric-second-brain/public/_core.js`
- `~/Downloads/rubric-second-brain/public/_flows2.js`
- `~/Downloads/rubric-second-brain/public/index.html`

The dependency review found two directly required local files referenced by
`index.html`, which were also copied unchanged:

- `~/Downloads/rubric-second-brain/public/_core.css`
- `~/Downloads/rubric-second-brain/public/_icons.js`

The source license was preserved from:

- `~/Downloads/rubric-second-brain/LICENSE`

No Rubric server, scanner, workspace data, or unrelated project files were
copied. The HTML references external D3 v7, Marked 11.1.1, Google Fonts (Outfit
and Source Serif 4), and optional Simple Icons v13 assets; those dependencies
are not vendored here.

## License and ownership notes

The supplied `rubric-second-brain/LICENSE` presents the Second Brain material
under Creative Commons Attribution 4.0 International (CC BY 4.0), copyright
2026 Jay E | RoboNuggets, and requires attribution, a license link, and a change
notice for adaptations. No separate `NOTICE`, `COPYING`, package manifest, or
third-party notice file was observed in that source folder.

The copied JavaScript, CSS, and HTML files do not contain their own file-level
license headers. `_icons.js` contains brand/icon path data, so copyright and
trademark permissions for individual icons should be reviewed separately before
any production reuse. The handoff recommends studying and cleanly reimplementing
the renderer mechanics in Signal-owned modules; close adaptations may still
require attribution.
