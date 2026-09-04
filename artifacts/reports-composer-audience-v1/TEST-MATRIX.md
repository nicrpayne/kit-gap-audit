# Test matrix

| Proof | Result |
|---|---|
| Reports V1 nine deterministic fixtures | PASS |
| 6 audiences × 8 purposes | PASS — 48 combinations |
| Audience/purpose preserve frozen fingerprint | PASS |
| Hide module preserves fingerprint | PASS |
| Reorder module preserves fingerprint | PASS |
| Likely/target values reconcile when shown | PASS |
| Missing canonical commitment stays explicit | PASS |
| Ungated Decision modeled delay | PASS — 0/0/0 |
| Gated Decision targetScopeId | PASS — `platform` |
| Leadership candidate not auto-promoted | PASS |
| Operator promotion references first-class Decision | PASS |
| Deep links preserve project context | PASS |
| Interactive bundle contains no live access/secrets/publish authority | PASS |
| LIVE Timeline vs HISTORICAL movement | PASS |
| Missing named Capacity does not emit contributors | PASS |
| KIT Construct pivot gaps remain explicit | PASS |
| TypeScript | PASS |
| ESLint | PASS with 44 pre-existing warnings, 0 errors |
| Next production build | PASS |
| Browser composer/finished/Site surfaces | PASS, no console errors |
| 700px responsive composer | PASS |
| Browser hide-module fingerprint check | PASS — `dbv1-003f396e` before/after |

Database integration proof remains gated by `REPORTS_DB_PROOF=1` and a disposable local fixture database. Its assertions now cover saved recipe/presentation versions and exact audience Markdown re-rendering.
