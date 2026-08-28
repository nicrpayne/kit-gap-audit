// ProjectContextPackage v1 -- the TRANSPORT contract for "what relevant
// project context is being supplied right now." See docs/CONTEXT-MODEL.md
// for the full architecture this is Phase 1a of.
//
// Deliberately a plain, serializable value type -- no class, no behavior.
// A package is assembled (by Hermes, a human, or later the Gap App itself),
// optionally persisted VERBATIM as one ContextSnapshot row (lib/context/
// snapshot.ts), and never mutated after that. Nothing in this file touches
// Prisma, Linear, or the forecast/simulation math.

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

// Who assembled this package. Distinguishing "manual" (a hand-built test/
// dev fixture) from "hermes" (the eventual real integration, not wired in
// Phase 1a) from "gap_app" (a future self-assembled package, e.g. from
// Notion/Figma directly) matters for querying history later without
// needing to inspect package contents.
export type PackageProducer = "hermes" | "manual" | "gap_app";

export const PROJECT_CONTEXT_PACKAGE_VERSION = "1.0" as const;

/**
 * ── CONTRACT REVISIONS ────────────────────────────────────────────────
 *
 * Every revision Signal can accept, oldest first. The version a producer
 * sends is PRESERVED, not normalised away, so it takes part in the content
 * hash — which is what makes a contract revision a real identity change
 * rather than a cosmetic one.
 *
 *   1.0  the original transport: sources, evidence, derivedClaims,
 *        completeness, warnings.
 *   1.1  adds the external structured intelligence channel —
 *        `intelligenceObjects`, `intelligenceRelations`, `intelligenceMeta`
 *        — and the producer field vocabulary they arrive in. A 1.1 package
 *        that carries none of them is a 1.0 package with a different
 *        version string, and is accepted as such.
 *
 * WHY THIS EXISTS. A producer that derives its packageId from the content
 * it sends will mint the SAME id for the same corpus forever — correctly,
 * because that is what content-addressing means. But an id is only as good
 * as the contract it was consumed under: a package accepted by a build that
 * silently dropped a third of it is not the same delivery as the same bytes
 * accepted by a build that keeps all of it, and Signal's own identity rule
 * (`@@unique([producer, packageId])` plus a contextHash comparison) will
 * refuse the second as a conflict with the first.
 *
 * Putting the revision in the content identity is the honest fix: same
 * corpus and same contract means the same package, and a new contract means
 * a new one. No salts, no clock, no padding — none of which say anything
 * true about what changed.
 */
export const SUPPORTED_PACKAGE_VERSIONS = ["1.0", "1.1"] as const;
export type ProjectContextPackageVersion = (typeof SUPPORTED_PACKAGE_VERSIONS)[number];

/** The revision that first carries structured intelligence. */
export const INTELLIGENCE_PACKAGE_VERSION = "1.1" as const;

export type SourceManifestStatus =
  | "structural" // e.g. Linear -- always expected via Scope fields, no SourceRegistration row (see docs)
  | "candidate"
  | "active"
  | "paused"
  | "superseded"
  | "retired";

export interface PackageSourceManifestEntry {
  sourceType: string; // "linear" | "notion" | "figma" | "contextDoc" | "spreadsheet" | ...
  sourceRef: string; // project name / page id / figma ref key / contextDoc id or label
  registrationId: string | null; // null for structural sources (see docs/CONTEXT-MODEL.md)
  role: string | null;
  status: SourceManifestStatus;
  // The last time the underlying source was ACTUALLY read from its origin
  // by whichever system supplies this manifest entry -- NOT when this
  // package was assembled, and NOT bumped by a cache hit. Example: Notion
  // content actually fetched at 2:10, package assembled at 2:14 by reusing
  // that cached read -- observedAt stays "2:10", package.generatedAt is
  // "2:14". A cache hit is never a new observation. The producer owns this
  // value; the Gap App only stores it verbatim.
  observedAt: string; // ISO 8601
  succeeded: boolean;
  detail: string | null;
  /** As on EvidenceItem: unmodelled producer fields, preserved rather than
      dropped. */
  extra?: Record<string, JsonValue>;
}

export interface EvidenceItem {
  // Stable WITHIN this package/snapshot's sourceRef -- not claimed stable
  // across time (a re-read of the same spreadsheet next week produces a
  // new package with its own evidence array; ids may coincide if the
  // underlying row didn't move, but nothing here guarantees it). Prefer a
  // natural key from the source (a spreadsheet row label, a Notion block
  // id, a Linear identifier) when one exists.
  id: string;
  sourceRef: string;
  kind: string; // open vocabulary: "row" | "block" | "issue" | "page" | "note" | ...
  excerpt: string;
  // The closest durable pointer back to true origin, when one exists (a
  // Linear identifier, a Notion block id). Carried through rather than
  // dropped -- today's buildReleaseContext() flattens this away.
  externalRef?: string;
  // Deliberately small, generic structured-data escape hatch. Preserves
  // source-native structure (spreadsheet columns, a database row's
  // properties) instead of flattening everything into prose. No
  // source-specific typed fields on purpose -- callers put whatever their
  // source naturally has here.
  data?: Record<string, JsonValue>;
  // HOW INDEPENDENT THIS PASSAGE IS OF THE OTHERS, as the producer
  // determined it. Three values in the real corpus: "independent",
  // "derivative", and ABSENT.
  //
  //   ABSENT MEANS UNKNOWN. It does not mean independent, it is never
  //   defaulted to independent, and nothing in Signal may treat a missing
  //   value as a claim. Sixty of the real JSA passages carry no value at
  //   all; reading those as independent would manufacture corroboration
  //   out of silence.
  independence?: string;
  // ANYTHING THE PRODUCER SENT THAT SIGNAL DOES NOT MODEL -- the passage's
  // quote hash, its character offsets, its offset unit. Preserved rather
  // than dropped, for the same reason the intelligence objects are: the
  // producer owns this contract and a validator that rebuilds an item from
  // a whitelist silently loses whatever it has not been taught.
  extra?: Record<string, JsonValue>;
}

// Hermes-derived UNDERSTANDING about the evidence -- never itself evidence,
// and never itself a Finding, forecast input, Linear ticket, or Reality.
// This is inert transport data in Phase 1a: nothing reads or acts on it.
// A future explicit workflow (logic or a human) may turn one into a
// Finding; that boundary is deliberate and must not be crossed silently.
export interface DerivedClaim {
  id: string;
  kind: string;
  statement: string;
  /** As above: unmodelled producer fields, preserved rather than dropped. */
  extra?: Record<string, JsonValue>;
  // Should reference evidence[].id values when evidence exists for the
  // claim -- not enforced as a hard constraint here (a claim citing a
  // meeting note that isn't itself modeled as an EvidenceItem is legal),
  // but validated for internal consistency where evidence IS present
  // (see lib/context/validate.ts).
  evidenceRefs: string[];
}

// ── EXTERNAL STRUCTURED INTELLIGENCE ──────────────────────────────────
//
// Additive, optional, and a DIFFERENT CHANNEL from `derivedClaims`. A
// derived claim is a suggestion this app harvests into a candidate row a
// human may accept. An intelligence object is a thing the knowledge
// compiler asserts about the world; Signal shows it, searches it, and lets
// you walk its provenance, and there is NO path from it into Reality.
//
//   HERMES INTELLIGENCE IS NOT SIGNAL REALITY.
//
// Enforced structurally rather than by disclaimer: nothing below is ever
// read by a writer. The projection that consumes it (lib/audit/intelligence
// .ts) is pure, and a proof asserts accepting a package full of external
// Decisions creates zero Signal Decision rows.
//
// ── WHY THE SHAPE IS DELIBERATELY OPEN ────────────────────────────────
//
// The producer (kit-gap-bridge) owns this contract. Signal's job at the
// boundary is to guarantee the fields IT needs and to lose nothing else —
// because the bug this whole change exists to fix is precisely a validator
// that rebuilt an object from a whitelist and silently dropped what it did
// not recognise. Re-imposing a whitelist one level down would reintroduce
// that bug against a contract Signal does not own.
//
// So: the named fields below are REQUIRED and checked. Everything else the
// producer sends is preserved verbatim on `extra`, survives into the
// immutable snapshot, and is available to the inspector. A new upstream
// field costs a mapping line, never a lost payload.

export const EXTERNAL_INTELLIGENCE_TRUST = "external_intelligence" as const;

/** Every intelligence type the upstream corpus defines. Open at the edges:
    an unrecognised type is carried and displayed as itself rather than
    rejected — refusing a package because the corpus grew is worse than
    showing one node whose glyph is generic. */
export type IntelligenceType =
  | "Observation"
  | "Commitment"
  | "Unknown"
  | "Risk"
  | "Decision"
  | "ClimateEvidence"
  | "Dependency"
  | "AvailabilityObservation"
  | "Opportunity";

export interface IntelligenceObjectItem {
  /** The producer's canonical object id. Stable across batches — this is
      what makes longitudinal chains possible, and it is why relations can
      name endpoints by id rather than by position. */
  id: string;
  intelligenceType: string;
  /** Always `external_intelligence`. Carried explicitly so the boundary is
      readable in the stored data, not only in code. */
  trust: string;
  /** The producer's own normalised sentence. Signal NEVER re-derives this
      and never invokes a model to fill it in. */
  statement: string;
  /** How the producer arrived at the statement, when it says. */
  statementBasis?: string | null;
  status?: string | null;
  /** HEAD STATE, from the producer's own current-state determination — NOT
      inferred from `status`. A Commitment may be `open` and non-head. */
  isCurrent: boolean;
  observedDate?: string | null;
  /** Type-specific dates (due, resolved, interval…), producer-keyed. */
  dates?: Record<string, JsonValue>;
  /** Projects this object is attributed to. Signal filters on it; it never
      guesses membership from text. */
  scope?: string[];
  /** EvidenceItem ids within THIS package. */
  evidenceRefs?: string[];
  /** Type-specific content — owner/action for a Commitment, question for an
      Unknown, and so on. Producer-shaped, rendered as labelled rows. */
  fields?: Record<string, JsonValue>;
  /** Batch, canonical id, disambiguation, upstream confidence, live-system
      basis, evidence independence — whatever the producer records about
      where this came from. */
  provenance?: Record<string, JsonValue>;
  /** Anything the producer sends that is not named above. Preserved so a
      contract Signal does not own cannot lose data at this boundary. */
  extra?: Record<string, JsonValue>;
}

/** How loud a relation is allowed to be. The corpus is overwhelmingly
    contextual, so this is the difference between an instrument and a
    hairball. */
export type IntelligenceRelationClass = "temporal" | "semantic" | "contextual";

export interface IntelligenceRelationItem {
  from: string;
  rel: string;
  to: string;
  /** The producer's classification. Signal renders by class, not by name. */
  relClass: string;
  /** Whether each endpoint is present in this package. A relation whose
      target was not transported is still true — it is drawn as reaching
      outside rather than dropped. */
  fromInPackage?: boolean;
  toInPackage?: boolean;
  /** The relation as originally declared upstream, when the producer
      normalised a passive form. Signal does NOT re-normalise: `resolved_by`
      and `superseded_by` have already had their endpoints reversed by the
      bridge, and inverting again would silently point every longitudinal
      chain backwards. */
  declared?: Record<string, JsonValue>;
  extra?: Record<string, JsonValue>;
}

/**
 * THE PRODUCER'S OWN SPELLING FOR A RELATION'S PARTS.
 *
 * The bridge emits `sourceId` / `relation` / `targetId`; this transport was
 * written with `from` / `rel` / `to`. Rather than pick a winner and rewrite
 * the producer's fields, every reader accepts both — and this is the one
 * place that knows it, so the validator and the graph projection can never
 * drift into disagreeing about what a relation is.
 *
 * That drift is not hypothetical: the projection was reading `from`/`rel`/
 * `to` directly while the validator mapped them, so a real package projected
 * ZERO object-to-object relations from a raw read and all 87 from a
 * persisted one. Same package, two answers.
 */
export const RELATION_FIELD_ALIASES = {
  from: ["from", "sourceId"],
  rel: ["rel", "relation"],
  to: ["to", "targetId"],
  relClass: ["relClass", "relationClass"],
} as const;

/** The same, for the two booleans that say whether an endpoint travelled with
    the package. The bridge spells them `sourceInPackage` / `targetInPackage`;
    a referential check reading only `fromInPackage` never fired on a real
    payload — it silently checked nothing. */
export const RELATION_PRESENCE_ALIASES = {
  fromInPackage: ["fromInPackage", "sourceInPackage"],
  toInPackage: ["toInPackage", "targetInPackage"],
} as const;

export function readRelationPresence(
  raw: Record<string, unknown> | IntelligenceRelationItem,
  field: keyof typeof RELATION_PRESENCE_ALIASES
): boolean | undefined {
  const r = raw as Record<string, unknown>;
  for (const key of RELATION_PRESENCE_ALIASES[field]) {
    if (typeof r[key] === "boolean") return r[key] as boolean;
  }
  return undefined;
}

export function readRelationField(
  raw: Record<string, unknown> | IntelligenceRelationItem,
  field: keyof typeof RELATION_FIELD_ALIASES
): string | null {
  const r = raw as Record<string, unknown>;
  for (const key of RELATION_FIELD_ALIASES[field]) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export interface IntelligenceMeta {
  /** Producer's batch identity for this intelligence payload. */
  batchId?: string | null;
  generatedAt?: string | null;
  objectCount?: number | null;
  currentCount?: number | null;
  relationCount?: number | null;
  extra?: Record<string, JsonValue>;
}

export interface PackageCompleteness {
  expectedSources: string[]; // sourceRef of every structural + active/paused source
  missingSources: string[]; // expected but unreadable THIS assembly
  excludedSources: {
    sourceRef: string;
    status: "superseded" | "retired";
    reason: string | null;
  }[];
}

export interface ProjectContextPackage {
  // The revision the PRODUCER sent, preserved verbatim. See
  // SUPPORTED_PACKAGE_VERSIONS.
  version: ProjectContextPackageVersion;

  // TRANSPORT identity -- independent from ContextSnapshot.id (the Gap
  // App's own local, immutable historical identifier, assigned only once
  // a package is accepted and persisted, see lib/context/snapshot.ts).
  // packageId is the PRODUCER's identity for this specific package
  // instance: stable across a retried push of the same logical package,
  // so ingestion can be idempotent (see "Snapshot identity" in
  // docs/CONTEXT-MODEL.md).
  packageId: string;
  producer: PackageProducer;
  generatedAt: string; // ISO 8601 -- when the PRODUCER assembled this package

  // Phase 1a is single-scope only (see docs/CONTEXT-MODEL.md's product
  // decision on ContextSnapshot scoping) -- always required, never a
  // portfolio-wide package.
  scopeId: string;

  sources: PackageSourceManifestEntry[];
  evidence: EvidenceItem[];
  derivedClaims?: DerivedClaim[];

  // External structured intelligence. Optional and additive: a package
  // without these fields behaves exactly as it did before they existed.
  intelligenceObjects?: IntelligenceObjectItem[];
  intelligenceRelations?: IntelligenceRelationItem[];
  intelligenceMeta?: IntelligenceMeta;

  completeness: PackageCompleteness;
  warnings: string[];
}
