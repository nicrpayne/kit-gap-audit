# Release risks and recommendation

## P0

None found.

## P1

- Dependency-security disposition before deployment: the unchanged production lockfile currently reports 9 high and 2 moderate advisories. These were not introduced by Merge Train 1, and the tested feature paths passed, but a security owner should confirm exposure/mitigation or approve carrying the existing baseline risk.

## P2

- Existing lint debt: 44 warnings, 0 errors.
- Browser-proof reproducibility: Playwright is imported by repository proof scripts but is not declared in the package manifest; this run used a temporary local install and then restored the lockfile graph.
- Production data caveats remain explicit: no named Capacity for some live projects and no canonical KIT Construct world.
- Visual-system token/material convergence and the final Reality glyph remain deferred by design.

## Deferred design surface

Later `signal-visual-system-v1` implementation may replace shared tokens, shell/chrome, widget/Inspector/Search/Legend/Menu material, typography and semantic interaction color while preserving Audit spatial authority and Reports truth/recipe contracts.

Later Reality Glyph work may change only the explicitly owned center-glyph boundary after a separate decision. This candidate preserves the current production center identity and adds no competing glyph.

## Promotion recommendation

Ready for production review. Do not auto-promote. Before deployment, require:

1. human review of the two additive Reports migrations and rollback/backup plan;
2. security disposition of the inherited dependency advisories;
3. a staging canary using a production-shaped database copy;
4. authenticated smoke of Audit, Reports generation/history/print and the eight non-Reports routes;
5. confirmation that no Visual System or Reality Glyph branch is included in the promotion diff.
