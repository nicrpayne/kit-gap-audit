# Reports product model

## Directional contract

```text
canonical owners
  ↓ server-owned assembly
immutable DecisionBriefV1
  ↓ presentation-only BriefRecipeV1
BriefPresentationV1
  ↓ saved together
in-app / Markdown / plain text / print / InteractiveBriefBundleV1
```

`DecisionBriefV1` owns facts and provenance. `BriefRecipeV1` owns audience, purpose, module order/visibility/density, operator note, and explicitly promoted asks. `BriefPresentationV1` deterministically derives labels, supported drivers, commitment absence, asks, and Signal's Read. A saved Report stores snapshot + recipe + presentation version and never rereads owner state.

The flagship is **Delivery Leadership / Weekly Update**. Other audiences are presets over the same truth, not alternate facts.
