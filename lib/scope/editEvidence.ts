/** Editing work links or release state is not a new source acceptance. Keep
 * the original receipt verbatim; explicitly supplied references are additive.
 * The edit's note and actor belong to its CapabilityEvent, not to the source. */
export function appendCapabilityEditEvidence(provenance: unknown, additions?: unknown[]): unknown {
  if (!additions?.length) return provenance;
  const original = provenance && typeof provenance === "object" && !Array.isArray(provenance)
    ? provenance as Record<string, unknown> : {};
  const existing = Array.isArray(original.operatorEvidence) ? original.operatorEvidence : [];
  const seen = new Set(existing.map((entry) => JSON.stringify(entry)));
  const newReferences = additions.filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!newReferences.length) return provenance;
  return { ...original, operatorEvidence: [...existing, ...newReferences] };
}
