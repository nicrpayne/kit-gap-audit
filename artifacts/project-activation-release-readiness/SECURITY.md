# Real bridge security proof

## Boundary and transport

The bridge reads the corpus only in its local process. Package locators use stable `ke://` canonical references plus source-relative offsets; absolute local paths fail validation. Signal/Railway receives no `ke-root` value and assumes no access to a local mount.

Live bridge calls use `Authorization: Bearer <APP_PASSWORD>`. The secret is read from the process environment. Bridge tests prove it appears in the request header only and is absent from the package body. The local receipt records only `authenticated: true`; it does not record the token.

## Fail-closed results

| Check | Result |
|---|---|
| Unauthenticated package POST | `401` |
| Empty/malformed schema | `400` |
| Unsupported package version `2.0` | `400` |
| Secret-shaped `apiKey` field in package | `400` |
| Package above 5,000,000 bytes | `413` |
| Absolute local locator path | Rejected by bridge contract validation |
| Geometry or Forecast output in package | Rejected by bridge contract validation |
| Non-current intelligence head | Rejected by bridge contract validation |
| Untyped dependency proposal | Rejected by bridge contract validation |

After all negative HTTP tests, Signal still contained exactly one scan and one package at review revision 1. No malformed attempt created partial package, scan, or review state.

## Data minimization and provenance

The package contains bounded exact quotes, hashes, source-relative locators, lineage roots, structured current heads, and proposals. A fixture-only raw-corpus sentinel was absent from the serialized package, proving source bodies are not copied wholesale. Derivative wiki passages share their source lineage and are explicitly marked derivative, so they do not inflate independent corroboration.

The package compiler is deterministic and content-addressed. Posting an identical package returns the original scan. A repeated live CLI invocation produced `reused: true`, the same scan ID, one package row, one scan row, and no duplicate refresh audit.
