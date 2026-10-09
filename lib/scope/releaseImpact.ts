import type { Feature } from "./features";

/** Reuse the feature's modeled basis, including reviewed remaining effort and
 * additional tickets. Re-summing raw tickets would revive replaced estimates. */
export function capabilityReleaseLoadDelta(feature: Feature | undefined, status: "accepted" | "outside"): number | null {
  if (!feature || !Number.isFinite(feature.loadDays)) return null;
  return (status === "outside" ? -1 : 1) * feature.loadDays;
}
