# ChatGPT Sites handoff contract

The downloaded JSON file contains exactly three top-level values: contract version, sealed bundle, and deterministic Site-generation instructions.

The instructions require ChatGPT Sites to:

- use bundle facts only and perform no discovery, browsing, inference, or live refresh;
- never connect to Signal or add Signal credentials/actions;
- preserve LIKELY ≠ TARGET ≠ COMMITTED;
- state “No canonical delivery commitment” when none exists;
- retain missing, unavailable, stale, unreconciled, and grounding caveats;
- treat generated prose as presentation, not new project truth;
- use only allowed interactions and permitted provenance;
- create a calm recipient-facing brief, not a Signal clone or DAW;
- add no forms, analytics, storage, auth, or external data;
- keep the draft private, save a reviewable version, and not deploy/share/change access without explicit approval;
- reconcile every displayed fact to the bundle before returning the preview.

`example-bundles/healthy-handoff-prompt.txt` is the canonical fixture.
