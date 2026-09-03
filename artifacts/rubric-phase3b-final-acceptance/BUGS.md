# Bugs and gaps

## P0

None.

## P1

None known after acceptance fixes.

Fixed during this resumed acceptance:

1. Canonical selection was lost when a governed write changed a Finding's presentation role.
2. A Trace stayed visible when Search selected an unrelated object.
3. Search-selected Attention echoes lacked the Trace path already owned by their canonical object.

## P2

1. **Project Overview is incomplete as a stats surface.** Current/prior cards and Finding counts exist, but canonical category/source/grounding metrics and click-through are absent.
2. **Circle and Hex label collision at 438 objects.** No object disappears, but central category and provider labels overlap substantially at Fit.
3. **Source anchor popup repeats its count line.** The truthful `linked objects · artifacts · passages · claims` text appears in both native description and Phase 3 semantic line.
4. **Long popup titles wrap awkwardly.** Narrow cards can split the final word across lines.
5. **Hide undo is not discoverable.** Hide is presentation-only and a reload restores it, but Rubric's native Restore control lives in a tuning section hidden by the Signal skin.
6. **Legacy test debt.** `audit-interaction-proof.ts` reports 2/92 legacy spatial anchors beyond its one-hop rule. That proof exercises the retired Signal viewport, not the mounted Rubric Audit World; the product's canonical popup navigation passed.
7. **Production-shaped data quality.** Decision `Test` and gate `This is a test connection` remain canonical test residue pending approved cleanup.

Production build warnings are pre-existing unused-variable warnings outside the Phase 3B Audit changes. The tested production browser had zero console warnings/errors.

