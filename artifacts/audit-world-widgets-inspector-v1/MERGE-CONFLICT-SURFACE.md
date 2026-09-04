# Merge conflict surface

Compared with Truth Contract Hardening SHA `59678655ae5d8941366e0859c9d3dd0952680035` from merge base `edf3dfff8e952ac9c12f0c8151779f0963477292`.

`git merge-tree` reports two files changed on both branches and real conflict markers in both:

1. `components/audit/AuditInstrument.tsx` — **high/manual integration**
   - This branch changes the body from a two-column/bottom-console composition to a full-world host with floating Inspector and review sheet.
   - Truth Hardening changes Audit navigation/context links, Finding action dispatch, review selection state, Trace/review callbacks, and layout/visibility behavior.
   - Resolution law: take Truth Hardening's data/action/context semantics first, then reapply this branch's presentation state and floating composition around those semantics. Do not restore this branch's older dispatch implementation over `reviewActions`.

2. `components/audit/CanvasAuditRenderer.tsx` — **medium/manual integration**
   - This branch wraps layout mechanics in Signal-native collapsible Menu chrome.
   - Truth Hardening expands the layout vocabulary (`rings`, `force`, `circle`, `hex`) and adds hidden-id projection behavior.
   - Resolution law: retain all four Truth branch layouts and `hiddenIds`; apply this branch's Menu/widget styling to the expanded controls. Rubric camera, physics, hit-testing, and layout ownership stay untouched.

No shared truth/data contract file overlaps. The other UX files are Audit-local and disjoint from the Truth branch:

- `components/audit/AuditReviewConsole.tsx`
- `components/audit/AuditWorld.module.css`
- `components/audit/FindingInspector.tsx`
- `components/audit/RealityGlyph.tsx`
- `scripts/audit-world-widgets-proof.mjs`

Recommended integration order: Truth Contract Hardening first, then this UX branch with the two resolutions above, then rerun both branches' proof suites.

