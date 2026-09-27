/** Describe proposal-target matching separately from existing ticket ownership. */
export function proposalRealityDescription(input: {
  target: { name: string; status: string; revision: number } | null | undefined;
  otherOwnerNames: string[];
  hasKnowledge: boolean;
}): { heading: string; detail: string } {
  if (input.target) return {
    heading: input.target.name,
    detail: `${input.target.status} · revision ${input.target.revision}`,
  };
  if (input.otherOwnerNames.length) return {
    heading: "No accepted target for this proposal",
    detail: `Matched work already has accepted links to ${[...new Set(input.otherOwnerNames)].join(", ")}. Those links remain unchanged; only unowned work is available to this proposal.`,
  };
  return {
    heading: "No accepted target for this proposal",
    detail: input.hasKnowledge
      ? "Knowledge is proposing a new boundary; Reality remains unchanged."
      : "Unowned Linear work is awaiting operator classification; Reality remains unchanged.",
  };
}
