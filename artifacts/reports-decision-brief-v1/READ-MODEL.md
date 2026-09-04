# DecisionBriefV1 read model

`DecisionBriefV1` is the only machine-readable report contract. `summaryMarkdown` is a derived export, never the input model.

## Topology

```text
DecisionBriefV1
├── identity
│   ├── project, generatedAt, mode, scenarioId
│   └── sourceSnapshots[]
├── headline
│   ├── targetDate, likelyWindow, confidenceAtTarget
│   ├── movement
│   └── keyReason
├── changes
│   ├── Audit current/prior delta
│   ├── delivery delta
│   └── provider/currentness changes
├── calls
│   ├── first-class open Decisions + optional canonical gate
│   └── declared dependencies
├── movable
│   ├── reconciled Capacity or explicit unavailable state
│   └── existing Forecast-owned scenarios
├── timeline
│   ├── next milestone + conflicts
│   └── LIVE Current Forecast
├── evidence
│   ├── references + grounding/currentness
│   └── provider, weak-grounding and residue warnings
├── boundaries
│   ├── unaccepted Findings → zero baseline work
│   └── Timeline current reading → live Forecast only
└── caveats
```

## Source wrapper

Every material scalar, aggregate or list is a `Sourced<T>`:

```ts
type Sourced<T> = {
  value: T;
  source: {
    owner: TruthOwner;
    asOf: string;
    temporalRole: "live" | "historical";
    currentness: "current" | "stale" | "missing" | "unavailable" | "unreconciled";
    sourceId: string | null;
    note?: string;
  };
};
```

Evidence references additionally carry `grounding: passage | source_only | none` and their own currentness. The renderer displays these stored facts; it does not inspect prose to guess them.

## Assembly and persistence

1. `loadDecisionBriefOwnerInputs()` reads each canonical owner.
2. `assembleDecisionBrief()` performs only reporting-safe joins and comparisons.
3. `generateReport()` renders Markdown from the completed payload and inserts JSON, Markdown, and typed compatibility columns in one create.
4. Historical screen/Markdown/plain-text/print paths read `briefSnapshot`; they never call an upstream owner.
5. A separate live comparison may read current Forecast, but it never mutates or replaces the saved payload.

## Explicit boundaries

- Current calls are filtered from first-class `Decision` rows only.
- An ungated open Decision stores `{ low: 0, likely: 0, high: 0 }` modeled delay.
- A gated Decision uses joined `DecisionGate.targetScope` and the exact stored range.
- Audit Findings may appear in delta/evidence but cannot become baseline Forecast work.
- Named people are emitted only when `capacityContract.reconciles === true` and status is `named_exact`.
- Historical Reports are movement/comparison/memory only.
- No Reports-owned simulation or inferred KIT Construct world exists.
