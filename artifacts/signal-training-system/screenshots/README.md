# Screenshot and Visual Index

## Provenance rule

No image in this directory is claimed to be a fresh authenticated production capture. The production app remained open during this pass, but the browser policy verifier denied programmatic visual access. Raw screenshots below are checked-in release-fixture evidence from commits included in the production lineage; every annotated image says **not current production data**. Re-capture against authenticated production is required before recording.

The diagrams `00`–`03` are documentation-native assets tied to the production contract at `6c46ce9`.

## Raw visual evidence

| File | Instrument/state | Original evidence commit | Environment |
|---|---|---|---|
| `01-control-room.png` | Control Room · stale live owner fixture | `43c93a8` | disposable release fixture |
| `02-audit-world.png` | Audit world · 438-object production mirror | `43c93a8` | disposable production mirror |
| `03-project-activation-review.png` | Bootstrap Review + provenance | `931e2dd` | disposable companion proof |
| `04-scope.png` | Accepted shape, zero execution, open shape Decision | `73e93f0` | disposable operator-cleanup fixture |
| `05-decisions.png` | Open/gating lifecycle | `43c93a8` | disposable release fixture |
| `06-dependencies.png` | Orbit/Dependencies declared edge | `43c93a8` | disposable release fixture |
| `07-capacity.png` | named_exact Capacity | `73e93f0` | disposable operator-cleanup fixture |
| `08-forecast.png` | Live owner · stale 31d | `43c93a8` | disposable release fixture |
| `09-timeline.png` | NOW + live stale Forecast | `43c93a8` | disposable release fixture |
| `10-reports.png` | Audience Brief Composer | `a34ac4f` | development fixture/prototype route |
| `11-search-trace-inspector.png` | Audit trace + Inspector | `912ae66` | disposable production-mirror fixture |
| `12-audit-change-inbox.png` | New intelligence + proposal queue | `e4dc807` | disposable Audit refresh fixture |
| `13-report-readiness.png` | Report Not Ready · 3 blockers | `e4dc807` | disposable Audit refresh fixture |
| `14-project-activation-scan.png` | Companion-backed knowledge scan | `931e2dd` | disposable companion proof |
| `15-project-activation-manifest.png` | Activation Manifest | `3791a0a` | disposable activation fixture |
| `16-project-activation-first-audit.png` | First Audit after activation | `3791a0a` | disposable activation fixture |

## Annotated inventory

| Files | Teaches |
|---|---|
| `00-signal-at-a-glance.*` | Six-stage operating loop |
| `01-which-instrument.*` | Question-led routing |
| `02-human-architecture.*` | Source → evidence → proposal → governance → consequence |
| `03-safe-vs-consequential.*` | Exploration, writes, and derived recomputation |
| `10-control-room.*` | Project focus, likely/target, choices, constraints, currentness, rail |
| `11-audit-world.*` | Reality center, Project Model/World, Attention, Sources, Search |
| `12-project-activation.*` | Review sections, proposal state, provenance, NOT REALITY |
| `13-scope.*` | Accepted shape, unmapped execution, out-of-release, open Decision |
| `14-decisions.*` | Lifecycle, path, gate subset, Inspector, New Decision |
| `15-dependencies.*` | Source/target, declared edge, semantics, focus |
| `16-capacity.*` | Forecast basis, named allocations, raw/effective, roster, splits |
| `17-forecast.*` | Likely/window, target entry, currentness, distribution |
| `18-timeline.*` | NOW, Forecast, lanes, transport, playback, Add event |
| `19-reports.*` | Audience, purpose, mode, module rack/Inspector, Site handoff |
| `20-search-trace-inspector.*` | Query, selection, Inspector, path, inferred/declared connections |
| `21-audit-change-inbox.*` | Freshness, change count, queue, comparison panel |
| `22-report-readiness.*` | Readiness gate and owner blocker doors |

Both editable SVG and rendered PNG are included. Rebuild the generated instrument visuals with `node scripts/build-signal-training-visuals.mjs`, then render SVGs to PNG with the repository's screenshot tooling.

