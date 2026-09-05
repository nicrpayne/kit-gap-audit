# Test matrix

| Gate | Result | Evidence |
|---|---:|---|
| Production advanced beyond rollback | Pass | `0700dea` descends from `68519f` |
| Merge Train 1/context fix present | Pass | `912ae66` and `43f1cbe` are ancestors |
| Live version marker | Pass | branch `claude/product-timeline-audit-a72dmg`, deployment `3a5da7d6-82b7-4a01-98e6-32c305f09969` |
| Semantic token presence | Pass | 30 required roles |
| Compatibility aliases | Pass | 17 checked; `--i-reality` neutral guard passes |
| No new `--color-*` | Pass | 0 declarations |
| No literal semantic colors in UI | Pass | 0 outside token bridges |
| Embedded/global token parity | Pass | 23/23 exact |
| Core contrast | Pass | all pairs ≥4.5:1; minimum 4.57:1 |
| Shared primitives | Pass | 7/7 exports and semantic contracts |
| Shell selected/focus/disabled | Pass | structural proof plus keyboard visual check |
| Audit spatial fingerprint | Pass | 33 files, 0 changed, identical SHA-256 |
| Audit production-shaped census | Pass | 438/543 |
| Search → Inspector → Trace | Pass | interactive local mirror check |
| Menu/Legend/Search/Inspector family | Pass | interactive local mirror check |
| Hover/observer stability | Pass | 20-point sweep, no browser errors; existing 180-point/ResizeObserver regression extended |
| Reduced motion | Pass | global + iframe rules; browser regression assertion added |
| 200% zoom equivalent | Automated coverage added | browser regression checks touched widgets at 720×450 |
| Control Room route/read-only smoke | Pass with environment note | route and shell render; local data body intentionally fails closed without `DATABASE_URL` |
| TypeScript | Pass | `npx tsc --noEmit` |
| Production build | Pass | `npm run build`; existing lint warnings only |
| Data/schema/Reports/Forecast contracts untouched | Pass | forbidden-path diff empty |

Commands:

```text
npm run proof:visual-system
npx tsc --noEmit
npm run build
```

`scripts/audit-world-widgets-proof.mjs` was extended with semantic token, 32px target, selected+focus, reduced-motion, and 200%-equivalent assertions. The same current-world interactions were exercised in the signed-in in-app browser for this review.
