# Signal Rubric Phase 3 evidence

Starting SHA: `35e999261906a5ce909f9dabb98da17db9be7d41`

This evidence set tests the protected structural/spatial laws against both the
deterministic JSA fixture and the read-only production-shaped capture. No Audit
was run, no provider was refreshed, and Reality was not mutated.

## Matched visual sequence

- Rubric reference: `../rubric-phase1-transplant/01-reference-rings.png`
- accepted Phase 1 transplant: `../rubric-phase1-transplant/02-audit-transplant-rings.png`
- Phase 2 with Signal JSA data: `../rubric-phase2-signal-adapter/03-phase2-signal-jsa-world.png`
- Phase 3 production-shaped world at Fit: `02-phase3-source-horizon-fit-corrected.png`
- Phase 3 deterministic JSA world at Fit: `16-phase3-jsa-source-horizon-fit.png`

The Phase 3 world retains Rubric's primary silhouette: Reality router, Project
Model inner ring, dense Project World annulus, Attention ring, and large Source
System anchors on the native outer application ring.

## Browser evidence

| File | Gate |
| --- | --- |
| `02-phase3-source-horizon-fit-corrected.png` | production-shaped Fit view; three typed providers and roll-up counts |
| `03-phase3-selected-signal-object.png` | native Rubric card translated to canonical Signal identity/actions |
| `04-phase3-connection-navigation.png` | canonical connection row selected its endpoint and started native fly-to |
| `05-phase3-search-results.png` | existing MiniSearch-backed Signal result in Rubric search surface |
| `06-phase3-search-fly-to.png` | result selected `finding:mirror:002`; native fly-to active; clear remained available |
| `07-phase3-canonical-trace.png` | supported provenance path illuminated inward to Reality |
| `08-phase3-material-legend.png` | disagreement, trust, and currentness shown as separate channels |
| `10-phase3-native-hex-morph.png` | native Hex layout during continuous morph |
| `11-phase3-native-object-grab.png` | native Force layout directly grabbing the Hermes source anchor |
| `12-phase3-source-horizon-medium.png` | zoom `0.817`; 49 typed source artifacts eligible for identity |
| `13-phase3-source-horizon-close.png` | zoom `1.353`; 164 passages eligible for identity |
| `15-phase3-jsa-passage-quote-viewer.png` | explicit-open shows the real JSA quote and canonical provenance relations |
| `16-phase3-jsa-source-horizon-fit.png` | five real JSA providers as large native app anchors with counts |
| `17-phase3-layout-question.png` | native layout control translated into its Signal product question |

Browser state assertions:

- connection click: selected `lane:dependencies`; native `fly` active;
- Search click: selected `finding:mirror:002`; native `fly` active;
- Search clear: result panel closed, fly stopped, previous
  `lane:dependencies` selection restored;
- Trace: canonical overlay present and toast reported `Canonical provenance path`;
- layouts: Force/`simKind=force`, Circle/`circle`, Hex/`hex`, Rings/no simulation;
- blank pan + cursor zoom: camera changed from
  `{k:0.48,x:727,y:405}` to
  `{k:0.6175660978967235,x:641.7486874139646,y:354.96913869503055}`;
- object grab: `S.drag` was `signal:source:hermes`; its screen position moved
  from `(438,550)` to `(527,585)`; after release `drag`, `fx`, and `fy` were
  clear and the native Force simulation moved it toward home;
- production-shaped and JSA browser consoles: zero warnings/errors.

## Deterministic/veracity proof

Run:

```text
node --import tsx scripts/signal-rubric-phase3-proof.ts
```

The proof passed every assertion:

- accepted Phase 1 `_core.js` SHA-256 remains
  `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213`;
- exactly four guarded core extensions are applied at request time;
- Reality modifier is exactly `0`, `6`, or `12` world units and only applies
  inside native Memory-row seating;
- trust/currentness/producer cannot change Reality distance;
- provider identity ignores labels, prose, references, and URLs;
- canonical IDs and canonical edge census reconcile without missing endpoints;
- every provider-bearing passage matches its exact canonical
  `extracted_from` target;
- the adapter emits no geometry.

### Deterministic JSA fixture

- canonical objects: 61; source systems: Figma, Hermes, Linear,
  Meetings / Transcripts, Notion;
- Reality relationships: aligned 1, drift 1, conflict 4, unassessed 55;
- trust materials: attested 40, inferred 12, external 9;
- source roll-ups: Figma 1, Hermes 14, Linear 7,
  Meetings / Transcripts 25, Notion 8.

### Read-only production-shaped capture

- canonical objects: 438; canonical edges: 543;
- source systems: Documents, Hermes, Meetings / Transcripts;
- Reality relationships: drift 14, conflict 38, unassessed 386;
- trust materials: attested 239, inferred 38, external 161;
- source roll-ups: Documents 138, Hermes 173,
  Meetings / Transcripts 240.

The smaller provider list is intentional. The adapter no longer manufactures
Figma or Linear identity from prose in the capture; only typed canonical
provider fields qualify.

## Known boundary

`Fresh Audit` correctly routes to the existing scope-aware canonical Audit
workflow. That workflow ingests supplied evidence and reads its Linear context.
An automatic provider-wide Hermes/Notion/Figma/document refresh is not yet
orchestrated by this UI and is not faked by the read-only `Refresh world`
control. It needs an explicit canonical refresh contract before implementation.

## Verdict

**YES — Phase 3 still looks and behaves like Rubric with Signal meaning.**

