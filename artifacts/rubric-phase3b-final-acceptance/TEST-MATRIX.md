# Test matrix

## Product/browser exercises

| Exercise | Population / cycles | Result |
|---|---:|---|
| Audit entry and world occupancy | seeded JSA | PASS |
| Project switch | Platform ↔ JSA | PASS |
| Current/prior context | 6 switches | PASS |
| History/detail/return | seeded JSA | PASS |
| Overview open/close | seeded JSA | PASS, stats PARTIAL |
| Finding View here | seeded JSA | PASS |
| Governed Finding write | 1 Decision creation | PASS |
| Finding overlay stability | 5 cycles | PASS |
| Source anchor popup | 10 Hermes cycles | PASS |
| Popup object matrix | Reality, Finding, Decision, Dependency, passage, external, transcript, source anchor, person | PASS |
| Search query matrix | identity, typo, quote, SOF, Decision, external, provider | PASS |
| Search clear | exact camera/layout/selection comparison | PASS |
| Connection navigation | passage → transcript | PASS |
| Trace | source, passage, Attention echo | PASS |
| Trace → Search | stale overlay pixel census | PASS after fix |
| Hide/reload restore | one canonical work object | PASS, undo PARTIAL |
| Layouts | Rings, Force, Circle, Hex | PASS; Circle/Hex legibility PARTIAL |
| Drag | live-position node grab | PASS |
| Pan | +100 / −50 px | PASS |
| Zoom/Fit | 0.48 → 1.216 → 0.211 → 0.48 | PASS |
| Input during morph | pan + zoom during Force transition | PASS |
| Production-shaped census | 438 / 543 | PASS |
| Other Signal instruments | 7 routes | PASS |
| Production build | Next.js 15.5.22 | PASS |
| Production browser console | Audit World | PASS, clean |
| Real Run Audit completion | disposable DB | BLOCKED by missing key |

## Automated proofs

- `signal-rubric-source-card-proof.ts` — PASS
- `signal-rubric-adapter-proof.ts` — PASS
- `signal-rubric-phase3-proof.ts` — PASS
- `signal-rubric-phase3a-proof.ts` — PASS
- `signal-rubric-phase3b-proof.ts` — PASS
- `audit-search-proof.ts` — PASS, 2 environmental skips
- `audit-production-parity-proof.ts` — PASS
- TypeScript `--noEmit` — PASS
- Production build — PASS
- Legacy `audit-interaction-proof.ts` — one retired-renderer F1 assertion fails; see `BUGS.md`

## Other Signal smoke test

Control Room, Forecast, Portfolio/Capacity, Decisions, Dependencies (`/orbit`), Timeline and Reports all loaded their normal instrument surface against the disposable database with zero browser errors.

