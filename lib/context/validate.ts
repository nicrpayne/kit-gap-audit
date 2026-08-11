// Validation/normalization for an incoming ProjectContextPackage v1, at
// whichever boundary accepts one (a future /api/refresh extension, a test
// fixture, an eventual dev ingestion route). Hand-rolled rather than a
// schema library, matching this codebase's existing precedent for
// untrusted-JSON validation (lib/audit/normalize.ts) -- no new dependency
// justified for one contract's shape.
//
// Two different failure modes on purpose, same split normalizeFindings
// already uses: a malformed TOP-LEVEL package (missing packageId, an
// unknown producer, wrong version) is rejected outright by throwing --
// there's no safe partial acceptance of "which package is this even." A
// malformed ENTRY within an array (one bad evidence item, one bad source)
// is dropped individually so one bad row doesn't sink an otherwise-good
// package.

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
// budgets in lib/notion.ts/lib/figma.ts, applied per-item since evidence is
// now itemized rather than flattened into one string.
const MAX_SOURCES = 50;
const MAX_EVIDENCE_ITEMS = 500;
const MAX_DERIVED_CLAIMS = 200;
const MAX_WARNINGS = 50;
const MAX_EXCERPT_CHARS = 2000;
const MAX_DATA_JSON_CHARS = 4000;
const MAX_WARNING_CHARS = 500;
const MAX_STRING_FIELD_CHARS = 500; // ids, refs, kinds, statements, etc.

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Recursively bounds a JSON value's serialized size rather than trying to
// validate arbitrary shape -- `data` is deliberately generic (Correction 3),
// so the only thing worth enforcing here is "not absurdly large," not a
// fixed schema.
function boundJson(value: unknown, maxChars: number): JsonValue | undefined {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return undefined;
    if (serialized.length <= maxChars) return value as JsonValue;
    return undefined; // oversized -- drop rather than silently truncate structured data mid-value
  } catch {
    return undefined;
  }
}

function normalizeSourceEntry(raw: unknown): PackageSourceManifestEntry | null {
  if (!isPlainObject(raw)) return null;
  const sourceType = str(raw.sourceType);
  const sourceRef = str(raw.sourceRef);
  const statusRaw = str(raw.status);
  const observedAt = str(raw.observedAt);
  if (!sourceType || !sourceRef || !statusRaw || !observedAt) return null;
  if (!VALID_SOURCE_STATUSES.has(statusRaw as SourceManifestStatus)) return null;
  if (Number.isNaN(Date.parse(observedAt))) return null;

  return {
    sourceType: truncate(sourceType, MAX_STRING_FIELD_CHARS),
    sourceRef: truncate(sourceRef, MAX_STRING_FIELD_CHARS),
    registrationId: str(raw.registrationId),
    role: str(raw.role),
    status: statusRaw as SourceManifestStatus,
    observedAt,
    succeeded: raw.succeeded === true,
    detail: str(raw.detail) ? truncate(str(raw.detail)!, MAX_WARNING_CHARS) : null,
  };
}

function normalizeEvidenceItem(raw: unknown): EvidenceItem | null {
  if (!isPlainObject(raw)) return null;
  const id = str(raw.id);
  const sourceRef = str(raw.sourceRef);
  const kind = str(raw.kind);
  const excerpt = typeof raw.excerpt === "string" ? raw.excerpt : "";
  if (!id || !sourceRef || !kind) return null;

  const item: EvidenceItem = {
    id: truncate(id, MAX_STRING_FIELD_CHARS),
    sourceRef: truncate(sourceRef, MAX_STRING_FIELD_CHARS),
    kind: truncate(kind, MAX_STRING_FIELD_CHARS),
    excerpt: truncate(excerpt, MAX_EXCERPT_CHARS),
  };
  const externalRef = str(raw.externalRef);
  if (externalRef) item.externalRef = truncate(externalRef, MAX_STRING_FIELD_CHARS);

  if (raw.data !== undefined) {
    const bounded = boundJson(raw.data, MAX_DATA_JSON_CHARS);
    if (bounded !== undefined && isPlainObject(bounded)) {
      item.data = bounded as Record<string, JsonValue>;
    }
  }

  return item;
}

function normalizeDerivedClaim(raw: unknown): DerivedClaim | null {
  if (!isPlainObject(raw)) return null;
  const id = str(raw.id);
  const kind = str(raw.kind);
  const statement = str(raw.statement);
  if (!id || !kind || !statement) return null;

  return {
    id: truncate(id, MAX_STRING_FIELD_CHARS),
    kind: truncate(kind, MAX_STRING_FIELD_CHARS),
    statement: truncate(statement, MAX_EXCERPT_CHARS),
    evidenceRefs: Array.isArray(raw.evidenceRefs)
      ? raw.evidenceRefs.filter((x): x is string => typeof x === "string").slice(0, 50)
      : [],
  };
}

function normalizeCompleteness(raw: unknown): PackageCompleteness {
  const r = isPlainObject(raw) ? raw : {};
  const expectedSources = Array.isArray(r.expectedSources)
    ? r.expectedSources.filter((x): x is string => typeof x === "string")
    : [];
  const missingSources = Array.isArray(r.missingSources)
    ? r.missingSources.filter((x): x is string => typeof x === "string")
    : [];
  const excludedSources = Array.isArray(r.excludedSources)
    ? r.excludedSources
        .map((e) => {
          if (!isPlainObject(e)) return null;
          const sourceRef = str(e.sourceRef);
          const status = str(e.status);
          if (!sourceRef || (status !== "superseded" && status !== "retired")) return null;
          return { sourceRef, status: status as "superseded" | "retired", reason: str(e.reason) };
        })
        .filter((e): e is PackageCompleteness["excludedSources"][number] => e !== null)
    : [];

  return { expectedSources, missingSources, excludedSources };
}

export class PackageValidationError extends Error {}

// Rejects outright (throws) on a malformed top-level shape -- there is no
// safe partial acceptance of "which package, from whom, for which scope."
// Defensively normalizes/drops within nested arrays otherwise, same
// philosophy as lib/audit/normalize.ts.
export function validateProjectContextPackage(raw: unknown): ProjectContextPackage {
  if (!isPlainObject(raw)) {
    throw new PackageValidationError("Expected a ProjectContextPackage object");
  }

  if (raw.version !== PROJECT_CONTEXT_PACKAGE_VERSION) {
    throw new PackageValidationError(
      `Unsupported ProjectContextPackage version: ${String(raw.version)} (expected "${PROJECT_CONTEXT_PACKAGE_VERSION}")`
    );
  }

  const packageId = str(raw.packageId);
  if (!packageId) {
    throw new PackageValidationError("packageId is required");
  }

  const producer = str(raw.producer);
  if (!producer || !VALID_PRODUCERS.has(producer as PackageProducer)) {
    throw new PackageValidationError(`producer must be one of: ${[...VALID_PRODUCERS].join(", ")}`);
  }

  const generatedAt = str(raw.generatedAt);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new PackageValidationError("generatedAt must be a valid ISO 8601 timestamp");
  }

  const scopeId = str(raw.scopeId);
  if (!scopeId) {
    throw new PackageValidationError("scopeId is required (Phase 1a packages are single-scope only)");
  }

  const sources = Array.isArray(raw.sources)
    ? raw.sources.map(normalizeSourceEntry).filter((s): s is PackageSourceManifestEntry => s !== null).slice(0, MAX_SOURCES)
    : [];

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map(normalizeEvidenceItem).filter((e): e is EvidenceItem => e !== null).slice(0, MAX_EVIDENCE_ITEMS)
    : [];

  const derivedClaimsRaw = Array.isArray(raw.derivedClaims)
    ? raw.derivedClaims.map(normalizeDerivedClaim).filter((c): c is DerivedClaim => c !== null).slice(0, MAX_DERIVED_CLAIMS)
    : [];

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
        .filter((w): w is string => typeof w === "string")
        .map((w) => truncate(w, MAX_WARNING_CHARS))
        .slice(0, MAX_WARNINGS)
    : [];

  const pkg: ProjectContextPackage = {
    version: PROJECT_CONTEXT_PACKAGE_VERSION,
    packageId,
    producer: producer as PackageProducer,
    generatedAt,
    scopeId,
    sources,
    evidence,
    completeness: normalizeCompleteness(raw.completeness),
    warnings,
  };
  if (derivedClaimsRaw.length > 0) pkg.derivedClaims = derivedClaimsRaw;

  return pkg;
}
