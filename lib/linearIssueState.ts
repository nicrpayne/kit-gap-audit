/** Terminal execution records are history, never remaining delivery work.
 * Linear duplicate states are canceled outcomes but have their own type. Use
 * provider timestamps as well, without guessing from customizable state names. */
export function isTerminalIssue(issue: {
  stateType?: string;
  completedAt?: string | null;
  canceledAt?: string | null;
}): boolean {
  return !!issue.completedAt || !!issue.canceledAt
    || ["completed", "canceled", "duplicate"].includes(issue.stateType ?? "");
}

/** Completion can establish a Scope mapping without contributing remaining
 * effort. Cancellation/duplication is not delivery, even if an old completed
 * timestamp survives on the provider record. Never infer from display names. */
export function isCompletedIssue(issue: {
  stateType?: string;
  completedAt?: string | null;
  canceledAt?: string | null;
}): boolean {
  return !issue.canceledAt && !["canceled", "duplicate"].includes(issue.stateType ?? "")
    && (!!issue.completedAt || issue.stateType === "completed");
}
