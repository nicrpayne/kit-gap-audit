# Signal Reports — DecisionBriefV1

## Build identity

- Accepted base: `codex/truth-contract-hardening-1` at `59678655ae5d8941366e0859c9d3dd0952680035`
- Isolated branch: `codex/reports-decision-brief-v1`
- Production writes/deploys: none
- Protected Monte Carlo files changed: none
- Protected Rubric runtime files changed: none

## Result

Reports is now a downstream communication instrument with one server-owned `DecisionBriefV1` read model. It assembles canonical owner reads, saves that exact model as versioned JSON, and renders the screen, Markdown, plain text, and browser-print views from the immutable payload.

The brief contains:

1. As-of / trust
2. Headline
3. What changed
4. What needs a call
5. What can move
6. Timeline
7. Evidence / provenance / data quality
8. Caveats / missing decision inputs

## Architectural boundary

Reports owns wording, arrangement, export, and immutable history. It does not own Forecast dates, Audit Findings, Decisions, gates, dependencies, Scope, Capacity, Timeline events, source policy, or evidence. Each material value is paired with canonical owner, as-of time, temporal role, currentness, and source identity. Renderers do not infer those fields from prose.

## Main implementation

- `lib/reports/decisionBrief.ts` — versioned serializable contract and pure assembler
- `lib/reports/readModel.ts` — server-owned canonical owner reads
- `lib/reports/generate.ts` — single immutable persistence boundary
- `lib/reports/decisionBriefRender.ts` — Markdown/plain-text renderers and payload fingerprint
- `components/DecisionBriefView.tsx` — in-app and print presentation of the saved payload
- `app/reports/[reportId]/print/page.tsx` — snapshot-only browser-print route
- `scripts/reports-decision-brief-proof.tsx` — deterministic contract/reconciliation suite

## Verification

Run:

```bash
npx tsx scripts/reports-decision-brief-proof.tsx
npx tsc --noEmit
npm run lint -- --max-warnings=9999
npm run build
```

Visual proof is captured from deterministic local-only fixture routes, which return 404 in production.

## Artifact index

- `READ-MODEL.md` — conceptual and serialized shape
- `UPSTREAM-CONTRACTS.md` — owner → field → staleness/provenance law
- `LEGACY-REUSE-RETIRE.md` — retained and retired Reports paths
- `TEST-MATRIX.md` — deterministic fixture and acceptance coverage
- `PIVOT-BRIEF.md` — honest JSA → KIT Construct prototype status
- `samples/` — Markdown examples from the V1 payload contract
- `screenshots/` — in-app and print visual evidence
