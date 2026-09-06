# Production Hardening 2 — canonical date contract

This evidence tranche fixes the P1 cross-instrument one-day contradiction
found during authenticated production smoke of `43c93a8`.

- Verified production history head before work: `d1c09c61339e3752379996da389ed0c661dc42cd`
- Verified production tree: `2ed569d1d6b73bf371a5492c69db001a233c9c9d`
- Accepted Hardening 2 source: `43c93a8e00db6991313d9c54733aae81f10a35e2`
- Accepted source tree: `724204b8c3c00cbde37305c2d74f681db9c717c1`
- Correct canonical likely day: `2026-09-18`

The implementation keeps forecast math unchanged. It adds a shared DateOnly
and Instant boundary, normalizes delivery read models to `YYYY-MM-DD`, and
migrates every likely-date surface to the same date-only formatter.

See `TRACE.md`, `TEST-MATRIX.md`, and `docs/DATE-TIME-CONTRACT.md`.
