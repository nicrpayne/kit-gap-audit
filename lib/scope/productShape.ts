export type CapabilityExecutionState =
  | "mapped"
  | "unmapped"
  | "source_unavailable"
  | "source_not_configured"
  | "mapping_stale";

export interface ShapeCapability {
  id: string;
  name: string;
  description: string | null;
  status: string;
  workLinks: { id: string; provider: string; externalId: string; externalUrl: string | null; state: string }[];
}

export function capabilityExecutionState(
  capability: Pick<ShapeCapability, "workLinks">,
  scopeExecutionState: string,
): CapabilityExecutionState {
  if (scopeExecutionState === "unavailable") return "source_unavailable";
  if (scopeExecutionState === "not_configured") return "source_not_configured";
  if (scopeExecutionState === "stale") return "mapping_stale";
  if (capability.workLinks.some((link) => link.state === "configured" || link.state === "active")) return "mapped";
  return "unmapped";
}

export function partitionProductShape(capabilities: ShapeCapability[]) {
  return {
    accepted: capabilities.filter((capability) => capability.status === "accepted"),
    outsideRelease: capabilities.filter((capability) => capability.status !== "accepted"),
  };
}

export function executionStateLabel(state: CapabilityExecutionState): string {
  switch (state) {
    case "mapped": return "Mapped to execution work";
    case "unmapped": return "No execution work mapped";
    case "source_unavailable": return "Execution source unavailable";
    case "source_not_configured": return "Execution source not configured";
    case "mapping_stale": return "Execution mapping stale";
  }
}
