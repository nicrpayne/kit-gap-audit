import type { JsonValue } from "@/lib/context/package";

export const BOOTSTRAP_PACKAGE_VERSION = "1.0" as const;
export const BOOTSTRAP_COMPILER_VERSION = "signal-bootstrap-1.0" as const;

export type BootstrapLifecycle = "draft" | "scanning" | "reviewing" | "scan_failed" | "archived";
export type ProviderState = "available" | "unavailable" | "not_configured" | "partial" | "stale";
export type CandidateDisposition =
  | "pending"
  | "accepted"
  | "deferred"
  | "rejected"
  | "information-only"
  | "superseded";

export type CandidateKind =
  | "source"
  | "person"
  | "capability"
  | "decision"
  | "dependency"
  | "milestone"
  | "risk"
  | "unknown"
  | "missing_information";

export interface ProjectIdentityQuery {
  canonicalName: string;
  aliases: string[];
  ownerHint?: string;
  sourceHints: string[];
}

export interface MatchReason {
  kind: "exact_identity" | "lexical" | "source_hint" | "current_head" | "derivative";
  detail: string;
  terms?: string[];
}

export interface ProviderCoverage {
  provider: string;
  label: string;
  state: ProviderState;
  artifacts: number;
  observedAt?: string;
  detail: string;
}

export interface BootstrapArtifact {
  artifactId: string;
  provider: string;
  artifactType: string;
  title: string;
  canonicalRef: string;
  deepLink?: string;
  observedAt?: string;
  availability: ProviderState;
  retrievalReasons: MatchReason[];
  relevanceBand: "included" | "possible";
  lineageRootIds: string[];
  derivativeOfArtifactIds: string[];
}

export interface BootstrapEvidencePassage {
  evidenceId: string;
  artifactId: string;
  exactQuote: string;
  locator: Record<string, JsonValue>;
  speaker?: string;
  occurredAt?: string;
  independence: "independent" | "derivative" | "unknown";
  lineageRootIds: string[];
}

export interface BootstrapIntelligenceHead {
  intelligenceId: string;
  type: string;
  statement: string;
  isCurrent: boolean;
  status?: string;
  observedDate?: string;
  fields: Record<string, JsonValue>;
  evidenceRefs: string[];
  supersedes: string[];
  contradictedBy: string[];
  provenance: Record<string, JsonValue>;
}

export interface BootstrapProposal {
  proposalId: string;
  candidateKey: string;
  fingerprint: string;
  kind: CandidateKind;
  title: string;
  statement: string;
  whyProposed: string;
  matchBasis: string;
  evidenceRefs: string[];
  intelligenceRefs: string[];
  relevance: "high" | "medium" | "low";
  currentness: "current" | "aging" | "stale" | "unknown";
  grounding: {
    directEvidenceCount: number;
    independentLineageRootCount: number;
    derivativeOnly: boolean;
    unresolvedContradiction: boolean;
  };
  payload: Record<string, JsonValue>;
}

export interface BootstrapAmbiguity {
  id: string;
  kind: "alias_collision" | "contradiction" | "identity_collision";
  severity: "notice" | "blocking";
  summary: string;
  refs: string[];
}

export interface BootstrapGap {
  id: string;
  category: string;
  summary: string;
  detail: string;
}

export interface ProjectBootstrapPackageV1 {
  version: typeof BOOTSTRAP_PACKAGE_VERSION;
  packageId: string;
  producer: "gap_app" | "hermes" | "manual";
  compilerVersion: string;
  generatedAt: string;
  bootstrapId: string;
  requestedIdentity: ProjectIdentityQuery;
  discovery: {
    strategies: { id: string; state: "complete" | "partial" | "unavailable"; detail: string }[];
    partial: boolean;
  };
  artifacts: BootstrapArtifact[];
  evidence: BootstrapEvidencePassage[];
  intelligenceHeads: BootstrapIntelligenceHead[];
  proposals: BootstrapProposal[];
  coverage: ProviderCoverage[];
  ambiguities: BootstrapAmbiguity[];
  gaps: BootstrapGap[];
  warnings: string[];
}

const FORBIDDEN_GEOMETRY_KEYS = new Set([
  "x", "y", "xy", "position", "positions", "coordinates", "geometry", "layout", "laneGeometry",
]);

export class BootstrapPackageValidationError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectGeometry(value: unknown, path = "package") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectGeometry(entry, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_GEOMETRY_KEYS.has(key)) {
      throw new BootstrapPackageValidationError(`${path}.${key} is presentation geometry and is not legal package data`);
    }
    rejectGeometry(child, `${path}.${key}`);
  }
}

export function validateBootstrapPackage(value: unknown, expectedBootstrapId?: string): ProjectBootstrapPackageV1 {
  if (!isObject(value)) throw new BootstrapPackageValidationError("package must be an object");
  rejectGeometry(value);
  if (value.version !== BOOTSTRAP_PACKAGE_VERSION) {
    throw new BootstrapPackageValidationError(`unsupported bootstrap package version ${String(value.version)}`);
  }
  for (const key of ["packageId", "producer", "compilerVersion", "generatedAt", "bootstrapId"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      throw new BootstrapPackageValidationError(`${key} is required`);
    }
  }
  if (expectedBootstrapId && value.bootstrapId !== expectedBootstrapId) {
    throw new BootstrapPackageValidationError("package bootstrapId does not match route bootstrapId");
  }
  if (value.producer !== "gap_app" && value.producer !== "hermes" && value.producer !== "manual") {
    throw new BootstrapPackageValidationError("producer must be gap_app, hermes, or manual");
  }
  if (Number.isNaN(Date.parse(String(value.generatedAt)))) {
    throw new BootstrapPackageValidationError("generatedAt must be an ISO timestamp");
  }
  if (!isObject(value.requestedIdentity)) throw new BootstrapPackageValidationError("requestedIdentity is required");
  for (const key of ["artifacts", "evidence", "intelligenceHeads", "proposals", "coverage", "ambiguities", "gaps", "warnings"] as const) {
    if (!Array.isArray(value[key])) throw new BootstrapPackageValidationError(`${key} must be an array`);
  }
  if (!isObject(value.discovery) || !Array.isArray(value.discovery.strategies)) {
    throw new BootstrapPackageValidationError("discovery.strategies must be an array");
  }
  const artifactIds = new Set<string>();
  for (const [index, artifact] of (value.artifacts as unknown[]).entries()) {
    if (!isObject(artifact) || typeof artifact.artifactId !== "string" || !artifact.artifactId) {
      throw new BootstrapPackageValidationError(`artifacts[${index}].artifactId is required`);
    }
    if (artifactIds.has(artifact.artifactId)) throw new BootstrapPackageValidationError(`duplicate artifactId ${artifact.artifactId}`);
    artifactIds.add(artifact.artifactId);
  }
  const evidenceIds = new Set<string>();
  for (const [index, evidence] of (value.evidence as unknown[]).entries()) {
    if (!isObject(evidence) || typeof evidence.evidenceId !== "string" || !evidence.evidenceId) {
      throw new BootstrapPackageValidationError(`evidence[${index}].evidenceId is required`);
    }
    if (evidenceIds.has(evidence.evidenceId)) throw new BootstrapPackageValidationError(`duplicate evidenceId ${evidence.evidenceId}`);
    evidenceIds.add(evidence.evidenceId);
    if (typeof evidence.artifactId !== "string" || !artifactIds.has(evidence.artifactId)) {
      throw new BootstrapPackageValidationError(`evidence[${index}].artifactId does not resolve`);
    }
  }
  const intelligenceIds = new Set<string>();
  for (const [index, head] of (value.intelligenceHeads as unknown[]).entries()) {
    if (!isObject(head) || typeof head.intelligenceId !== "string" || !head.intelligenceId) {
      throw new BootstrapPackageValidationError(`intelligenceHeads[${index}].intelligenceId is required`);
    }
    intelligenceIds.add(head.intelligenceId);
    for (const ref of Array.isArray(head.evidenceRefs) ? head.evidenceRefs : []) {
      if (typeof ref !== "string" || !evidenceIds.has(ref)) {
        throw new BootstrapPackageValidationError(`intelligenceHeads[${index}] has a dangling evidence ref`);
      }
    }
  }
  const seen = new Set<string>();
  for (const [index, proposal] of (value.proposals as unknown[]).entries()) {
    if (!isObject(proposal)) throw new BootstrapPackageValidationError(`proposals[${index}] must be an object`);
    for (const key of ["proposalId", "candidateKey", "fingerprint", "kind", "title", "statement", "whyProposed"] as const) {
      if (typeof proposal[key] !== "string" || !proposal[key].trim()) {
        throw new BootstrapPackageValidationError(`proposals[${index}].${key} is required`);
      }
    }
    if (seen.has(String(proposal.candidateKey))) {
      throw new BootstrapPackageValidationError(`duplicate candidateKey ${String(proposal.candidateKey)}`);
    }
    seen.add(String(proposal.candidateKey));
    if (!Array.isArray(proposal.evidenceRefs) || !Array.isArray(proposal.intelligenceRefs) || !isObject(proposal.payload)) {
      throw new BootstrapPackageValidationError(`proposals[${index}] has an invalid provenance or payload shape`);
    }
    for (const ref of proposal.evidenceRefs) {
      if (typeof ref !== "string" || !evidenceIds.has(ref)) {
        throw new BootstrapPackageValidationError(`proposals[${index}] has a dangling evidence ref`);
      }
    }
    for (const ref of proposal.intelligenceRefs) {
      if (typeof ref !== "string" || !intelligenceIds.has(ref)) {
        throw new BootstrapPackageValidationError(`proposals[${index}] has a dangling intelligence ref`);
      }
    }
  }
  return value as unknown as ProjectBootstrapPackageV1;
}
