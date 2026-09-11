# Test matrix

| Boundary | Result |
| --- | --- |
| Empty PostgreSQL migration pass | PASS — 26/26 migrations |
| Audit freshness states | PASS — current, new, ingesting, refreshing, offline |
| Refresh guard and zero-canonical-write refresh | PASS — existing refresh proofs |
| Raw evidence no longer primary or writable | PASS |
| Aggregate 5 FTE blocks allocation commit | PASS |
| Five-person roster becomes `named_exact` | PASS |
| Named/legacy mismatch requires confirmation | PASS |
| 0.5/0.5 split conserves one FTE | PASS |
| Over-allocation rejected | PASS |
| Partial roster cannot become canonical | PASS |
| Context-switch effectiveness recomputed | PASS |
| Post-exact scenario commit and no-op retry | PASS |
| Active person removal requires confirmation | PASS |
| Capacity readiness blocker clears | PASS |
| Derived Forecast/Timeline/Control Room/Reports receipts | PASS — current revision 1/1 in fixture |
| Scope accepted/outside/open/execution partition | PASS |
| Scope with zero execution retains product shape | PASS — browser |
| Production Hardening 2 and five-zone date contract | PASS |
| Project Activation phases 1/2 and companion | PASS |
| Audit change inbox A–L | PASS |
| Project context | PASS — 189/189 production-mode browser checks |
| Forecast FTE conservation | PASS |
| Reports fixtures/audiences/persistence/API/readiness | PASS |
| Protected Audit world | PASS — 33 files unchanged; fingerprint `5a798edc490b9f3c127899ad88e94aca5928ae733894f0fe813b00a1ff562961`; 438/543 |
| Rubric geometry/camera/gesture | PASS — 129/129 |
| Phase 3/3A/3B contracts | PASS |
| TypeScript and production build | PASS |
| Repository lint | PASS — 0 errors; 40 existing warnings |
| Browser smoke | PASS — screenshots plus production-mode 189/189 matrix; no browser errors |

Two legacy optional proofs remain unavailable because their private, uncommitted production capture files are absent: `production-jsa-graph.json` and `production-jsa-truth.json`. Checked-in protected alternatives passed at the same 438/543 census. The older generic visual-system proof also contains an intentional “no API/schema/Forecast/Reports changes” assertion that cannot apply to this explicitly data-contract-changing tranche; its protected world fingerprint sub-gate passed independently.

