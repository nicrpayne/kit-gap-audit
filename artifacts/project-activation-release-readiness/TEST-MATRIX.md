# Release regression matrix

| Gate | Result |
|---|---|
| Standalone bridge suite | 83/83 passed, including real KE corpus readers and authenticated client boundaries |
| Real KE JSA compile | Passed Signal v1.1 validation; 627,872 bytes; 53 artifacts / 173 evidence / 181 heads / 96 relations / 136 proposals |
| PostgreSQL migrations | 22/22 applied to each clean disposable database |
| TypeScript | Passed (`tsc --noEmit`) |
| ESLint | 0 errors; 44 pre-existing warnings |
| Next production build | Passed |
| Project Activation Phase 1 | Pure and DB proofs passed |
| Project Activation Phase 2 | Pure and DB proofs passed |
| Package transport retry | Same scan; exactly 1 scan and 1 package |
| Activation retry/concurrency | Reused; exactly 1 activation per bootstrap |
| Atomic validation failure | Zero partial canonical writes |
| Project-context matrix | 189/189 checks passed; zero browser errors |
| Date/time contract | Passed across 5 time zones and all named surfaces |
| Production Hardening 2 | Passed |
| Reports DecisionBrief | 9 fixtures plus DB lifecycle passed |
| Reports composer | 48 audience/purpose combinations plus persistence passed |
| Audit Search | Passed |
| Audit protected world | 33 protected files, 0 changed |
| Audit census/fingerprint | 438 objects / 543 relationships; `5a798edc490b9f3c127899ad88e94aca5928ae733894f0fe813b00a1ff562961` |
| Rubric renderer/gesture | 129/129 passed; protected files byte-identical |
| Rubric adapter/Phase 3/3A/3B | Passed |
| Disposable browser proof | Review, provenance, activation, Audit, Forecast, Audit World; 0 console errors |

The Phase 3A proof was updated to recognize the existing `SignalControl` submit wrapper as well as a native button; the underlying `disabled={running}` single-submit guard was unchanged. Playwright is now a declared development dependency so the permanent browser matrix is reproducible from a clean checkout.
