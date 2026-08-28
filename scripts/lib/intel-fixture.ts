// A JSA-SHAPED INTELLIGENCE PAYLOAD, AT THE REAL STATED SCALE.
//
// SYNTHETIC, AND LABELLED AS SUCH EVERYWHERE IT LANDS. The producer side is
// implemented and proven upstream, but the bridge output is not reachable
// from this environment — so density, hairball and performance claims would
// otherwise be guesses about a graph nobody has built.
//
// The COUNTS are the real ones supplied for the JSA payload:
//
//   47 sources · 175 evidence items · 161 objects (155 head, 6 historical)
//   87 object→object relations · 207 object→evidence links
//
// Content is generated; shape and volume are not. The proof that uses this
// checks every total against JSA_SCALE, so a fixture that quietly drifts
// from the stated scale fails rather than flattering the measurements.
//
// ONE HONEST DISCREPANCY: the class mix was given as "approximately"
// 6 temporal / 9 semantic / 68 contextual, which totals 83 rather than 87.
// The fixture uses 6 / 9 / 72 so the classes sum to the stated relation
// total. The visual policy depends on the contextual share being dominant,
// which holds either way.
//
// NOT used by the app, NOT seeded into production, and every statement it
// emits is prefixed so it can never be mistaken for real intelligence.

import {
  EXTERNAL_INTELLIGENCE_TRUST,
  type ProjectContextPackage,
  type IntelligenceObjectItem,
  type IntelligenceRelationItem,
  type EvidenceItem,
  type PackageSourceManifestEntry,
  type JsonValue,
} from "@/lib/context/package";

export const JSA_SCALE = {
  sources: 47,
  evidence: 175,
  objects: 161,
  currentObjects: 155,
  historicalObjects: 6,
  relations: 87,
  temporal: 6,
  semantic: 9,
  contextual: 72,
  objectEvidenceLinks: 207,
} as const;

const TYPES = [
  "Observation",
  "Commitment",
  "Unknown",
  "Risk",
  "Decision",
  "ClimateEvidence",
  "Dependency",
  "AvailabilityObservation",
] as const;

const SOURCE_TYPES = ["transcript", "notion", "figma", "notes"];

/** Deterministic, so two runs measure the same graph. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The type-shaped payload a producer would carry. Typed as the transport's
    own open record so the fixture cannot drift from the contract. */
function fieldsFor(t: (typeof TYPES)[number]): Record<string, JsonValue> {
  switch (t) {
    case "Commitment":
      return { owner: "[synthetic] owner", action: "[synthetic] action" };
    case "Unknown":
      return { question: "[synthetic] open question" };
    case "Dependency":
      return { dependent: "[synthetic] A", dependency: "[synthetic] B" };
    case "AvailabilityObservation":
      return { person: "[synthetic] person", state: "reduced" };
    default:
      return {};
  }
}

export function buildIntelligenceFixturePackage(scopeId = "jsa"): ProjectContextPackage {
  const rnd = mulberry(20260828);

  const sources: PackageSourceManifestEntry[] = Array.from({ length: JSA_SCALE.sources }, (_, i) => {
    const sourceType = SOURCE_TYPES[i % SOURCE_TYPES.length];
    return {
      sourceType,
      sourceRef: `[synthetic] ${sourceType} ${String(i + 1).padStart(2, "0")}`,
      registrationId: null,
      role: sourceType === "notion" ? "requirements_of_record" : "raw_evidence",
      status: "candidate",
      observedAt: new Date(Date.UTC(2026, 6, 1 + (i % 40))).toISOString(),
      succeeded: true,
      detail: null,
    };
  });

  const evidence: EvidenceItem[] = Array.from({ length: JSA_SCALE.evidence }, (_, i) => ({
    id: `ev-${String(i + 1).padStart(3, "0")}`,
    sourceRef: sources[i % sources.length].sourceRef,
    kind: "note",
    excerpt: `[synthetic] evidence passage ${i + 1} — offline capture, ownership and access came up again.`,
    externalRef: `synthetic-ref-${i + 1}`,
  }));

  const objects: IntelligenceObjectItem[] = Array.from({ length: JSA_SCALE.objects }, (_, i) => {
    const t = TYPES[i % TYPES.length];
    const isCurrent = i >= JSA_SCALE.historicalObjects;
    return {
      id: `KE-${t.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
      intelligenceType: t,
      trust: EXTERNAL_INTELLIGENCE_TRUST,
      statement: `[synthetic] ${t} ${i + 1}: offline conflict resolution and access sign-off remain unsettled.`,
      statementBasis: "normalised_from_type_fields",
      // A DELIBERATE COUNTEREXAMPLE. The first six are non-head, and two of
      // them are still `open`. Anything deriving currentness from status
      // gets those wrong, and a proof checks exactly that pair.
      status: i % 3 === 0 ? "open" : i % 3 === 1 ? "resolved" : "accepted",
      isCurrent,
      observedDate: new Date(Date.UTC(2026, 5, 1 + (i % 80))).toISOString(),
      dates: (t === "Commitment"
        ? { due: new Date(Date.UTC(2026, 8, 15)).toISOString() }
        : {}) as Record<string, JsonValue>,
      scope: ["jsa"],
      evidenceRefs: [],
      fields: fieldsFor(t),
      provenance: {
        canonicalId: `ke/objects/${t.toLowerCase()}/${i + 1}`,
        batchId: "synthetic-batch-001",
        evidenceIndependence: (i % 4) + 1,
      },
    };
  });

  // ── OBJECT → EVIDENCE, to the exact stated total ────────────────────
  let links = 0;
  let guard = 0;
  while (links < JSA_SCALE.objectEvidenceLinks && guard < 100000) {
    guard++;
    const o = objects[links % objects.length];
    const ref = evidence[Math.floor(rnd() * evidence.length)].id;
    const refs = o.evidenceRefs!;
    if (refs.includes(ref)) continue;
    refs.push(ref);
    links++;
  }

  // ── OBJECT → OBJECT, in the stated class mix ────────────────────────
  const relations: IntelligenceRelationItem[] = [];
  const byId = new Set(objects.map((o) => o.id));
  const push = (from: string, rel: string, to: string, relClass: string) =>
    relations.push({
      from,
      rel,
      to,
      relClass,
      fromInPackage: byId.has(from),
      toInPackage: byId.has(to),
      declared: { raw: rel },
    });

  // TEMPORAL — a real chain shape: C supersedes B supersedes A, refined by
  // D, plus an Unknown resolved by a Decision. The historical objects are
  // the far ends, which is why they were transported at all.
  const decisions = objects.filter((o) => o.intelligenceType === "Decision");
  const unknowns = objects.filter((o) => o.intelligenceType === "Unknown");
  push(decisions[1].id, "supersedes", objects[4].id, "temporal");
  push(decisions[2].id, "supersedes", decisions[1].id, "temporal");
  push(decisions[3].id, "refines", decisions[2].id, "temporal");
  push(decisions[4].id, "resolves", unknowns[0].id, "temporal");
  push(decisions[5].id, "reopens", objects[0].id, "temporal");
  push(objects[3].id, "supersedes", objects[1].id, "temporal");

  // SEMANTIC
  const risks = objects.filter((o) => o.intelligenceType === "Risk");
  const deps = objects.filter((o) => o.intelligenceType === "Dependency");
  for (let i = 0; i < 5; i++) push(deps[i].id, "depends_on", objects[(i * 7 + 20) % objects.length].id, "semantic");
  for (let i = 0; i < 3; i++) push(risks[i].id, "caused_by", objects[(i * 11 + 30) % objects.length].id, "semantic");
  push(risks[3].id, "contradicts", decisions[0].id, "semantic");

  // CONTEXTUAL — the bulk, and the reason default-hidden exists.
  for (let i = 0; relations.length < JSA_SCALE.relations; i++) {
    const a = objects[(i * 3) % objects.length];
    const b = objects[(i * 5 + 13) % objects.length];
    if (a.id === b.id) continue;
    push(a.id, "related_to", b.id, "contextual");
  }

  return {
    version: "1.0",
    packageId: `synthetic-intel-${scopeId}-001`,
    producer: "manual",
    generatedAt: new Date(Date.UTC(2026, 7, 28)).toISOString(),
    scopeId,
    sources,
    evidence,
    completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
    warnings: ["[synthetic] fixture package — not real intelligence"],
    intelligenceObjects: objects,
    intelligenceRelations: relations,
    intelligenceMeta: {
      batchId: "synthetic-batch-001",
      generatedAt: new Date(Date.UTC(2026, 7, 28)).toISOString(),
      objectCount: objects.length,
      currentCount: objects.filter((o) => o.isCurrent).length,
      relationCount: relations.length,
    },
  };
}
