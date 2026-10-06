/** Stable, source-independent identity for a reviewed create/edit request. */
export function capabilityWriteIntent(operation: "create" | "edit", target: string, input: {
  expectedRevision?: number; name?: string; description?: string | null; status?: string;
  note?: string | null; evidence?: unknown[]; workItemIds?: string[];
}) {
  return JSON.stringify({ operation, target, expectedRevision: input.expectedRevision,
    name: input.name?.trim(), description: input.description === undefined ? undefined : input.description?.trim() || null,
    status: input.status ?? (operation === "create" ? "accepted" : undefined),
    note: input.note === undefined ? undefined : input.note?.trim() || null,
    evidence: input.evidence, workItemIds: [...new Set(input.workItemIds ?? [])].sort(),
  });
}
