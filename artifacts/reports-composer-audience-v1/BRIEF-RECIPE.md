# BriefRecipeV1

```ts
interface BriefRecipeV1 {
  version: "brief-recipe.v1";
  type: "audience-brief";
  audience: AudienceLens;
  purpose: BriefPurpose;
  mode: "reality" | "scenario";
  compareTo: string | null;
  modules: { id: BriefModuleId; density: "headline" | "compact" | "expanded" }[];
  density: "headline" | "compact" | "expanded";
  operatorNote: string | null;
  promotedAskIds: string[];
}
```

Normalization is server-owned. It removes duplicate modules, rejects unknown modules/densities, forces the recipe mode and comparison reference to match the frozen brief, limits notes to 2,000 characters, and retains promoted asks only when they identify a first-class open Decision in that brief.

Allowed effects: show/hide, reorder, density, audience/purpose label, clearly marked operator note, and explicit ask promotion.

Forbidden effects: changing facts, changing owner/as-of metadata, relabeling Reality as Scenario, introducing a commitment, creating a gate, changing simulation inputs, inferring new decisions, or fetching data inside a module.
