# Dependency repair — November 6, 2026

Local lockfile only; not a statement about a deployed build.

- Next.js and its ESLint config move together from 15.5.27 to 15.5.29.
  Published fixes begin at 15.5.28 for the
  [image optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
  and [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r).
- Narrow `@typescript-eslint/typescript-estree` override uses minimatch 11.0.1,
  the [published patched version](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  Because this exceeds the upstream major range, validate the actual ESLint run,
  not only dependency resolution. Remove the override when upstream adopts a fix.
- c8 adds coverage measurement. Its `test-exclude` dependency uses narrow
  overrides for minimatch 11.0.1 and glob 14.0.2, which fixes the
  [glob cancellation advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
  Exercise actual coverage collection and check unexecuted files are included.
- `proof:dependencies` now requires zero known advisories in both production
  and development dependencies. The prior October allowlist is removed, not
  expanded. Audit-service/network failure remains a failure, not a clean result.

An advisory scan is not a security audit of Signal. Operator session expiration,
rate limiting, API authorization, private evidence and concurrency work remain
tracked in [the repair plan](ENGINEERING-QUALITY.md).
