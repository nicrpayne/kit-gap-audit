# Signal Audit Phase 3B — resumed acceptance

## Verdict

The unblocked Phase 3B product surface is accepted with no known P0/P1 product bug. The one external prerequisite remains the real model-backed Run Audit lifecycle: `ANTHROPIC_API_KEY` was not available in the shell, a repo-local environment file, or the documented local secret-loading mechanism.

Feature parity: **44 PASS / 5 PARTIAL / 0 FAIL / 1 EXTERNAL PREREQUISITE BLOCKED**. Weighted unblocked parity is **94.9%**. Rubric fidelity is **4.4 / 5**.

## Build identity

- Branch: `claude/signal-rubric-engine-audit-jvax0e`
- Phase 3B resume point: `f2d5f7749f7ab9f7b3678033bab9e627f5ee3a54`
- Exact code SHA tested after acceptance fixes: `515bcfaef6e15df2e509eaa4628247d163af7ff4`
- Rubric reference: `lab/rubric-reference/second-brain/public/`
- Browser: Codex in-app Chromium browser, 1280 × 720 screenshots
- Hardware/environment: local Apple Silicon macOS, Next.js 15.5.22, production and development servers
- Database: disposable PostgreSQL 16 container, localhost only, port 55432, migrated through all 18 migrations and seeded with `prisma/seed-dev.ts`
- Production-shaped visual input: read-only 438-object / 543-relationship JSA capture
- Deployment: none

## Protected Rubric chassis

The protected files remain byte-identical to both the reference and the Phase 3B starting SHA:

| File | SHA-256 |
|---|---|
| `_core.js` | `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213` |
| `_flows2.js` | `2fb3e9937a141df8ec9233c851426f845718216c54fb6336752291b539b07496` |
| `_core.css` | `51797b9f261c03255db8cc660897812f1106d16e4ca1eacaeb7f94de7bc7a06a` |
| `_icons.js` | `59dfd3e24f8cf7504c05609eb0063c22898950c33f45facea13b92c2b173f48a` |

## Acceptance fixes found by stress testing

1. Refresh now falls back from the old Rubric transport ID to canonical ID, preserving selection when a Finding changes presentation role after a governed write.
2. Starting Search clears an active Trace so an unrelated result can never appear behind a stale provenance path.
3. Attention echoes inherit the exact Trace path of their canonical object; no edge is added or rewritten.

All three were reproduced in-browser before the fix and retested afterward. Rubric mechanics were not changed.

## Evidence map

- [Feature parity](FEATURE-PARITY.md)
- [Audit lifecycle](AUDIT-LIFECYCLE.md)
- [Data veracity](DATA-VERACITY.md)
- [Rubric fidelity](RUBRIC-FIDELITY.md)
- [Search and Trace](SEARCH-TRACE.md)
- [Performance](PERFORMANCE.md)
- [Bugs](BUGS.md)
- [Next phase](NEXT-PHASE.md)
- [Test matrix](TEST-MATRIX.md)
- [Measurements](measurements.json)
- [Contact sheet](videos/contact-sheets/phase3b-acceptance-contact-sheet.jpg)

## Direct acceptance answers

- Everything except model-backed Run Audit proven? **All major unblocked workflows are proven; five bounded P2 presentation/parity gaps remain.**
- Product/architecture blocker? **No.**
- Rubric chassis intact? **Yes.**
- Finding review proven? **Yes, including a real governed database write in the disposable environment.**
- Only external prerequisite? **Yes: `ANTHROPIC_API_KEY` for the real model-backed lifecycle.**
