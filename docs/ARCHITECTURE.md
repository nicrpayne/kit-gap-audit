# Signal code map

This is a navigation guide to the current code, not a claim that every boundary
has already been fully refactored. See [engineering quality](ENGINEERING-QUALITY.md)
for remaining work and release gates.

## Data ownership

1. **Evidence and execution inputs:** `lib/context/`, `lib/audit/`, the bridge
   routes, and `lib/linear.ts` ingest/read source material. A quote's source date,
   retrieval time, and acceptance time have different meanings. A proposal is
   not automatically accepted Reality.
2. **Accepted project state:** `lib/scope/`, `lib/decisions/`, `lib/capacity/`
   and their API routes own explicit edits. Prisma persists canonical records,
   revisions and evidence. Derived reads must reflect the relevant revision.
3. **Simulation:** `lib/forecast/` defines eligible work and the shared model.
   `lib/scenario/` transforms inputs for a what-if without silently accepting
   changes. Effort, elapsed time, date-only targets and target frequencies are
   distinct; views must not calculate alternate interpretations.
4. **Screens:** `components/` render projections. `useProject` loads the shared
   model and currently also owns Scenario workspace/recovery coordination.
   Its framework-neutral payload types live in `lib/project/contracts.ts`.
5. **Reports:** `lib/reports/` freezes report inputs and evidence, validates
   eligibility, produces presentations/exports, and enforces recipient access.
   A saved report describes its captured state, not today's live state.

## Important entry points

| Need | Start here |
| --- | --- |
| What work is counted? | `lib/forecast/workBoundary.ts`, `coverage.ts`, `compute.ts` |
| Why did a Scenario change the model? | `lib/scenario/workItems.ts`, `inputDelta.ts`, `capacityPlan.ts`, `phasedCapacity.ts` |
| Why is a saved draft stale? | `lib/scenario/saved.ts`, `workspaceRecovery.ts`, `lib/instrument/previewLifecycle.ts` |
| What date does a view display? | `lib/time/dateContract.ts`, `lib/forecast/simulate.ts`, `lib/orbit/graph.ts` |
| What was preserved in a report? | `lib/reports/forecastBasis.ts`, `scopeEvidence.ts`, `decisionBrief.ts` |
| Who can read a report? | `lib/reports/sharingHttp.ts` and report-access routes; not the operator session alone |
| Where do malformed requests stop? | `lib/http/json.ts` plus feature parsers; migration across all routes is not yet complete |

## Dependency direction

Shared types and domain rules should not import a React screen or client hook.
Routes and hooks may call domain functions; views may consume their results.
Type-only compatibility exports remain in `useProject` so the first extraction
does not break existing consumers. Runtime Scenario-store extraction is a later,
separately tested change—not part of moving types.

Do not replace explicit owner actions with automatic data corrections during a
cleanup. Do not use the same storage or credentials for local tests and production.
The complete contribution and test commands are in [CONTRIBUTING](../CONTRIBUTING.md).
