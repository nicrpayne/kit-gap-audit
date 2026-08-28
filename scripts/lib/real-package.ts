// THE EXACT BRIDGE-PRODUCED JSA PACKAGE — PRODUCER CONTRACT AUTHORITY.
//
// Read from disk, byte-for-byte, and never reshaped. Every proof and
// measurement that used to run against a census-shaped fixture now runs
// against this.
//
// DELIBERATELY NOT COMMITTED. The package carries real meeting transcript
// excerpts and named individuals; it is the user's own project data, not test
// material, and a repository is the wrong place for it. So it is located by
// path — overridable with REAL_JSA_PACKAGE — and anything that needs it says
// so loudly when it is absent rather than quietly passing without it.

import { existsSync, readFileSync } from "fs";
import type { ProjectContextPackage } from "../../lib/context/package";

export const REAL_PACKAGE_PATH =
  process.env.REAL_JSA_PACKAGE ??
  "/root/.claude/uploads/9fcdcf7a-3546-5894-a0bc-374b41c74833/d43fbbc5-jsastructuredintelligencepackage.postfixrun1.json";

export function hasRealPackage(): boolean {
  return existsSync(REAL_PACKAGE_PATH);
}

/** The file, parsed. Fresh each call, so a mutation in one proof cannot leak
    into the next. */
export function readRealPackage(): ProjectContextPackage {
  return JSON.parse(readFileSync(REAL_PACKAGE_PATH, "utf8")) as ProjectContextPackage;
}

export function realPackageBytes(): number {
  return readFileSync(REAL_PACKAGE_PATH).byteLength;
}

/**
 * The package's own published census, read from the file rather than typed in
 * — so these are facts about the payload, not a second copy of it that can
 * drift. `intelligenceMeta.counts` is the producer's own count block.
 */
export function realCensus() {
  const pkg = readRealPackage();
  const meta = (pkg.intelligenceMeta ?? {}) as Record<string, unknown>;
  const extra = (meta.extra ?? meta) as Record<string, unknown>;
  return {
    pkg,
    counts: (extra.counts ?? {}) as {
      byRelation: Record<string, number>;
      byRelationClass: Record<string, number>;
      byType: Record<string, { total: number; current: number }>;
      evidence: number;
      objects: number;
      objectsCurrent: number;
      objectsHistorical: number;
      relations: number;
      sources: number;
    },
    idCollisionsUpstream: Number(extra.idCollisionsUpstream ?? 0),
  };
}

/** The chain named for the provenance proof, present in this exact file. */
export const REAL_TRACE = {
  object: "hermes:risk-2026-08-24-005",
  evidence: "hermes-ev:2026-08-19_KE-User-Interview-Follow-Up-seg069",
  source: "ke://source/transcript/2026-08-19_KE-User-Interview-Follow-Up",
} as const;
