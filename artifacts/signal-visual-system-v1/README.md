# Signal Visual System v1 — assessment package

Status: **ready for implementation**

Baseline: `edf3dfff8e952ac9c12f0c8151779f0963477292`

Branch: `claude/signal-visual-system-v1`

This package defines a shared visual language for Signal without changing any
product route, workflow, truth contract, database, or protected Rubric runtime.
It treats the Master Control Room as the aesthetic reference and the Rubric
runtime as an interaction and spatial-rendering reference only.

## Decision in one sentence

Signal is a graphite instrument with warm-white information and narrowly
semantic light: cyan for current Reality, violet for hypothetical structure,
amber for attention, coral for risk, mint for accepted/available, blue and
silver for provenance, and no generic orange chrome.

## Contents

- [`CURRENT-TOKEN-INVENTORY.md`](CURRENT-TOKEN-INVENTORY.md) — current token
  families, literal-color census, and surface inventory.
- [`SEMANTIC-PALETTE.md`](SEMANTIC-PALETTE.md) — palette, state axes, material,
  typography, charts, and provenance rules.
- [`CONTRADICTIONS.md`](CONTRADICTIONS.md) — 18 verified semantic conflicts.
- [`WIDGET-SYSTEM.md`](WIDGET-SYSTEM.md) — “World first. Widgets around the
  world.” anatomy, placement, and behavior.
- [`INSTRUMENT-ROLLOUT.md`](INSTRUMENT-ROLLOUT.md) — minimum changes by
  instrument and conflict-safe rollout order.
- [`TOKEN-CONTRACT.md`](TOKEN-CONTRACT.md) — proposed CSS contract and migration
  compatibility layer.
- [`ACCESSIBILITY.md`](ACCESSIBILITY.md) — contrast, keyboard, motion, and
  non-color requirements.
- [`prototypes/harmonized-audit-world.html`](prototypes/harmonized-audit-world.html)
  — build-excluded 1280×720 Audit World composition.
- [`prototypes/signal-system-board.html`](prototypes/signal-system-board.html) —
  build-excluded cross-instrument material and widget board.
- `screenshots/` — matched current/proposed references at 1280×720.

## Visual comparison

| Reference | File | What to inspect |
|---|---|---|
| Master Control Room, current | `screenshots/current-control-room.png` | Graphite depth, restrained semantic light, instrument tone |
| Audit World, current | `screenshots/current-audit-world.png` | Strong world fidelity, but controls form a heavy page grid and review displaces the world |
| Audit World, proposed | `screenshots/proposed-harmonized-audit-world.png` | Same world grammar with docked/floating widgets and semantic color |
| Portfolio/Capacity, current | `screenshots/current-portfolio-capacity.png` | Strong density but weak active hierarchy and too much equal-weight graphite |
| System board, proposed | `screenshots/proposed-signal-system-board.png` | Shared material and state grammar across Control Room, Audit, and Portfolio |

These are design references, not pixel-locked implementation specifications.
The mockups deliberately do not reproduce or replace Rubric layout code.
The current-state captures are pre-existing production-audit references: Audit
is from the branch baseline; Control Room and Portfolio were unchanged by the
subsequent Rubric parity commit that produced this baseline.

## Guardrails observed

- No production component or route is changed.
- No token is installed globally in this branch.
- No product behavior, schema, data, Reports implementation, or deployment is
  included.
- Prototype files live under `artifacts/` and are not imported by the app.
- The Audit proposal changes the controls around the world, not the world’s
  rendering authority or protected runtime.

## Acceptance gate for implementation

An implementation tranche may start when it names the semantic token it is
using, preserves a text/icon/shape channel for every truth distinction, passes
the contrast table in `ACCESSIBILITY.md`, and does not merge instrument-specific
layout work into the token-foundation commit.
