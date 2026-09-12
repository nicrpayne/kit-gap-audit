# Signal at a Glance

Signal turns knowledge into governed delivery truth, then turns that truth into consequences and communication.

```mermaid
flowchart LR
  subgraph K[KNOWLEDGE]
    SRC[Meetings · correspondence · sources]
    KE[KE / wiki]
    H[Hermes]
    SRC --> KE --> H
  end
  subgraph A[AUDIT]
    F[Freshness check]
    C[Changes since last Audit]
    H --> F --> C
  end
  subgraph G[GOVERN]
    S[Scope]
    D[Decisions]
    DEP[Dependencies]
    CAP[Capacity]
    TL[Timeline]
    C -->|human accepts owner-specific change| S
    C -->|human accepts owner-specific change| D
    C -->|human completes endpoints| DEP
    C -->|human confirms roster| CAP
    C -->|human accepts milestone| TL
  end
  subgraph M[MODEL]
    SC[Disposable Scenario]
    S --> SC
    D --> SC
    DEP --> SC
    CAP --> SC
  end
  subgraph O[FORECAST]
    FC[Coverage contract]
    OUT[Likely window · target confidence · consequences]
    SC --> FC --> OUT
  end
  subgraph COM[COMMUNICATE]
    CR[Control Room]
    R[Immutable Reports]
    SITE[Interactive Site handoff]
    OUT --> CR --> R --> SITE
    TL --> CR
  end
```

## Read the arrows

- Knowledge is upstream context, not Reality.
- Audit discovers disagreement and proposes; it does not own product shape, choices, topology, people, or time.
- The governance boundary is the only place new canonical truth enters.
- Scenario is cheap and reversible. Reality is deliberate.
- Forecast is automatic but only as strong as its coverage contract.
- Control Room owns no facts. Reports freeze a point-in-time story. Site handoff is explicit and user-mediated.

The printable annotated asset is `screenshots/annotated/00-signal-at-a-glance.svg`.

