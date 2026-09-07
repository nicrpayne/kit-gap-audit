# Rescan law

Candidate key is stable across packages by candidate kind plus normalized title. Fingerprint is SHA-256 over typed payload plus sorted independent raw lineage roots.

- Same key + same fingerprint: copy accepted/deferred/rejected/information-only/pending state, reason, reviewed payload, and matching evidence-link overlay from fingerprint-matched history, not merely the immediately prior package.
- Same key + changed fingerprint: create a new active pending row, mark `changedSincePrior`, and point to the prior candidate. The old row/history remains immutable.
- New key: pending.
- Identical package content: reuse the materialized package and candidate ledger; if that package was superseded and later returns, reactivate its reviewed rows atomically.
- Prior package candidates become inactive only after a new package is persisted.
- Manual operator assertions remain active across rescans.

This prevents rejected or accepted candidates from returning as pending duplicates, including the sequence `reviewed → temporarily absent → present again`, while still reopening materially new evidence or meaning for governance.
