/** Planning membership is deliberately separate from accepted product shape.
 * Pass executable leaves from the FULL owner read, before filtering by Scope;
 * otherwise removing a child can accidentally resurrect its grouping parent. */
export const CURRENT_WORK_POLICY = "eligible-current-work.v1" as const;

export function currentWorkBoundary(issueIds: readonly string[], capabilities: readonly {
  status: string;
  workLinks: readonly { externalId: string; state: string }[];
}[]) {
  const ids = [...new Set(issueIds)];
  const linked = (status: boolean) => new Set(capabilities
    .filter(card => (card.status === "accepted") === status)
    .flatMap(card => card.workLinks.filter(link => link.state === "active" || link.state === "configured").map(link => link.externalId)));
  const accepted = linked(true);
  const outside = linked(false);
  // Explicit deferral wins if conflicting links exist. Do not silently add
  // deferred work: the conflicting ownership remains a review requirement.
  return {
    includedIds: ids.filter(id => !outside.has(id)),
    ungroupedIds: ids.filter(id => !outside.has(id) && !accepted.has(id)),
    outsideIds: ids.filter(id => outside.has(id)),
    conflictingIds: ids.filter(id => outside.has(id) && accepted.has(id)),
  };
}
