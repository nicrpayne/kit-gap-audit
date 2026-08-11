// Deterministic hash of an accepted ProjectContextPackage. Same convention
// as lib/estimate/context.ts's existing contextHash (sha256, truncated) --
// reused rather than reinvented.

import { createHash } from "crypto";
import type { ProjectContextPackage } from "./package";

// Recursively sorts object keys so two packages with identical content but
// different key insertion order hash identically. Arrays keep their order
// (order is meaningful for sources/evidence/derivedClaims).
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function hashProjectContextPackage(pkg: ProjectContextPackage): string {
  const canonical = JSON.stringify(canonicalize(pkg));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
