# Source State

## Production authority

| Field | Verified value |
|---|---|
| App | `https://kit-gap-audit-production.up.railway.app` |
| Environment | `production` |
| Browser verification date | 2026-09-11 CDT / 2026-09-12 UTC |
| Production commit | `6c46ce984ffb231f4c33dc8653077cec55c30389` (`6c46ce9`) |
| Production Git tree | `62ba81d79137a66117412396a20c6792a1e4d57e` |
| Build/deployment marker | Railway deployment `628743a3-fa6c-4053-b063-d024b373995e` |
| Reported branch | `claude/product-timeline-audit-a72dmg` |
| Commit message | `Close forecast coverage leaks across all surfaces` |
| Version endpoint | `GET /api/version`, HTTP 200, `cache-control: no-store` |

The reported branch name is deployment metadata, not the Git branch that currently points at the commit. Git identifies the deployed object as the tip of `codex/forecast-coverage-scope-composer-fix`; the production commit and tree are the durable authority.

## Verification status

- The production app is kept open in the Work browser at `/control-room` throughout the documentation pass.
- `/api/version` and the unauthenticated redirect boundary were verified from the live Railway service.
- Authenticated visual verification is blocked as of the date above. The browser automation policy verifier denied inspection before page content could be read on repeated attempts; no security control was bypassed.
- All consequential journeys are reserved for fixture/staging evidence. Production is read-only.

## Current live operator routes

| Instrument | Canonical route | Status |
|---|---|---|
| Master Control Room | `/control-room` | Live; default landing route |
| Audit | `/audit` | Live |
| Project Activation | `/projects/bootstrap/:id` plus Add Project sheet | Live |
| Scope | `/scope` | Live |
| Decisions | `/decisions` | Live |
| Dependencies / Orbit | `/orbit` (rail label: Dependencies; page title: Orbit) | Present in the live destination contract; naming/status contradiction logged as `SIG-DOC-002` |
| Portfolio / Capacity | `/portfolio` | Live |
| Forecast | `/forecast` | Live |
| Timeline | `/timeline` | Live |
| Reports | `/reports` | Live |
| Search / Trace / Inspector | Inside Audit and Control Room surfaces | Live |
| Scope administration | `/scopes` | Live utility/settings surface |
| Audit history | `/audit/history` | Live supporting route |
| Legacy dashboard | `/dashboard` | Reachable, not the default operator surface |

## Live versus non-live distinctions

- `/orbit` is included in the production destination contract as **Dependencies**, while its page title and code comment still call it **Orbit** and describe it as development-only. The guides describe both visible names and do not resolve the conflict; see `SIG-DOC-002`.
- Reports' audience/purpose composer is live; its fixture prototype routes are non-production-only.
- Interactive Site creation is a governed, user-mediated handoff artifact. Signal prepares a bundle; it does not autonomously publish a public site.
- Audit rubric fixture/subroutes are implementation and proof surfaces, not operator destinations.
- Semantic Search V2 and Human Release History are not represented as live operator instruments in this production tree.

## Documentation branch

- Branch: `codex/signal-complete-user-guide-training-system`
- Base: the exact production commit above
- Product code changes: none intended
