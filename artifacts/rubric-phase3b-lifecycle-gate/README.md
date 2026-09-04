# Signal Audit Phase 3B final lifecycle gate

## Verdict

PASS. The real model-backed Audit lifecycle completed through the mounted
Audit World against the production-shaped disposable JSA database. The run
used the existing `/api/audit` pipeline and the process-scoped Anthropic
credential already held by the lifecycle helper. The credential was never
read, printed, copied, or persisted by the proof.

## Authority and protected runtime

- Experimental branch tested: `claude/signal-rubric-engine-audit-jvax0e`
- Code SHA tested before this evidence commit: `d0227f826c658de52dae34253c79d961eb203a68`
- Origin experimental branch after fetch: `68d5b3c4385dad6f04ea17d2963f23b483d155b8`
- Protected `_core.js`: `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213`
- Protected `_flows2.js`: `2fb3e9937a141df8ec9233c851426f845718216c54fb6336752291b539b07496`
- Protected `_core.css`: `51797b9f261c03255db8cc660897812f1106d16e4ca1eacaeb7f94de7bc7a06a`
- Protected `_icons.js`: `59dfd3e24f8cf7504c05609eb0063c22898950c33f45facea13b92c2b173f48a`

All four protected files remained byte-identical to the supplied Rubric
reference and the accepted Phase 3B starting point.

## Before the model call

- 438 canonical objects
- 543 canonical relationships
- 513 Rubric visual nodes
- 1,591 Rubric visual relationships
- 0 duplicate canonical IDs
- 0 missing visual relationship endpoints
- Source systems: Documents, Figma, Hermes, Linear, Meetings / Transcripts,
  Notion
- 37 persisted Findings
- 1 persisted Source
- 2 historical AuditRuns
- Reality fingerprint:
  `2c34bbb305750f906fb90f1a5c0844dc1cabbf1b955fed2f67cddd1e656fda57`

The seed had been used by two earlier disposable proof runs. Before this gate,
only those two generated Sources, their three generated Findings, and the two
generated AuditRuns were removed. The database then returned exactly to the
seed's required 438/543 canonical baseline.

## Real lifecycle result

The UI submitted a Notes Audit titled `Phase 3B final lifecycle gate` with
evidence that exercised both a blocking risk and an unresolved staffing
decision. The model returned two Findings and persisted:

- Source `cmtm6knjd000fitpgexsr9ewx`
- AuditRun `cmtm6knjt000litpgredu8pfo`
- Finding `cmtm6knjn000hitpgcts0c0oy`: App Store reviewer-access ownership risk
- Finding `cmtm6knjq000jitpgm666mm3d`: Notifications vs KIT Construct ownership
  decision
- Model: `claude-sonnet-4-6`

Immediately after the Audit:

- the current graph was 441 canonical objects / 547 canonical relationships;
- the new Audit was current and the 2026-08-05 Audit was prior;
- the world reported `Audit complete · 2 findings · world updated`;
- the search census changed in place from 438 to 441 objects;
- the pre-run `KE JSA Notifications Discussion` selection stayed open;
- the iframe time origin remained within 0.5 seconds of the parent page time
  origin and was more than three minutes old after the refresh, proving the
  same mounted world was not remounted;
- no automatic Fit occurred; and
- the Reality fingerprint remained exactly unchanged.

## Governed Finding write

The newly created decision Finding was opened through its Rubric popup and
the existing governed Finding review. `Open the decision` created one open,
ungated Decision linked to the Finding. The same Finding remained selected
after the canonical refresh and its card gained the new `resolves`
relationship. The graph became 442 canonical objects / 548 canonical
relationships. Reality's fingerprint still remained byte-for-byte identical.

## Automated post-run smoke

PASS:

- Search and exact clear restoration, including camera and selection state
- Canonical provenance Trace
- Hermes Source Systems canvas-anchor selection
- Canonical Finding-to-Source connection navigation
- Popup and `View here`
- Rings, Circle, Force, and Hex morphs
- Live node drag, blank-space pan, and cursor-anchored zoom
- Project Overview with correct current/prior counts
- History with the new run and correct open-Finding count
- Governed Finding review and Decision creation
- Same-world selection coherence after the governed write
- Empty browser warning/error console

The hover regression dispatched 300 dense pointer moves in each layout
(1,200 total) with a temporary document observer. Callback and mutation counts
remained bounded, the world retained exactly two canvases and 519 visual nodes,
the final measured heap was 40.7 MB, and the warning/error console stayed
empty. The temporary observer and listener were disconnected and removed.
This supplements the permanent Phase 3B 60-second / approximately 15,000-
transition-per-layout endurance evidence.

## Safety cleanup

The disposable database and model-enabled server are destroyed after this
evidence is committed. Repository scanning found no persisted Anthropic-key
pattern. No production Audit or Reality mutation occurred.

See [measurements.json](measurements.json) for the machine-readable summary.
