export interface ScenarioItemOwnerScope {
  scopeId: string;
  name?: string;
  itemIds: readonly string[];
}

export type ScenarioItemLeverKind = "excluded" | "included" | "estimate_override";

export interface AmbiguousScenarioItemLever {
  itemId: string;
  kinds: ScenarioItemLeverKind[];
  scopeIds: string[];
  scopeNames: string[];
}

export interface ScenarioItemLeverSelection {
  scopes: readonly ScenarioItemOwnerScope[];
  excludedItemIds: readonly string[];
  includedItemIds: readonly string[];
  estimateOverrideIds: readonly string[];
}

/**
 * Bare work-item ids predate cross-Scope Scenario navigation and carry no
 * owner Scope. They are safe only when the current portfolio resolves each
 * staged id to exactly one Scope. Applying an ambiguous id to every matching
 * Scope silently changes dependency floors, so ambiguity must fail closed;
 * callers may not guess an owner or silently rewrite an old snapshot.
 */
export function findAmbiguousScenarioItemLevers(input: ScenarioItemLeverSelection): AmbiguousScenarioItemLever[] {
  const owners = new Map<string, { scopeId: string; name: string }[]>();
  for (const scope of input.scopes) {
    for (const itemId of new Set(scope.itemIds)) {
      const bucket = owners.get(itemId) ?? [];
      bucket.push({ scopeId: scope.scopeId, name: scope.name ?? scope.scopeId });
      owners.set(itemId, bucket);
    }
  }
  const kindsById = new Map<string, Set<ScenarioItemLeverKind>>();
  const add = (ids: readonly string[], kind: ScenarioItemLeverKind) => {
    for (const itemId of ids) {
      const kinds = kindsById.get(itemId) ?? new Set<ScenarioItemLeverKind>();
      kinds.add(kind);
      kindsById.set(itemId, kinds);
    }
  };
  add(input.excludedItemIds, "excluded");
  add(input.includedItemIds, "included");
  add(input.estimateOverrideIds, "estimate_override");

  return [...kindsById.entries()].flatMap(([itemId, kinds]) => {
    const itemOwners = owners.get(itemId) ?? [];
    if (itemOwners.length <= 1) return [];
    return [{
      itemId,
      kinds: [...kinds].sort(),
      scopeIds: itemOwners.map((owner) => owner.scopeId).sort(),
      scopeNames: itemOwners.map((owner) => owner.name).sort(),
    }];
  }).sort((left, right) => left.itemId.localeCompare(right.itemId));
}

export function ambiguousScenarioItemLeverMessage(ambiguous: readonly AmbiguousScenarioItemLever[]): string {
  return ambiguous.map((item) => `${item.itemId} belongs to multiple projects (${item.scopeNames.join(", ")})`).join("; ");
}
