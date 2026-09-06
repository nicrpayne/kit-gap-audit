# Prototype evidence

Browser-verified captures from the build-excluded prototype:

| Screen | Evidence |
| --- | --- |
| A — Add Project | `01-add-project.jpg`, `01b-add-project-form.jpg` |
| B — Knowledge scan | `02-knowledge-scan.jpg` |
| C — Bootstrap Review | `03-bootstrap-review.jpg` |
| D — Proposed Scope | `04-proposed-scope.jpg` |
| E — Ready to Activate | `05-ready-to-activate.jpg` |
| F — First Audit handoff | `06-first-audit.jpg` |
| G — Search V2 | `07-search-v2.jpg` |

Captured at the browser’s normal viewport after exercising the primary flow. A separate 1440×1000 QA pass verified layout at the target desktop size before returning the browser to its normal viewport. Browser console warnings/errors: none.

Verified interactions:

- Add form submits to scan.
- Scan continues to review.
- Candidate Accept changes its review disposition without leaving the workspace.
- Rail navigation reaches every A–G screen.
- Activate reaches the first-Audit handoff.
- Search preserves the semantic-match reason and the explicit “not confidence or truth” boundary.

