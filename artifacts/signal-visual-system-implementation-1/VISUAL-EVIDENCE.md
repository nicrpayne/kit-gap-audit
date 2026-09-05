# Visual evidence

All full-frame captures use the current Merge Train 1 product at base `0700dea` and a matched 1280×720 viewport. No 427/439 imagery is used.

## Before — deployed production

- `screenshots/before/01-control-room-production-0700dea.jpg`
- `screenshots/before/02-audit-fit-inspector-closed-production-0700dea.jpg`
- `screenshots/before/03-audit-trace-inspector-production-0700dea.jpg`
- `screenshots/before/04-audit-widget-family-production-0700dea.jpg`
- `screenshots/before/05-shell-nav-production-0700dea.jpg`

## After — isolated Phase 1 branch

- `screenshots/after/01-control-room-chrome-local-0700dea.jpg`
- `screenshots/after/02-audit-fit-inspector-closed-local-0700dea.jpg`
- `screenshots/after/03-audit-trace-inspector-local-0700dea.jpg`
- `screenshots/after/04-audit-widget-family-local-0700dea.jpg`
- `screenshots/after/05-shell-nav-local-0700dea.jpg`

Audit after-captures use the checked-in 438/543 production-shaped mirror. The Trace capture shows a focused and selected control simultaneously. The widget-family capture shows Menu, Legend, Search, and Inspector on the same unchanged world.

The Control Room’s deployed before-capture contains live data. The isolated branch has no local `DATABASE_URL`, so its after-capture is intentionally limited to shell/header/control chrome and demonstrates the existing fail-closed body. It is not presented as a matched data-body comparison. Control Room adoption is confined to header controls, state marks, panels, handoffs, telemetry, and status-bar material; its data and routing code are unchanged.

## Merge-conflict surface

- High: `app/globals.css` because it is the shared token layer.
- Medium: `InstrumentShell`, `InstrumentRail`, `CommandMenu`, and `ControlRoomPageClient` where concurrent shell/chrome work may overlap.
- Medium: `app/audit/rubric-phase3/route.ts` and current Audit chrome files if Inspector/widget styling changes concurrently.
- Low: new primitives, proof scripts, iframe theme bridge, and these artifacts.
