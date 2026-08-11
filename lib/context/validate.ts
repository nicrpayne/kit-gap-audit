// Validation for an incoming ProjectContextPackage v1, at whichever
// boundary accepts one (POST /api/refresh's contextPackage, a test
// fixture). Hand-rolled rather than a schema library, matching this
// codebase's existing precedent for untrusted-JSON validation
// (lib/audit/normalize.ts) -- no new dependency justified for one
// contract's shape.
//
// STRICT ON PURPOSE (Phase 1b hardening -- Phase 1a's first draft silently
// dropped malformed entries, which this repo's own standing rule forbids:
// "we received a blocker but couldn't parse it" must never quietly become
// "there was no blocker"). Any structural problem -- a missing required
// field anywhere in the package, a duplicate id, a dangling reference --
// rejects the WHOLE package by throwing PackageValidationError. There is
// no partial acceptance and no silent size-based truncation: an oversized
// field is a rejection reason, not something quietly cut short. Reject,
// don't guess.

import {
  PROJECT_CONTEXT_PACKAGE_VERSION,
  type ProjectContextPackage,
  type PackageProducer,
  type PackageSourceManifestEntry,
  type EvidenceItem,
  type DerivedClaim,
  type PackageCompleteness,
  type JsonValue,
  type SourceManifestStatus,
} from "./package";

const VALID_PRODUCERS = new Set<PackageProducer>(["hermes", "manual", "gap_app"]);
const VALID_SOURCE_STATUSES = new Set<SourceManifestStatus>([
  "structural",
  "candidate",
  "active",
  "paused",
  "superseded",
  "retired",
]);

// Sensible, generous bounds -- same spirit as the existing per-source char
// budgets in lib/notion.ts/lib/figma.ts. A package exceeding one of these
// is REJECTED, not truncated -- truncating would be exactly the kind of
// silent information loss this validator exists to prevent.
const MAX_SOURCES = 50;
const MAX_EVIDENCE_ITEMS = 500;
const MAX_DERIVED_CLAIMS = 200;
const MAX_WARNINGS = 50;
const MAX_EXCERPT_CHARS = 4000;
const MAX_DATA_JSON_CHARS = 8000;
const MAX_WARNING_CHARS = 500;
const MAX_STRING_FIELD_CHARS = 500; // ids, refs, kinds, statements, etc.

export class PackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageValidationError";
  }
}

function fail(message: string): never {
  throw new PackageValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(raw: unknown, path: string, maxChars = MAX_STRING_FIELD_CHARS): string {
  if (typeof raw !== "string" || !raw.trim()) {
    fail(`${path} is required and must be a non-empty string`);
  }
  const value = raw.trim();
  if (value.length > maxChars) {
    fail(`${path} exceeds the maximum allowed length (${maxChars} chars) -- rejected, not truncated`);
  }
  return value;
}

function optionalString(raw: unknown, path: string, maxChars = MAX_STRING_FIELD_CHARS): string | null {
  if (raw === undefined || raw === null) return null;
  return requireString(raw, path, maxChars);
}

function requireIsoDate(raw: unknown, path: string): string {
  const value = requireString(raw, path);
  if (Number.isNaN(Date.parse(value))) {
    fail(`${path} must be a valid ISO 8601 timestamp, got "${value}"`);
  }
  return value;
}

function requireArray(raw: unknown, path: string, max: number): unknown[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail(`${path} must be an array`);
  if (raw.length > max) fail(`${path} has ${raw.length} entries, exceeding the maximum of ${max} -- rejected, not truncated`);
  return raw;
}

// Recursively bounds a JSON value's serialized size -- `data` is
// deliberately generic (no fixed schema), so the only thing worth
// enforcing is "not absurdly large." Oversized `data` REJECTS the package.
function checkJsonBound(value: unknown, path: string, maxChars: number): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail(`${path} is not valid JSON`);
  }
  if (serialized === undefined) fail(`${path} is not valid JSON`);
  if (serialized.length > maxChars) {
    fail(`${path} exceeds the maximum allowed size (${maxChars} chars) -- rejected, not truncated`);
  }
}

function normalizeSourceEntry(raw: unknown, index: number): PackageSourceManifestEntry {
  const path = `sources[${index}]`;
  if (!isPlainObject(raw)) fail(`${path} must be an object`);

  const sourceType = requireString(raw.sourceType, `${path}.sourceType`);
  const sourceRef = requireString(raw.sourceRef, `${path}.sourceRef`);
  const status = requireString(raw.status, `${path}.status`) as SourceManifestStatus;
  if (!VALID_SOURCE_STATUSES.has(status)) {
    fail(`${path}.status must be one of: ${[...VALID_SOURCE_STATUSES].join(", ")} -- got "${status}"`);
  }
  const observedAt = requireIsoDate(raw.observedAt, `${path}.observedAt`);
  if (raw.succeeded !== true && raw.succeeded !== false) {
    fail(`${path}.succeeded is required and must be a boolean`);
  }

  return {
    sourceType,
    sourceRef,
    registrationId: optionalString(raw.registrationId, `${path}.registrationId`),
    role: optionalString(raw.role, `${path}.role`),
    status,
    observedAt,
    succeeded: raw.succeeded,
    detail: optionalString(raw.detail, `${path}.detail`, MAX_WARNING_CHARS),
  };
}

function normalizeEvidenceItem(raw: unknown, index: number): EvidenceItem {
  const path = `evidence[${index}]`;
  if (!isPlainObject(raw)) fail(`${path} must be an object`);

  const id = requireString(raw.id, `${path}.id`);
  const sourceRef = requireString(raw.sourceRef, `${path}.sourceRef`);
  const kind = requireString(raw.kind, `${path}.kind`);
  const excerpt = requireString(raw.excerpt, `${path}.excerpt`, MAX_EXCERPT_CHARS);

  const item: EvidenceItem = { id, sourceRef, kind, excerpt };

  const externalRef = optionalString(raw.externalRef, `${path}.externalRef`);
  if (externalRef) item.externalRef = externalRef;

  if (raw.data !== undefined) {
    if (!isPlainObject(raw.data)) fail(`${path}.data must be a plain object when present`);
    checkJsonBound(raw.data, `${path}.data`, MAX_DATA_JSON_CHARS);
    item.data = raw.data as Record<string, JsonValue>;
  }

  return item;
}

function normalizeDerivedClaim(raw: unknown, index: number): DerivedClaim {
  const path = `derivedClaims[${index}]`;
  if (!isPlainObject(raw)) fail(`${path} must be an object`);

  const id = requireString(raw.id, `${path}.id`);
  const kind = requireString(raw.kind, `${path}.kind`);
  const statement = requireString(raw.statement, `${path}.statement`, MAX_EXCERPT_CHARS);

  const evidenceRefsRaw = requireArray(raw.evidenceRefs, `${path}.evidenceRefs`, 50);
  const evidenceRefs = evidenceRefsRaw.map((r, i) => requireString(r, `${path}.evidenceRefs[${i}]`));

  return { id, kind, statement, evidenceRefs };
}

function normalizeCompleteness(raw: unknown): PackageCompleteness {
  if (raw === undefined) {
    fail("completeness is required");
  }
  if (!isPlainObject(raw)) fail("completeness must be an object");

  const expectedSources = requireArray(raw.expectedSources, "completeness.expectedSources", 200).map((r, i) =>
    requireString(r, `completeness.expectedSources[${i}]`)
  );
  const missingSources = requireArray(raw.missingSources, "completeness.missingSources", 200).map((r, i) =>
    requireString(r, `completeness.missingSources[${i}]`)
  );
  const excludedSourcesRaw = requireArray(raw.excludedSources, "completeness.excludedSources", 200);
  const excludedSources = excludedSourcesRaw.map((e, i) => {
    const path = `completeness.excludedSources[${i}]`;
    if (!isPlainObject(e)) fail(`${path} must be an object`);
    const sourceRef = requireString(e.sourceRef, `${path}.sourceRef`);
    const status = requireString(e.status, `${path}.status`);
    if (status !== "superseded" && status !== "retired") {
      fail(`${path}.status must be "superseded" or "retired", got "${status}"`);
    }
    return { sourceRef, status: status as "superseded" | "retired", reason: optionalString(e.reason, `${path}.reason`) };
  });

  return { expectedSources, missingSources, excludedSources };
}

// Rejects on ANY structural problem -- there is no safe partial
// acceptance of "which package, from whom, for which scope, citing what."
export function validateProjectContextPackage(raw: unknown): ProjectContextPackage {
  if (!isPlainObject(raw)) {
    fail("Expected a ProjectContextPackage object");
  }

  if (raw.version !== PROJECT_CONTEXT_PACKAGE_VERSION) {
    fail(`Unsupported ProjectContextPackage version: ${JSON.stringify(raw.version)} (expected "${PROJECT_CONTEXT_PACKAGE_VERSION}")`);
  }

  const packageId = requireString(raw.packageId, "packageId");

  const producer = requireString(raw.producer, "producer") as PackageProducer;
  if (!VALID_PRODUCERS.has(producer)) {
    fail(`producer must be one of: ${[...VALID_PRODUCERS].join(", ")} -- got "${producer}"`);
  }

  const generatedAt = requireIsoDate(raw.generatedAt, "generatedAt");
  const scopeId = requireString(raw.scopeId, "scopeId");

  const sources = requireArray(raw.sources, "sources", MAX_SOURCES).map((s, i) => normalizeSourceEntry(s, i));
  const evidence = requireArray(raw.evidence, "evidence", MAX_EVIDENCE_ITEMS).map((e, i) => normalizeEvidenceItem(e, i));
  const derivedClaimsRaw = requireArray(raw.derivedClaims, "derivedClaims", MAX_DERIVED_CLAIMS).map((c, i) =>
    normalizeDerivedClaim(c, i)
  );
  const warningsRaw = requireArray(raw.warnings, "warnings", MAX_WARNINGS);
  const warnings = warningsRaw.map((w, i) => requireString(w, `warnings[${i}]`, MAX_WARNING_CHARS));

  const completeness = normalizeCompleteness(raw.completeness);

  // -- Referential integrity: no dangling pointers survive into an
  // immutable snapshot. --

  const sourceRefs = new Set(sources.map((s) => s.sourceRef));
  evidence.forEach((e, i) => {
    if (!sourceRefs.has(e.sourceRef)) {
      fail(`evidence[${i}].sourceRef "${e.sourceRef}" does not match any entry in sources[] (sourceRef)`);
    }
  });

  const evidenceIds = new Set<string>();
  evidence.forEach((e, i) => {
    if (evidenceIds.has(e.id)) {
      fail(`evidence[${i}].id "${e.id}" is a duplicate -- evidence ids must be unique within a package`);
    }
    evidenceIds.add(e.id);
  });

  const claimIds = new Set<string>();
  derivedClaimsRaw.forEach((c, i) => {
    if (claimIds.has(c.id)) {
      fail(`derivedClaims[${i}].id "${c.id}" is a duplicate -- derived claim ids must be unique within a package`);
    }
    claimIds.add(c.id);
    c.evidenceRefs.forEach((ref, j) => {
      if (!evidenceIds.has(ref)) {
        fail(
          `derivedClaims[${i}].evidenceRefs[${j}] "${ref}" does not match any evidence[].id in this package -- ` +
            `every derived claim must cite evidence that actually exists in the package`
        );
      }
    });
  });

  const pkg: ProjectContextPackage = {
    version: PROJECT_CONTEXT_PACKAGE_VERSION,
    packageId,
    producer,
    generatedAt,
    scopeId,
    sources,
    evidence,
    completeness,
    warnings,
  };
  if (derivedClaimsRaw.length > 0) pkg.derivedClaims = derivedClaimsRaw;

  return pkg;
}
