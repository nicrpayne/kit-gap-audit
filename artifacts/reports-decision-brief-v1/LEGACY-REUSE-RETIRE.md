# Legacy Reports — reuse and retirement

## Reused

- `/reports` as the single Reports instrument and route.
- URL-owned project selection and the shared context-preserving link contract.
- Immutable `Report` history and typed Forecast columns used by Timeline/Momentum.
- Snapshot provenance banner and separate current-live comparison.
- Existing Momentum helpers, preserving report-cadence-memory semantics.
- Existing legacy Markdown viewer for old rows.
- Existing explicit manual generation action.

## Replaced for new briefs

- `lib/reports/generate.ts` no longer derives current decisions from `Finding.type === "decision"`.
- The old Forecast + shipped + Finding-category body is replaced by DecisionBriefV1’s eight sections.
- `summaryMarkdown` is no longer the only machine-readable report artifact; it is derived from `briefSnapshot`.
- Generic “blocking findings” are not presented as first-class current Decisions.
- The old single “best scenario” prose is replaced by the full set of existing Forecast-owned scenario results, each labeled as scenario output.

## Preserved as legacy, not migrated

Existing rows retain null `briefVersion`, `briefSnapshot`, `mode`, and `scenarioSnapshot`. Their `summaryMarkdown` remains byte-for-byte historical content. The Reports UI and print route label them `Legacy immutable report` and render exactly what was stored. No old row is rewritten or semantically promoted.

## Information-loss comparison

Useful legacy information remains available:

- likely/earliest/latest dates and confidence remain typed Report columns;
- shipped/blocking/resolved counts remain typed historical memory;
- original Markdown remains readable and copyable;
- Momentum and Timeline continue to consume historical typed columns.

The retired current-generation logic’s only unique category was a list of legacy `Finding.type === "decision"` observations. Those Findings remain in Audit history/evidence and are not deleted. They are intentionally absent from “What needs a call” until governed promotion creates a first-class Decision.
