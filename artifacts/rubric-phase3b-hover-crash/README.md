# Phase 3B hover-crash isolation and acceptance

Tested 2026-09-03 against the disposable production-shaped JSA lifecycle world after the real model-backed Audit runs:

- 443 canonical objects
- 548 canonical relationships
- 520 Rubric visual nodes
- 1,609 Rubric visual relationships

No production database or deployment was used.

## Shared hover path

Every pointer movement executes Rubric's single canvas `mousemove` handler, native hit testing across visible nodes, hover assignment, cursor selection, tooltip positioning/content selection, and the continuously running canvas frame. The frame performs key-gated focus rebuilding, relationship wake, node/link drawing, label eligibility, and schedules the next animation frame. Focus rebuilding and its relationship scan run only when the effective drag/hover/selection identity changes. Canonical and presentation identity already live on the projected node; no adapter reconstruction occurs during hover.

Before this fix, every pointer movement also replaced `#brain-tip.innerHTML`. The Phase 2 document-wide observer then replaced that new Rubric tooltip with Signal content and observed its own replacement. The Phase 3 document-wide observer observed both writes. That host feedback path was common to Rings, Circle, Force, and Hex.

## Binary isolation

| Stage | Added behavior | Result |
| --- | --- | --- |
| A | pointer movement, no hit test | PASS, 440 movements |
| B | hit test only | PASS, 445 movements |
| C | hover identity only | PASS, 423 transitions |
| D | native tooltip | PASS with first mutation amplification: 848 observer-visible tooltip records for 424 transitions |
| E | labels | PASS, 445 transitions |
| F | focus computation | PASS, 447 transitions; 719,223 relationship inspections |
| G | relationship wake | PASS, 442 transitions; bounded heap/caches |
| H | Signal host/card bridge | FIRST FAILING RESOURCE STAGE: 445 transitions generated 890 actual tooltip DOM writes (1,780 records as seen by two observers), including the host's self-observed rewrite |
| I | full render/animation | reproduced the same host amplification; no additional listener, RAF, timer, canvas, sprite, or path accumulation |

At browser-rate Stage I before the fix, 1,301 transitions generated 5,204 observer-visible tooltip records and 3,961 MutationObserver callbacks in 30 seconds. Listeners remained 19, active RAF callbacks remained 2, canvases remained 2, and heap was collected from 91.4 MB to 73.6 MB. This ruled out listener/RAF/cache growth and isolated the repeated DOM rewrite/observer feedback path.

## Root fix

The accepted Phase 1 Rubric source files remain byte-identical. The Audit-local Phase 3 generated core now exposes the existing skin as the tooltip content boundary and writes `innerHTML` only when the rendered content actually changes. The Phase 2 host supplies Signal-native tooltip content at that boundary instead of post-patching the DOM. Both document-wide host observers ignore tooltip-only mutations.

After the fix, a 1,259-transition worst-case sweep in which every event selected a different node produced 2,518 observer-visible records: one actual DOM write per identity, seen by two observers. The self-rewrite was eliminated. MutationObserver callbacks fell from 3.04 per transition to 2.05 under that deliberately unbatched workload; the two remaining callbacks return immediately for tooltip-only records. Heap was collected from 81.4 MB to 63.0 MB.

## Full Stage I endurance

Stage I restores tooltip, labels, focus, relationship wake, both Signal hosts, Trace overlay, and normal animation. Each layout ran for 60 seconds with synthetic dense hover, repeated selection/card open-close, pan, zoom, and a preceding layout switch.

| Layout | Hover transitions | Heap initial → end | Listeners | active RAF | canvases | path cache | sprite cache | Console |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Rings | 14,997 | 85.3 → 84.1 MB | 32 → 32 | 2 → 2 | 2 → 2 | 22 → 22 | 22 → 23 (one lazy icon) | clean |
| Circle | 14,993 | 72.1 → 63.1 MB | 32 → 32 | 2 → 2 | 2 → 2 | 23 → 23 | 23 → 23 | clean |
| Force | 14,999 | 88.8 → 76.5 MB | 32 → 32 | 2 → 2 | 2 → 2 | 23 → 23 | 23 → 23 | clean |
| Hex | 15,001 | 80.4 → 68.8 MB | 32 → 32 | 2 → 2 | 2 → 2 | 23 → 23 | 23 → 23 | clean |

The 10/50/100/500-transition checkpoints showed unchanged listener, RAF, canvas, sprite, and path counts. Gradient objects remain transient Rubric focus-link paint resources rather than a retained cache; heap remained bounded and was collected during every run. The denser Circle/Force silhouettes create more identity transitions for the same physical pointer distance, so they reached the shared per-transition feedback path sooner than Rings.

After all telemetry and stage gates were removed, an additional uninstrumented 2,000-transition sweep passed in each of Rings, Circle, Force, and Hex. Signal-native tooltip content and the real selection popup remained present, and the browser console had no warnings or errors.
