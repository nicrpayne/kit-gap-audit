# Bugs and Friction Found During Documentation

## SIG-DOC-001 — Authenticated production visual inspection blocked

| Field | Value |
|---|---|
| Date/time | 2026-09-11 CDT / 2026-09-12 UTC |
| Severity | P1 documentation blocker; external browser-policy failure, not yet classified as Signal product code |
| Project | All |
| Instrument | All authenticated production routes |
| Reproduction | Keep production open at `/control-room`; request browser state through Work browser automation |
| Expected | Read authenticated accessibility tree and capture current production screenshots |
| Actual | Browser denied access because the admin-enforced policy could not be verified; repeated retries failed before content inspection |
| Screenshot | None; security control prevented capture |
| Product code vs data/config | Browser/tool policy infrastructure; Signal `/api/version` remained reachable and authenticated routes redirected correctly without session |
| Likely area | Work browser policy verifier/session infrastructure |
| Blocks docs? | Yes: final authenticated usability walkthrough and current-production screenshots |
| Recommended next action | Restore policy verification, then run the live checklist and recapture all visuals before recording; do not bypass the control |

## SIG-DOC-002 — Dependencies route authority is internally contradictory

| Field | Value |
|---|---|
| Date/time | 2026-09-11 CDT |
| Severity | P2 |
| Project | All |
| Instrument | Dependencies / Orbit |
| Reproduction | Compare `app/orbit/page.tsx` comment with `lib/shell/mode.ts` production destination list |
| Expected | One durable statement of whether `/orbit` is an approved live instrument and one user-facing name |
| Actual | Route comment says development-only and intentionally absent from destinations; destination list includes it as the live Dependencies child, while the surface title remains Orbit |
| Screenshot | `screenshots/annotated/15-dependencies.png` |
| Product code vs data/config | Product code/comment and naming inconsistency |
| Likely area | Shell information architecture and stale route commentary |
| Blocks docs? | Partly; guide documents the visible name pair and requires live rail verification |
| Recommended next action | Choose the product name, align route title/rail/help text/comments, and verify Back/Forward context |

## SIG-DOC-003 — Current production tree is not the repository default branch tip

| Field | Value |
|---|---|
| Date/time | 2026-09-11 CDT |
| Severity | P2 release/process risk |
| Project | All |
| Instrument | Release authority |
| Reproduction | Fetch origin; compare `origin/HEAD` with live `/api/version` |
| Expected | Default branch or documented release ref resolves to deployed commit |
| Actual | Production reports `6c46ce9`; `origin/HEAD` points to older `73e93f0`. The deployed commit is on `codex/forecast-coverage-scope-composer-fix` and the API reports a different branch metadata label |
| Screenshot | Not visual |
| Product code vs data/config | Git/release configuration |
| Likely area | Promotion/default-branch process and Railway branch metadata |
| Blocks docs? | No; commit and tree are pinned explicitly |
| Recommended next action | Create a stable production ref or update default branch after governed promotion; make `/api/version.branch` report the actual deploy source/ref |

## SIG-DOC-004 — Control Room does not present a single persistent project selector in the release visual

| Field | Value |
|---|---|
| Date/time | 2026-09-11 CDT |
| Severity | P3 usability observation pending live confirmation |
| Project | Multi-project fixture |
| Instrument | Master Control Room |
| Reproduction | Inspect the checked-in `43c93a8` Control Room release fixture; compare with owner instrument project selectors |
| Expected | Project focus is unmistakable before a person reads a headline date |
| Actual | The composition is portfolio-wide and selection is field-driven; the header exposes View but not an equally prominent persistent selected-project control |
| Screenshot | `screenshots/annotated/10-control-room.png` |
| Product code vs data/config | UX/information hierarchy |
| Likely area | Control Room header/project focus treatment |
| Blocks docs? | No; guide instructs the operator to verify the named outcome and field selection |
| Recommended next action | Validate with live usability study; consider a persistent focus label if users misread portfolio outcome as selected-project outcome |

