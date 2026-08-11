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
  // Should reference evidence[].id values when evidence exists for the
  // claim -- not enforced as a hard constraint here (a claim citing a
  // meeting note that isn't itself modeled as an EvidenceItem is legal),
  // but validated for internal consistency where evidence IS present
  // (see lib/context/validate.ts).
  evidenceRefs: string[];
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
  version: typeof PROJECT_CONTEXT_PACKAGE_VERSION;

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

  completeness: PackageCompleteness;
  warnings: string[];
}
