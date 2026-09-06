# Cross-instrument reconciliation

The permanent fixture is `production-hardening-2-live-truth-v1`.

Facts: now Sep 5, 2026; live Forecast owner as of Aug 5; likely Sep 17; one separate historical Report; zero executable Scope items; one open unaccepted missing-work Finding; 1.0 legacy inferred Forecast FTE; 0.0 named FTE; 0.0 scenario FTE; two open Decisions; one gated Decision targeting iTrack; one JSA → Platform declared dependency; Audit 438/543.

| Consumer | Required reading | Result |
|---|---|---|
| Control Room | Live owner, stale 31d, 2 open, gating subset 1 | Pass |
| Audit | 438 objects, 543 relationships, protected fingerprint | Pass |
| Decisions | All 2 / Open 2 / Gating 1 / Open-not-gating 1 | Pass |
| Forecast | Live owner, stale 31d, likely Sep 17 | Pass |
| Portfolio / Capacity | Basis 1.0 / named 0.0 / scenario 0.0 / unreconciled | Pass |
| Scope | 0 executable, 0 modeled days, 1 missing-work Finding | Pass |
| Dependencies | JSA → Platform; gate target iTrack; no fake JSA gate | Pass |
| Timeline | Live stale Forecast and historical Report remain separate | Pass |
| Reports | Live stale source label; three unsafe legacy fixtures sanitized | Pass |

The proof runs with `npm run proof:production-hardening-2`.
