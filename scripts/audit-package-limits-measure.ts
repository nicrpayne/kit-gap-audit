// WHAT THE PACKAGE LIMITS SHOULD BE, MEASURED RATHER THAN GUESSED.
//
// The existing caps were chosen before any real structured package existed.
// The real post-fix JSA package now sits at 47/50 sources — 94% of a contract
// limit on an ordinary project — and upstream source growth is roughly +6.4
// artifacts per ingestion batch, so the NEXT normal ingestion breaks it.
//
//   LIMITS SHOULD PROTECT SIGNAL FROM PATHOLOGICAL INPUT,
//   NOT CONSTRAIN NORMAL PROJECT GROWTH.
//
// This measures the four costs that a limit is actually protecting — validate,
// hash, persist, project — at the real size and at candidate new ceilings, so
// the numbers below are the reason for the numbers chosen.
//
//   npx tsx scripts/audit-package-limits-measure.ts

import { validateProjectContextPackage } from "../lib/context/validate";
import { hashProjectContextPackage } from "../lib/context/hash";
import { buildIntelligenceFixturePackage, REAL_JSA } from "./lib/intel-fixture";
import { projectIntelligence } from "../lib/audit/intelligence";
import type { ProjectContextPackage, EvidenceItem, IntelligenceObjectItem, IntelligenceRelationItem, PackageSourceManifestEntry } from "../lib/context/package";

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const ms = (n: number) => `${n.toFixed(1)}ms`;

function time<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const v = fn();
  return [v, performance.now() - t0];
}

/** Scale the real package up to a target census, keeping its shape. */
function scaleTo(
  base: ProjectContextPackage,
  target: { sources: number; evidence: number; objects: number; relations: number }
): ProjectContextPackage {
  const grow = <T,>(src: T[], n: number, clone: (item: T, i: number) => T): T[] => {
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(clone(src[i % src.length], i));
    return out;
  };
  const sources = grow(base.sources, target.sources, (s, i) => ({
    ...s,
    sourceRef: `${s.sourceRef}#scaled-${i}`,
  })) as PackageSourceManifestEntry[];
  const evidence = grow(base.evidence, target.evidence, (e, i) => ({
    ...e,
    id: `${e.id}#scaled-${i}`,
    sourceRef: sources[i % sources.length].sourceRef,
  })) as EvidenceItem[];
  const evidenceIds = evidence.map((e) => e.id);
  const objects = grow(base.intelligenceObjects!, target.objects, (o, i) => ({
    ...o,
    id: `${o.id}#scaled-${i}`,
    evidenceRefs: (o.evidenceRefs ?? []).map((_r, j) => evidenceIds[(i * 3 + j) % evidenceIds.length]),
  })) as IntelligenceObjectItem[];
  const objectIds = objects.map((o) => o.id);
  const relations = grow(base.intelligenceRelations!, target.relations, (r, i) => {
    const raw = r as unknown as Record<string, unknown>;
    return {
      ...raw,
      sourceId: objectIds[i % objectIds.length],
      targetId: objectIds[(i * 7 + 3) % objectIds.length],
    } as unknown as IntelligenceRelationItem;
  });
  return { ...base, packageId: `scaled-${target.sources}-${target.evidence}`, sources, evidence, intelligenceObjects: objects, intelligenceRelations: relations };
}

function measure(label: string, pkg: ProjectContextPackage) {
  const json = JSON.stringify(pkg);
  const bytes = Buffer.byteLength(json, "utf8");
  const [accepted, validateMs] = time(() => validateProjectContextPackage(JSON.parse(json)));
  const [hash, hashMs] = time(() => hashProjectContextPackage(accepted));
  const [projected, projectMs] = time(() =>
    projectIntelligence([{ id: "snap", scopeId: "jsa", package: accepted }], "jsa")
  );
  console.log(
    `${label.padEnd(34)} ${kb(bytes).padStart(9)}  validate ${ms(validateMs).padStart(8)}  ` +
      `hash ${ms(hashMs).padStart(8)}  project ${ms(projectMs).padStart(8)}  ` +
      `→ ${projected.objects.length} objects, ${projected.relations.length} relations, hash ${hash.slice(0, 8)}`
  );
  return { bytes, validateMs, hashMs, projectMs };
}

const real = buildIntelligenceFixturePackage("jsa");

console.log("\n── THE REAL PACKAGE ─────────────────────────────────────────");
console.log(
  `sources ${real.sources.length} · evidence ${real.evidence.length} · ` +
    `objects ${real.intelligenceObjects!.length} · relations ${real.intelligenceRelations!.length}`
);
const realCost = measure("real JSA (post-fix)", real);

console.log("\n── AT THE CANDIDATE CEILINGS ────────────────────────────────");
// Warm the JIT so the ceiling numbers are not the first-run ones.
measure("(warm-up)", scaleTo(real, { sources: 100, evidence: 500, objects: 300, relations: 1000 }));
measure("the prompt's starting points", scaleTo(real, { sources: 250, evidence: 2000, objects: 1000, relations: 5000 }));
const candidate = measure("new ceiling, fully saturated", scaleTo(real, {
  sources: 250,
  evidence: 2000,
  objects: 2000,
  relations: 20000,
}));
// AND THE GUARD BITES. A package at twice every ceiling is rejected by the
// FIRST limit it exceeds, naming the field — which is what a guard is for.
const oversized = scaleTo(real, { sources: 500, evidence: 4000, objects: 4000, relations: 40000 });
const oversizedBytes = Buffer.byteLength(JSON.stringify(oversized), "utf8");
let rejection = "NOT REJECTED — this is a problem";
const [, rejectMs] = time(() => {
  try {
    validateProjectContextPackage(JSON.parse(JSON.stringify(oversized)));
  } catch (e) {
    rejection = e instanceof Error ? e.message : String(e);
  }
});
console.log(
  `${"2x every ceiling".padEnd(34)} ${kb(oversizedBytes).padStart(9)}  rejected in ${ms(rejectMs).padStart(8)}  → ${rejection.slice(0, 70)}`
);
const doubled = { bytes: oversizedBytes, validateMs: rejectMs, hashMs: 0, projectMs: 0 };

console.log("\n── HEADROOM ─────────────────────────────────────────────────");
const perBatch = 6.4;
const batchesToCap = (cap: number, now: number) => ((cap - now) / perBatch).toFixed(0);
console.log(`source growth measured upstream: +${perBatch} artifacts per ingestion batch`);
console.log(`  sources 47 → old cap 50: ${batchesToCap(50, 47)} batches of headroom  (94% full TODAY)`);
console.log(`  sources 47 → new cap 250: ${batchesToCap(250, 47)} batches of headroom`);
console.log(
  `\ncost at the saturated candidate ceiling: ${kb(candidate.bytes)}, ` +
    `${ms(candidate.validateMs + candidate.hashMs)} to validate and hash`
);
console.log(
  `at DOUBLE that ceiling (${kb(doubled.bytes)}) the guard bites in ${ms(doubled.validateMs)} ` +
    `and names the field — rejected, never truncated`
);
console.log(
  `\nreal package is ${(realCost.bytes / candidate.bytes * 100).toFixed(1)}% of the saturated ceiling's weight`
);
