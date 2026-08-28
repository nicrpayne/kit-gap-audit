// THE REAL POST-FIX JSA PACKAGE, REBUILT FROM ITS PUBLISHED CENSUS.
//
//   THE PACKAGE FILE ITSELF WAS NOT SUPPLIED TO THIS ENVIRONMENT.
//
// What was supplied is its complete census — every count, every type
// breakdown, every relation breakdown, every class breakdown, the source-type
// mix, the registration mix, the evidence split, the independence split, and
// three exact identifiers from a real provenance chain. This module reproduces
// that census EXACTLY and emits it in the producer's own field vocabulary.
//
// So: the SHAPE and VOLUME are the real package's, asserted item by item
// against REAL_JSA below. The prose is generated and every generated string is
// prefixed `[synthetic]` so it can never be mistaken for real intelligence.
// What this cannot prove is anything that depends on the actual bytes — the
// real statement text, the real excerpt content, the real quote hashes. Those
// are named in the limitations section of the report rather than implied here.
//
// ── WHAT MAKES THIS THE RECONCILIATION FIXTURE ────────────────────────
//
// It emits what the BRIDGE emits, not what Signal's transport happened to be
// written against:
//
//   relations as `sourceId` / `relation` / `targetId`, not from / rel / to
//   object types lowercase snake — `climate_evidence`, not ClimateEvidence
//   a fourth relation class, `provenance`
//   evidence passages carrying quoteHash / charStart / charEnd /
//     offsetUnit / independence, none of which Signal modelled
//   ids in the producer's own namespaces: `hermes:`, `hermes-ev:`, `ke://`
//   no derivedClaims at all
//
// Every one of those was a genuine mismatch when this file was written. Three
// of them would have rejected or silently corrupted the real package.

import {
  EXTERNAL_INTELLIGENCE_TRUST,
  type ProjectContextPackage,
  type IntelligenceObjectItem,
  type IntelligenceRelationItem,
  type EvidenceItem,
  type PackageSourceManifestEntry,
  type JsonValue,
} from "@/lib/context/package";

/** The published census of the real post-fix JSA package. */
export const REAL_JSA = {
  sources: 47,
  sourcesByType: { transcript: 30, source: 15, spreadsheet: 1, contextDoc: 1 },
  sourcesAdHoc: 45,
  sourcesRegistered: 2,

  evidence: 399,
  structuredPassages: 156,
  legacyReparsed: 243,
  independence: { independent: 90, derivative: 10, absent: 56 },

  objects: 161,
  objectsByType: {
    observation: 59,
    commitment: 24,
    unknown: 20,
    risk: 17,
    decision: 15,
    dependency: 15,
    climate_evidence: 6,
    availability_observation: 5,
  } as Record<string, number>,
  currentObjects: 155,
  historicalObjects: 6,

  relations: 87,
  relationsByName: {
    related_to: 68,
    derived_from: 4,
    depends_on: 3,
    resolves: 3,
    refines: 3,
    supersedes: 3,
    caused_by: 2,
    supports: 1,
  } as Record<string, number>,
  // CLASSES, AND HOW THE PER-RELATION ASSIGNMENT WAS DERIVED.
  //
  // The census gives the relation names and the class totals but not the
  // mapping between them. Exactly one assignment reconciles both:
  //
  //   provenance 4  = derived_from 4
  //   contextual 68 = related_to 68
  //   temporal 6    = supersedes 3 + refines 3
  //   semantic 9    = resolves 3 + depends_on 3 + caused_by 2 + supports 1
  //
  // Note where that puts `resolves`: SEMANTIC, not temporal. This module's
  // name-based fallback originally guessed otherwise, and the producer is the
  // authority — a resolution is a statement about the project, not a step
  // along a chain. The fallback was corrected to agree.
  //
  // This mapping is DERIVED BY RECONCILIATION, not read from the file. It is
  // the only assignment consistent with both published breakdowns, and the
  // producer's declared class wins at runtime regardless, so nothing depends
  // on the inference being right.
  temporal: 6,
  semantic: 9,
  contextual: 68,
  provenance: 4,
  passiveInverseNames: 0,

  derivedClaims: 0,

  /** The exact chain named for the provenance traversal proof. */
  trace: {
    object: "hermes:risk-2026-08-24-005",
    evidence: "hermes-ev:2026-08-19_KE-User-Interview-Follow-Up-seg069",
    source: "ke://source/transcript/2026-08-19_KE-User-Interview-Follow-Up",
  },
} as const;

/** The producer's class for each relation name. See REAL_JSA above. */
export const REAL_RELATION_CLASS: Record<string, string> = {
  related_to: "contextual",
  derived_from: "provenance",
  supersedes: "temporal",
  refines: "temporal",
  resolves: "semantic",
  depends_on: "semantic",
  caused_by: "semantic",
  supports: "semantic",
};

/**
 * PROSE PADDED TO THE REAL PAYLOAD'S WEIGHT.
 *
 * The real post-fix JSA package is ~851 KB. Generated one-line excerpts come
 * to ~250 KB for the same census, and every size-dependent measurement below
 * — validator cost, hash cost, request body, snapshot storage — would be
 * flattered by a factor of three. So passages are filled out to the length a
 * real transcript segment actually runs to, and a check asserts the finished
 * package lands within 10% of 851 KB.
 */
export const REAL_PACKAGE_BYTES = 851 * 1024;

function pad(seed: string, target: number): string {
  const filler =
    " The room came back to offline capture, and then to who signs off on access before the field pilot. " +
    "Nobody disagreed that it matters; nobody claimed it. The same names came up as last week. ";
  let out = seed;
  while (out.length < target) out += filler;
  return out.slice(0, target);
}

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

/** A stand-in for the producer's quote hash — the right SHAPE, and visibly
    not a real digest. */
function quoteHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sha256:synthetic-${h.toString(16).padStart(8, "0")}`;
}

/** The type-shaped payload a producer would carry. */
function fieldsFor(t: string): Record<string, JsonValue> {
  switch (t) {
    case "commitment":
      return { owner: "[synthetic] owner", action: "[synthetic] action" };
    case "unknown":
      return { question: "[synthetic] open question" };
    case "dependency":
      return { dependent: "[synthetic] A", dependency: "[synthetic] B" };
    case "availability_observation":
      return { person: "[synthetic] person", state: "reduced" };
    default:
      return {};
  }
}

export function buildIntelligenceFixturePackage(scopeId = "jsa"): ProjectContextPackage {
  const rnd = mulberry(20260828);

  // ── SOURCES: 30 transcript · 15 source · 1 spreadsheet · 1 contextDoc ──
  //
  // 45 ad-hoc (registrationId null, status candidate) and 2 registered and
  // active — the real mix, and the reason the completeness report reads the
  // way it does. `ke://` refs, because that is the producer's namespace.
  const sourceTypes: string[] = [];
  for (const [type, n] of Object.entries(REAL_JSA.sourcesByType)) {
    for (let i = 0; i < n; i++) sourceTypes.push(type);
  }
  const sources: PackageSourceManifestEntry[] = sourceTypes.map((sourceType, i) => {
    const registered = i < REAL_JSA.sourcesRegistered;
    const slug =
      i === 0
        ? "2026-08-19_KE-User-Interview-Follow-Up"
        : `[synthetic]-${sourceType}-${String(i + 1).padStart(2, "0")}`;
    return {
      sourceType,
      sourceRef: `ke://source/${sourceType}/${slug}`,
      registrationId: registered ? `reg-${i + 1}` : null,
      role: null,
      status: registered ? "active" : "candidate",
      observedAt: new Date(Date.UTC(2026, 6, 1 + (i % 40))).toISOString(),
      succeeded: true,
      detail: null,
    };
  });
  // The traced source must be the exact real ref.
  sources[0] = { ...sources[0], sourceRef: REAL_JSA.trace.source, sourceType: "transcript" };

  // ── EVIDENCE: 156 structured Hermes passages + 243 legacy reparsed ────
  const evidence: EvidenceItem[] = [];

  // INDEPENDENCE IS A THREE-WAY FACT AND ONE OF THE THREE IS SILENCE.
  // 90 independent, 10 derivative, and 56 that carry NO FIELD AT ALL.
  const independenceRoll: (string | null)[] = [
    ...Array<string>(REAL_JSA.independence.independent).fill("independent"),
    ...Array<string>(REAL_JSA.independence.derivative).fill("derivative"),
    ...Array<null>(REAL_JSA.independence.absent).fill(null),
  ];

  for (let i = 0; i < REAL_JSA.structuredPassages; i++) {
    const src = sources[i % sources.length];
    const slug = src.sourceRef.split("/").pop()!;
    const id = i === 69 ? REAL_JSA.trace.evidence : `hermes-ev:${slug}-seg${String(i).padStart(3, "0")}`;
    const excerpt = pad(
      `[synthetic] structured passage ${i} — offline capture, conflict resolution and access ` +
        `sign-off came up again, and nobody has owned the decision.`,
      1480
    );
    const charStart = 1200 + i * 37;
    const item: EvidenceItem = {
      id,
      sourceRef: src.sourceRef,
      kind: "passage",
      excerpt,
      externalRef: `${src.sourceRef}#seg${String(i).padStart(3, "0")}`,
      // The producer's own passage anchoring. Signal modelled none of these
      // fields and was dropping every one of them at the boundary.
      quoteHash: quoteHash(`${id}:${excerpt}`),
      charStart,
      charEnd: charStart + excerpt.length,
      offsetUnit: "unicode_codepoint",
    } as EvidenceItem;
    const independence = independenceRoll[i];
    // ABSENT IS ABSENT. No key at all, never a default.
    if (independence !== null) item.independence = independence;
    evidence.push(item);
  }
  // Make the traced passage's source the traced source, whatever the modulo
  // did — and move its externalRef with it, so the panel's "Source" row and
  // its own back-pointer name the same transcript.
  {
    const idx = evidence.findIndex((e) => e.id === REAL_JSA.trace.evidence);
    evidence[idx] = {
      ...evidence[idx],
      sourceRef: REAL_JSA.trace.source,
      externalRef: `${REAL_JSA.trace.source}#seg069`,
    };
  }

  // THE 243 LEGACY REPARSED ITEMS, kept exactly as they are this tranche.
  for (let i = 0; i < REAL_JSA.legacyReparsed; i++) {
    const src = sources[(i + 7) % sources.length];
    evidence.push({
      id: `ev-legacy-${String(i + 1).padStart(3, "0")}`,
      sourceRef: src.sourceRef,
      kind: "note",
      excerpt: pad(`[synthetic] legacy reparsed evidence ${i + 1} — offline capture and access sign-off.`, 1480),
      externalRef: `${src.sourceRef}#legacy-${i + 1}`,
    });
  }

  // ── OBJECTS: 161, in the real type mix, producer-cased ────────────────
  const typeRoll: string[] = [];
  for (const [type, n] of Object.entries(REAL_JSA.objectsByType)) {
    for (let i = 0; i < n; i++) typeRoll.push(type);
  }
  // Interleave so the historical six are not all one type.
  typeRoll.sort((a, b) => a.localeCompare(b));
  const interleaved: string[] = [];
  const buckets = new Map<string, string[]>();
  for (const t of typeRoll) buckets.set(t, [...(buckets.get(t) ?? []), t]);
  while (interleaved.length < typeRoll.length) {
    for (const [, list] of buckets) {
      const next = list.pop();
      if (next) interleaved.push(next);
    }
  }

  const objects: IntelligenceObjectItem[] = interleaved.map((t, i) => {
    const isCurrent = i >= REAL_JSA.historicalObjects;
    const date = new Date(Date.UTC(2026, 7, 24)).toISOString().slice(0, 10);
    return {
      id: `hermes:${t.replace(/_/g, "-")}-${date}-${String(i + 1).padStart(3, "0")}`,
      // THE PRODUCER'S OWN CASING, VERBATIM. Never rewritten to Signal's.
      intelligenceType: t,
      trust: EXTERNAL_INTELLIGENCE_TRUST,
      statement: pad(
        `[synthetic] ${t} ${i + 1}: offline conflict resolution and access sign-off ` +
          `remain unsettled for the field pilot.`,
        420
      ),
      statementBasis: "normalised_from_type_fields",
      // A DELIBERATE COUNTEREXAMPLE. Some of the six non-head objects are
      // still `open`. Anything deriving currentness from status gets those
      // wrong, and a proof checks exactly that.
      status: i % 3 === 0 ? "open" : i % 3 === 1 ? "resolved" : "accepted",
      isCurrent,
      observedDate: new Date(Date.UTC(2026, 6, 1 + (i % 55))).toISOString(),
      dates: (t === "commitment" ? { due: new Date(Date.UTC(2026, 8, 15)).toISOString() } : {}) as Record<
        string,
        JsonValue
      >,
      scope: ["jsa"],
      evidenceRefs: [],
      fields: fieldsFor(t),
      provenance: {
        canonicalId: `ke/objects/${t}/${i + 1}`,
        batchId: "jsa-postfix-001",
      },
    };
  });
  // The traced object must be the exact real id, and must be a risk.
  {
    const idx = objects.findIndex((o) => o.intelligenceType === "risk" && o.isCurrent);
    objects[idx] = { ...objects[idx], id: REAL_JSA.trace.object };
    objects[idx].evidenceRefs = [REAL_JSA.trace.evidence];
  }

  // ── OBJECT → EVIDENCE ────────────────────────────────────────────────
  //
  // Only the 156 STRUCTURED passages are citable — the legacy reparsed items
  // are Signal's own older evidence and no intelligence object points at
  // them. That split is the reason both sets are counted separately.
  const structuredIds = evidence.slice(0, REAL_JSA.structuredPassages).map((e) => e.id);
  let links = 0;
  let guard = 0;
  while (links < 207 && guard < 100000) {
    guard++;
    const o = objects[links % objects.length];
    const ref = structuredIds[Math.floor(rnd() * structuredIds.length)];
    const refs = o.evidenceRefs!;
    if (refs.includes(ref)) continue;
    refs.push(ref);
    links++;
  }

  // ── OBJECT → OBJECT: 87, in the real name and class mix ──────────────
  //
  // EMITTED IN THE PRODUCER'S FIELD VOCABULARY — sourceId / relation /
  // targetId. Signal's transport was written with from / rel / to, and a
  // package in this shape was rejected outright until the validator learned
  // to read both.
  const relations: IntelligenceRelationItem[] = [];
  const push = (sourceId: string, relation: string, targetId: string) => {
    relations.push({
      sourceId,
      relation,
      targetId,
      relationClass: REAL_RELATION_CLASS[relation],
    } as unknown as IntelligenceRelationItem);
  };

  const historical = objects.slice(0, REAL_JSA.historicalObjects);
  const current = objects.slice(REAL_JSA.historicalObjects);
  const byType = (t: string) => current.filter((o) => o.intelligenceType === t);
  const decisions = byType("decision");
  const unknowns = byType("unknown");
  const risks = byType("risk");
  const deps = byType("dependency");
  const observations = byType("observation");

  // TEMPORAL — 3 supersedes + 3 refines, and every one of the six historical
  // objects is the far end of one. That is why they were transported.
  for (let i = 0; i < 3; i++) push(decisions[i].id, "supersedes", historical[i].id);
  for (let i = 0; i < 3; i++) push(decisions[i + 3].id, "refines", historical[i + 3].id);

  // SEMANTIC — 3 resolves + 3 depends_on + 2 caused_by + 1 supports.
  for (let i = 0; i < 3; i++) push(decisions[i + 6].id, "resolves", unknowns[i].id);
  for (let i = 0; i < 3; i++) push(deps[i].id, "depends_on", observations[i].id);
  for (let i = 0; i < 2; i++) push(risks[i].id, "caused_by", observations[i + 3].id);
  push(observations[6].id, "supports", decisions[0].id);

  // PROVENANCE — 4 derived_from.
  for (let i = 0; i < 4; i++) push(observations[i + 7].id, "derived_from", observations[i + 20].id);

  // CONTEXTUAL — 68 related_to. The bulk, and the reason default-hidden
  // exists at all.
  for (let i = 0; relations.length < REAL_JSA.relations; i++) {
    const a = current[(i * 3) % current.length];
    const b = current[(i * 5 + 13) % current.length];
    if (a.id === b.id) continue;
    push(a.id, "related_to", b.id);
  }

  return {
    version: "1.0",
    packageId: "jsa-postfix-structured-001",
    producer: "hermes",
    generatedAt: new Date(Date.UTC(2026, 7, 24, 9, 0, 0)).toISOString(),
    scopeId,
    sources,
    evidence,
    // ABSENT IN THE REAL PACKAGE, and absent here.
    completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
    warnings: ["[synthetic] census-shaped fixture — real counts, generated prose"],
    intelligenceObjects: objects,
    intelligenceRelations: relations,
    intelligenceMeta: {
      batchId: "jsa-postfix-001",
      generatedAt: new Date(Date.UTC(2026, 7, 24, 9, 0, 0)).toISOString(),
      objectCount: objects.length,
      currentCount: objects.filter((o) => o.isCurrent).length,
      relationCount: relations.length,
    },
  };
}

/** Kept for the assertions written against the previous fixture's name. */
export const JSA_SCALE = {
  sources: REAL_JSA.sources,
  evidence: REAL_JSA.evidence,
  objects: REAL_JSA.objects,
  currentObjects: REAL_JSA.currentObjects,
  historicalObjects: REAL_JSA.historicalObjects,
  relations: REAL_JSA.relations,
  temporal: REAL_JSA.temporal,
  semantic: REAL_JSA.semantic,
  contextual: REAL_JSA.contextual,
  provenance: REAL_JSA.provenance,
  objectEvidenceLinks: 207,
} as const;
