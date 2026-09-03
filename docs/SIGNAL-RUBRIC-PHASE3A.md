# Signal Audit World — Phase 3A integration

Phase 3A makes the Rubric-powered world the primary `/audit` surface. It does not put Rubric back inside the retired graph/inspector dashboard.

## Runtime boundary

```text
canonical Audit graph
        ↓
SignalRubricAdapter
        ↓
AuditWorld (thin Signal frame and lifecycle bridge)
        ↓
actual Rubric runtime
```

`AuditWorld` owns only Audit chrome and application lifecycle: project selection, current/prior Audit selection, Run Audit, History, Project Overview, and the stable iframe bridge. Rubric still owns coordinates, layouts, camera, pan/zoom, dragging, morphing, hit testing, source anchors, atmosphere, selection cards, viewer mechanics, Search presentation, and focus navigation.

The iframe URL is stable for the mounted world. Scope, Audit-history, and completed-run changes cross a same-origin `postMessage` boundary. The Audit-local host clears only its derived payload cache and calls Rubric's existing `refreshData` method. It does not recreate the viewport or call Fit, so the live camera remains authoritative and Rubric performs the transition.

## Audit frame

The normal Signal instrument rail remains accessible. A 46px Audit header provides:

- `SIGNAL AUDIT` identity
- project selector
- current project world / current Audit / prior Audit / earlier Audit selector
- Project Overview overlay
- History
- Run Audit

Everything below that header belongs to the Rubric world. There is no persistent right inspector. Rubric's selected-item card is the first inspection surface; `View here` opens Rubric's deeper viewer over the world, and closing it leaves the selection and camera intact. Search and Trace also remain overlays.

## Current and prior Audits

The context endpoint returns the selected project's evidence runs in reverse chronological order and labels the first two Current and Prior. Selecting one applies an honest Audit lens:

- the selected source and its Findings are narrowed to that run;
- Reality, accepted project structure, Decisions, Dependencies, work, capacity, and external intelligence remain the current canonical project frame.

This is intentionally not described as a historical Reality snapshot. Signal does not currently persist historical snapshots for all of those systems, and Phase 3A does not fabricate one.

## Run Audit

The overlay submits to the existing `POST /api/audit` pipeline. A successful run then reloads Audit context and asks the already-mounted Rubric world to refresh its adapter input. New Findings enter review; the integration does not accept them or mutate Reality. The existing `/audit/new` form remains available for file upload.

## Protected chassis

The accepted Phase 1 files remain byte-identical to the supplied Rubric source:

- `public/audit-rubric-phase1/_core.js`
- `public/audit-rubric-phase1/_flows2.js`
- `public/audit-rubric-phase1/_core.css`
- `public/audit-rubric-phase1/_icons.js`

The Phase 2/3 Audit-local host and guarded Phase 3 core delivery remain the semantic boundary. Phase 3A adds no coordinate, target, force, ring, camera, or physics implementation.

## Scope and remaining boundary

Only Audit files and the Audit graph-input helper changed. The helper's new history option is optional, so the existing current-world query remains the default. No other Signal instrument, Reality acceptance flow, or Hermes contract changed.

Provider-wide automated Hermes refresh is still the existing Phase 3 follow-up. Phase 3A wires the existing Audit ingestion/run pipeline and live projection refresh; it does not invent a new source-ingestion contract.

