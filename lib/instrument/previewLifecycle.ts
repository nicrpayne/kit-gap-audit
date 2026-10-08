/** Display selection happens synchronously, before the debounced computation.
 * A cached result is never evidence for a different draft or Reality version. */
export function selectPreviewLifecycle(input: {
  active: boolean;
  basisMatches: boolean;
  hasPreview: boolean;
  hasFailure: boolean;
}): { source: "reality" | "scenario" | "none"; pending: boolean } {
  if (!input.active) return { source: "reality", pending: false };
  if (input.hasFailure) return { source: "none", pending: false };
  if (!input.basisMatches || !input.hasPreview) return { source: "none", pending: true };
  return { source: "scenario", pending: false };
}
