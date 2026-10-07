# Dependency security repair — 7 October 2026

This is a bounded dependency repair, not a penetration test or real-project reporting signoff. No accepted project data, staffing, estimates, source snapshots, forecast math, or authentication rules change.

## Package changes

- Next and its lint configuration use the 15.5.27 patch release. No Next 16, Prisma 7, or Tailwind 4 migration.
- Next's pinned PostCSS is overridden to 8.5.29. This stays on PostCSS 8 and removes the old nested copy; the real production build tests integration with Tailwind and Next.
- Prisma remains 6.19.3. Its configuration loader's `deepmerge-ts` is overridden to 8.0.2. Version 8 changes Map merging and fixes circular references; Signal has no custom Prisma config or Map configuration. The actual configuration loader, generation, migrations and database writes are checked, not just an isolated import.
- ExcelJS remains 4.4.0. Its only uuid call is CommonJS `v4()` with no buffer arguments. The override to 11.1.1 retains that API; an extended conditional-formatting workbook exercises it, then the actual spreadsheet API parses dates, merged cells, rich text, formulas, hyperlinks and multiple sheets. Invalid uploads remain 400.
- Patched compatible versions of sharp, nanoid, source-map-js, brace-expansion, browserslist, baseline-browser-mapping and js-yaml are locked. Native image resize/encoding is exercised. PostCSS selector parser is overridden to 7.1.6; nested selectors, prefixed CSS, the production build and browser/PDF output are checked.

## Measured boundary

Before: npm reported 11 production-tree advisories (8 high, 3 moderate); all dependencies reported 23 (17 high, 6 moderate).

After: production-tree audit reports zero; the full installed development/build tree still reports seven high entries, all from the one unpatched `braces` advisory and its dependent packages. **Those seven are triaged, not fixed.** A clean production-tree audit is not a claim that all installed code is vulnerability-free.

The remaining packages are dev-only in the lockfile: braces, micromatch, fast-glob, chokidar, tailwindcss, eslint-config-next and @next/eslint-plugin-next. No application import of these tools, user-supplied glob/config workflow, or braces entry in generated server-route file traces was found. Builds process repository-owned patterns. Do not run builds against untrusted code/configuration. Reassess if a runtime pattern/CSS compilation feature is introduced, a patch becomes available, or any of these dependencies moves into the runtime tree.

`npm run proof:dependencies` fails on any production advisory, any additional advisory outside this exact reviewed chain, or any allowed package no longer marked dev-only. It permits a shrinking set as upstream fixes arrive. It does not silently suppress the residual count.

## Primary references

- [Next patch release](https://github.com/vercel/next.js/releases/tag/v15.5.27)
- [Deepmerge security and compatibility changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)
- [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [PostCSS source-map advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [Unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)

Deployment receipts, audit JSON, database/browser proofs and private screenshots are outside the repository in `../outputs/dependency-repair-2026-10-07/`. Consult their results for actual deployment/verification status; this document alone does not assert promotion or executive signoff.
