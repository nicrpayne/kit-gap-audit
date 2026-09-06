# Prototype evidence

Browser-verified captures from the build-excluded prototype:

| Screen | Evidence |
| --- | --- |
| Compact Add Project sheet | `01-compact-add-project.jpg` |
| Asynchronous scan | `02-scan-progress.jpg` |
| Primary Bootstrap Review | `03-bootstrap-review.jpg` |
| Activation / ready summary | `04-activation-summary.jpg` |
| First Audit handoff | `05-first-audit.jpg` |
| Global Search V2 | `06-global-search-v2.jpg` |

Captured at the browser’s normal 1280×720 viewport after exercising the primary flow. Browser console warnings/errors: none.

Verified interactions:

- Project control opens the compact Add Project sheet; Create & scan submits directly to scan.
- Scan exposes provider/artifact/intelligence/evidence/proposal status and permits safe partial Review entry.
- Candidate Accept changes its review disposition without leaving the workspace.
- Proposed Scope remains a Review section rather than a separate stage.
- `ACTIVATE PROJECT` reaches the first-Audit handoff.
- Global Search is outside activation and preserves match reasons, lineage drilldown, and the explicit “similarity is not confidence” boundary.
