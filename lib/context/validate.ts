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
  type IntelligenceObjectItem,
  type IntelligenceRelationItem,
  type IntelligenceMeta,
  RELATION_FIELD_ALIASES,
  EXTERNAL_INTELLIGENCE_TRUST,
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
// ── PACKAGE LIMITS ────────────────────────────────────────────────────
//
//   LIMITS PROTECT SIGNAL FROM PATHOLOGICAL INPUT.
//   THEY DO NOT CONSTRAIN NORMAL PROJECT GROWTH.
//
// The originals were chosen before any real structured package existed, and
// the real post-fix JSA package arrived at 47 of 50 sources — 94% of a
// contract limit, on an ordinary project. Upstream source growth is about
// +6.4 artifacts per ingestion batch, so the NEXT ordinary ingestion would
// have been rejected by a number nobody had revisited.
//
// Measured (scripts/audit-package-limits-measure.ts), on the real 835 KB
// package and on one scaled to saturate every new ceiling at once:
//
//   real JSA          835 KB   validate  9ms   hash  11ms   project  4ms
//   every cap maxed  8515 KB   validate 106ms  hash 191ms   project 80ms
//
// So a package ten times the real one's weight still validates, hashes and
// projects in under four hundred milliseconds — which is the evidence these
// numbers are chosen on. A normal project now sits at 19% of the source cap
// instead of 94%.
export const PACKAGE_LIMITS = {
  sources: 250,
  evidence: 2000,
  derivedClaims: 200,
  intelligenceObjects: 2000,
  intelligenceRelations: 20000,
  /** Total serialised weight, whatever shape it arrives in. */
  bytes: 12 * 1024 * 1024,
} as const;

const MAX_SOURCES = PACKAGE_LIMITS.sources;
const MAX_EVIDENCE_ITEMS = PACKAGE_LIMITS.evidence;
const MAX_DERIVED_CLAIMS = PACKAGE_LIMITS.derivedClaims;
const MAX_WARNINGS = 50;
// The real JSA payload is 161 objects / 87 relations. Room to grow several
// times over without letting a runaway producer post an unbounded blob.
const MAX_INTELLIGENCE_OBJECTS = PACKAGE_LIMITS.intelligenceObjects;
const MAX_INTELLIGENCE_RELATIONS = PACKAGE_LIMITS.intelligenceRelations;
const MAX_INTELLIGENCE_EVIDENCE_REFS = 200;
const MAX_EXCERPT_CHARS = 4000;
const MAX_DATA_JSON_CHARS = 8000;
const MAX_WARNING_CHARS = 500;
const MAX_STRING_FIELD_CHARS = 500; // ids, refs, kinds, statements, etc.

// ONE GUARD THAT DOES NOT CARE HOW THE PAYLOAD IS SHAPED.
//
// The per-array caps bound the SHAPE of a package; this bounds its WEIGHT,
// which is what actually costs memory, hash time and a jsonb row. A payload
// can satisfy every count above and still be pathological — 2,000 evidence
// items each carrying a 4,000-character excerpt, say.
//
// Set above the 8.5 MB a fully-saturated package weighs, so a caller who
// trips a shape limit gets the specific error naming the field rather than
// this one. It fires only for something no legitimate producer emits.
const MAX_PACKAGE_BYTES = PACKAGE_LIMITS.bytes;

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

/** Split a raw object into the keys we model and the ones we do not,
    keeping the remainder rather than discarding it. */
function partitionKnown(
  raw: Record<string, unknown>,
  known: string[],
  path: string
): Record<string, JsonValue> | undefined {
  const rest: Record<string, JsonValue> = {};
  let any = false;
  for (const key of Object.keys(raw)) {
    if (known.includes(key)) continue;
    rest[key] = raw[key] as JsonValue;
    any = true;
  }
  if (!any) return undefined;
  checkJsonBound(rest, `${path} (unmodelled fields)`, MAX_DATA_JSON_CHARS);
  return rest;
}

/**
 * Everything the producer sent that this object does not model, merged with
 * any `extra` it declared explicitly.
 *
 * The one helper every normaliser below ends with. Used everywhere rather
 * than at the intelligence layer alone, because "the validator rebuilds an
 * object from a whitelist and silently drops the rest" is a property of a
 * FUNCTION, not of a field — and it was true of evidence items, source
 * manifest entries and derived claims long before intelligence existed.
 */
function preserveRest(
  raw: Record<string, unknown>,
  known: string[],
  path: string
): Record<string, JsonValue> | undefined {
  const unmodelled = partitionKnown(raw, known, path);
  const declared = optionalRecord(raw.extra, `${path}.extra`);
  const merged = { ...(declared ?? {}), ...(unmodelled ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function optionalRecord(raw: unknown, path: string): Record<string, JsonValue> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw)) fail(`${path} must be an object when present`);
  checkJsonBound(raw, path, MAX_DATA_JSON_CHARS);
  return raw as Record<string, JsonValue>;
}

function optionalStringArray(raw: unknown, path: string, max: number): string[] | undefined {
  if (raw === undefined) return undefined;
  const arr = requireArray(raw, path, max);
  return arr.map((v, i) => requireString(v, `${path}[${i}]`));
}

const SOURCE_ENTRY_KEYS = [
  "sourceType", "sourceRef", "registrationId", "role", "status", "observedAt",
  "succeeded", "detail", "extra",
];

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

  const entry: PackageSourceManifestEntry = {
    sourceType,
    sourceRef,
    registrationId: optionalString(raw.registrationId, `${path}.registrationId`),
    role: optionalString(raw.role, `${path}.role`),
    status,
    observedAt,
    succeeded: raw.succeeded,
    detail: optionalString(raw.detail, `${path}.detail`, MAX_WARNING_CHARS),
  };
  const rest = preserveRest(raw, SOURCE_ENTRY_KEYS, path);
  if (rest) entry.extra = rest;
  return entry;
}

const EVIDENCE_ITEM_KEYS = ["id", "sourceRef", "kind", "excerpt", "externalRef", "independence", "data", "extra"];

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

  // ABSENT IS NOT A VALUE. `independence` is assigned only when the producer
  // actually sent one, so "unknown" stays distinguishable from "independent"
  // everywhere downstream. A default here would manufacture corroboration
  // out of silence for the 56 real passages that carry no value.
  const independence = optionalString(raw.independence, `${path}.independence`);
  if (independence !== null) item.independence = independence;

  if (raw.data !== undefined) {
    if (!isPlainObject(raw.data)) fail(`${path}.data must be a plain object when present`);
    checkJsonBound(raw.data, `${path}.data`, MAX_DATA_JSON_CHARS);
    item.data = raw.data as Record<string, JsonValue>;
  }

  // THE SAME BUG, ONE LEVEL OVER. This function rebuilt an evidence item
  // from six named fields, so a producer sending `quoteHash`, `charStart`,
  // `charEnd` or `offsetUnit` had them silently deleted at the boundary --
  // exactly the defect the intelligence fields were added to fix, sitting
  // unnoticed in the path evidence had always taken. A citation that cannot
  // name its own character range is not a citation.
  const rest = preserveRest(raw, EVIDENCE_ITEM_KEYS, path);
  if (rest) item.extra = rest;

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

  const claim: DerivedClaim = { id, kind, statement, evidenceRefs };
  const rest = preserveRest(raw, ["id", "kind", "statement", "evidenceRefs", "extra"], path);
  if (rest) claim.extra = rest;
  return claim;
}

// ── EXTERNAL INTELLIGENCE ─────────────────────────────────────────────
//
// PRESERVATION-FIRST, and that is the whole point of this block.
//
// The defect being fixed here is that `validateProjectContextPackage`
// rebuilds the accepted package from named fields, so anything it does not
// recognise is silently dropped — `intelligenceObjects` included. Guarding
// only the top level and then whitelisting the INSIDE of an intelligence
// object would reintroduce exactly that bug against a contract Signal does
// not own: the producer adds a field, the field vanishes, and nothing
// fails.
//
// So each helper below checks the fields Signal genuinely depends on and
// carries everything else through on `extra`. Structural problems still
// reject the whole package — a dangling evidence ref is not a field Signal
// can shrug at — but an unfamiliar field is data, not an error.

const INTEL_OBJECT_KEYS = [
  "id", "intelligenceType", "trust", "statement", "statementBasis", "status",
  "isCurrent", "observedDate", "dates", "scope", "evidenceRefs", "fields",
  "provenance", "extra",
];

function normalizeIntelligenceObject(raw: unknown, index: number): IntelligenceObjectItem {
  const path = `intelligenceObjects[${index}]`;
  if (!isPlainObject(raw)) fail(`${path} must be an object`);

  const id = requireString(raw.id, `${path}.id`);
  const intelligenceType = requireString(raw.intelligenceType, `${path}.intelligenceType`);
  const trust = requireString(raw.trust, `${path}.trust`);
  // THE BOUNDARY, CHECKED AT THE BOUNDARY. Anything arriving through this
  // field is external intelligence by definition; a payload claiming some
  // other trust level is a contract error, not something to interpret.
  if (trust !== EXTERNAL_INTELLIGENCE_TRUST) {
    fail(
      `${path}.trust must be "${EXTERNAL_INTELLIGENCE_TRUST}" -- got "${trust}". ` +
        `Structured intelligence is external by construction and never arrives as accepted Reality.`
    );
  }
  const statement = requireString(raw.statement, `${path}.statement`, MAX_EXCERPT_CHARS);
  if (typeof raw.isCurrent !== "boolean") {
    fail(
      `${path}.isCurrent must be a boolean -- head state comes from the producer's own current-state ` +
        `determination, never inferred from status`
    );
  }

  const item: IntelligenceObjectItem = {
    id,
    intelligenceType,
    trust,
    statement,
    isCurrent: raw.isCurrent,
  };
  const basis = optionalString(raw.statementBasis, `${path}.statementBasis`, MAX_EXCERPT_CHARS);
  if (basis !== null) item.statementBasis = basis;
  const status = optionalString(raw.status, `${path}.status`);
  if (status !== null) item.status = status;
  const observedDate = optionalString(raw.observedDate, `${path}.observedDate`);
  if (observedDate !== null) item.observedDate = observedDate;
  const dates = optionalRecord(raw.dates, `${path}.dates`);
  if (dates) item.dates = dates;
  const scope = optionalStringArray(raw.scope, `${path}.scope`, 50);
  if (scope) item.scope = scope;
  const refs = optionalStringArray(raw.evidenceRefs, `${path}.evidenceRefs`, MAX_INTELLIGENCE_EVIDENCE_REFS);
  if (refs) item.evidenceRefs = refs;
  const fields = optionalRecord(raw.fields, `${path}.fields`);
  if (fields) item.fields = fields;
  const provenance = optionalRecord(raw.provenance, `${path}.provenance`);
  if (provenance) item.provenance = provenance;
  const rest = preserveRest(raw, INTEL_OBJECT_KEYS, path);
  if (rest) item.extra = rest;

  return item;
}

const INTEL_RELATION_KEYS = [
  "from", "rel", "to", "relClass", "fromInPackage", "toInPackage", "declared", "extra",
  // The producer's own spellings for the same three concepts. Listed so the
  // ones actually used are not ALSO copied into `extra` as unmodelled.
  "sourceId", "relation", "targetId", "relationClass",
];

/**
 * BE LIBERAL IN WHAT YOU ACCEPT, AND REWRITE NOTHING.
 *
 * The bridge names a relation's parts `sourceId` / `relation` / `targetId`;
 * this transport was written with `from` / `rel` / `to`. They are the same
 * three concepts, and picking a winner would mean either rejecting the real
 * package outright or quietly renaming the producer's fields — the second
 * being how a contract Signal does not own gets bent to Signal's taste.
 *
 * So either spelling is read, and whichever arrived is preserved verbatim
 * on `extra`. Signal's own field names are an internal convenience; the
 * producer's are the record.
 */
function firstString(raw: Record<string, unknown>, keys: string[], path: string, label: string): string {
  for (const k of keys) {
    if (typeof raw[k] === "string" && (raw[k] as string).length > 0) {
      return requireString(raw[k], `${path}.${k}`);
    }
  }
  fail(`${path}.${label} is required (accepted as any of: ${keys.join(", ")})`);
}

function normalizeIntelligenceRelation(raw: unknown, index: number): IntelligenceRelationItem {
  const path = `intelligenceRelations[${index}]`;
  if (!isPlainObject(raw)) fail(`${path} must be an object`);

  const item: IntelligenceRelationItem = {
    from: firstString(raw, [...RELATION_FIELD_ALIASES.from], path, "from"),
    rel: firstString(raw, [...RELATION_FIELD_ALIASES.rel], path, "rel"),
    to: firstString(raw, [...RELATION_FIELD_ALIASES.to], path, "to"),
    relClass: firstString(raw, [...RELATION_FIELD_ALIASES.relClass], path, "relClass"),
  };
  if (typeof raw.fromInPackage === "boolean") item.fromInPackage = raw.fromInPackage;
  if (typeof raw.toInPackage === "boolean") item.toInPackage = raw.toInPackage;
  const declared = optionalRecord(raw.declared, `${path}.declared`);
  if (declared) item.declared = declared;

  // THE PRODUCER'S OWN SPELLING, RECORDED ONCE AND NEVER REWRITTEN.
  //
  // Which of the two vocabularies the bridge used is worth keeping — "what
  // did it actually send" should be answerable from the snapshot. Recording
  // it by copying the raw keys back was NOT idempotent: validating a package
  // that had already been validated saw Signal's names in the input and
  // overwrote the record with those, so re-validating a stored snapshot
  // produced a different package and therefore a different contextHash. A
  // proof caught it against the stored rows.
  //
  // So it is written only when absent. First acceptance decides; every later
  // pass over the same package is a no-op, which is what an immutable
  // snapshot requires.
  if (declared?.emittedAs === undefined) {
    const emittedAs: Record<string, JsonValue> = {};
    for (const [field, aliases] of Object.entries(RELATION_FIELD_ALIASES)) {
      const used = aliases.find((k) => typeof raw[k] === "string" && (raw[k] as string).length > 0);
      if (used) emittedAs[field] = used;
    }
    item.declared = { ...(declared ?? {}), emittedAs };
  }
  const rest = preserveRest(raw, INTEL_RELATION_KEYS, path);
  if (rest) item.extra = rest;

  return item;
}

const INTEL_META_KEYS = ["batchId", "generatedAt", "objectCount", "currentCount", "relationCount", "extra"];

function normalizeIntelligenceMeta(raw: unknown): IntelligenceMeta {
  if (!isPlainObject(raw)) fail("intelligenceMeta must be an object when present");

  const meta: IntelligenceMeta = {};
  const batchId = optionalString(raw.batchId, "intelligenceMeta.batchId");
  if (batchId !== null) meta.batchId = batchId;
  const generatedAt = optionalString(raw.generatedAt, "intelligenceMeta.generatedAt");
  if (generatedAt !== null) meta.generatedAt = generatedAt;
  for (const k of ["objectCount", "currentCount", "relationCount"] as const) {
    const v = raw[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`intelligenceMeta.${k} must be a number when present`);
    meta[k] = v;
  }
  const rest = preserveRest(raw, INTEL_META_KEYS, "intelligenceMeta");
  if (rest) meta.extra = rest;

  return meta;
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
  // WEIGHT FIRST, before anything walks the structure. Measuring the payload
  // after parsing every item is measuring it too late to be a protection.
  checkJsonBound(raw, "package", MAX_PACKAGE_BYTES);

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

  // ADDITIVE AND OPTIONAL. A package that carries none of these is
  // validated, hashed and persisted exactly as it was before they existed —
  // a regression proof asserts that.
  const intelligenceObjects =
    raw.intelligenceObjects === undefined
      ? undefined
      : requireArray(raw.intelligenceObjects, "intelligenceObjects", MAX_INTELLIGENCE_OBJECTS).map((o, i) =>
          normalizeIntelligenceObject(o, i)
        );
  const intelligenceRelations =
    raw.intelligenceRelations === undefined
      ? undefined
      : requireArray(raw.intelligenceRelations, "intelligenceRelations", MAX_INTELLIGENCE_RELATIONS).map((r, i) =>
          normalizeIntelligenceRelation(r, i)
        );
  const intelligenceMeta =
    raw.intelligenceMeta === undefined ? undefined : normalizeIntelligenceMeta(raw.intelligenceMeta);

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

  if (intelligenceObjects) {
    const objectIds = new Set<string>();
    intelligenceObjects.forEach((o, i) => {
      if (objectIds.has(o.id)) {
        fail(`intelligenceObjects[${i}].id "${o.id}" is a duplicate -- object ids must be unique within a package`);
      }
      objectIds.add(o.id);
      // Same law the derived claims already hold to: no dangling pointer
      // survives into an immutable snapshot.
      (o.evidenceRefs ?? []).forEach((ref, j) => {
        if (!evidenceIds.has(ref)) {
          fail(
            `intelligenceObjects[${i}].evidenceRefs[${j}] "${ref}" does not match any evidence[].id in this ` +
              `package -- an intelligence object must cite evidence that actually arrived with it`
          );
        }
      });
    });

    // A RELATION MAY REACH OUTSIDE THE PACKAGE, and that is not an error:
    // objects are transported purely to hold the far end of a longitudinal
    // chain, and a chain whose other end was not sent is still a true chain.
    // What is NOT allowed is an endpoint that CLAIMS to be in the package
    // and is not -- that is a producer bug worth failing on.
    (intelligenceRelations ?? []).forEach((r, i) => {
      if (r.fromInPackage === true && !objectIds.has(r.from)) {
        fail(`intelligenceRelations[${i}].from "${r.from}" claims fromInPackage but no such object was sent`);
      }
      if (r.toInPackage === true && !objectIds.has(r.to)) {
        fail(`intelligenceRelations[${i}].to "${r.to}" claims toInPackage but no such object was sent`);
      }
    });
  } else if (intelligenceRelations && intelligenceRelations.length > 0) {
    fail("intelligenceRelations were sent without intelligenceObjects -- relations with no objects describe nothing");
  }

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
  // Assigned only when the producer sent them, so a legacy package hashes
  // identically to the way it always did.
  if (intelligenceObjects) pkg.intelligenceObjects = intelligenceObjects;
  if (intelligenceRelations) pkg.intelligenceRelations = intelligenceRelations;
  if (intelligenceMeta) pkg.intelligenceMeta = intelligenceMeta;

  return pkg;
}
