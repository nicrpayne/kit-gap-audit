# Provenance

Candidate fingerprints are deterministic over kind, payload, and independent lineage roots. The review ledger retains the original proposal, reviewed proposal, disposition, evidence attachment state, and events across rescans.

Activation provenance records the bootstrap/candidate boundary, source fingerprint, exact evidence references, basis, and operator-assertion flag. A manually accepted assertion remains labeled `operator_assertion` with `originalAuthorshipPreserved: true`; later support, contradiction, or supersession cannot rewrite its origin.

Wiki evidence uses derivative lineage and never counts as a second independent source when it shares the transcript's root.
