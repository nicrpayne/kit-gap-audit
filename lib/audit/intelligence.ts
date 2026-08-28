// EXTERNAL STRUCTURED INTELLIGENCE — projected, never promoted.
//
//   HERMES INTELLIGENCE IS NOT SIGNAL REALITY.
//
// Held structurally rather than by disclaimer. This file is pure: it takes
// accepted snapshot packages and returns plain values. It imports no Prisma
// client, writes nothing, and returns nothing a writer consumes. A package
// full of external Decisions produces zero `Decision` rows because there is
// no code path from here to one — proven, not asserted.
//
// ── WHAT AN EXTERNAL OBJECT IS ────────────────────────────────────────
//
// A Hermes Decision means "the knowledge compiler believes the evidence
// supports that a decision occurred". A Signal Decision is accepted
// delivery Reality with forecast consequences. They are different claims
// about different things and they never share a node, a shape, or an id
// space.
//
// ── SCOPE ─────────────────────────────────────────────────────────────
//
// AN OBJECT BELONGS TO THE SCOPE ITS SNAPSHOT BELONGS TO, and to nothing
// else. That link is attested: `persistContextSnapshot` checks the package's
// own `scopeId` against the Scope the request named and refuses a mismatch,
// so by the time a snapshot exists Signal has already verified who the
// package is for.
//
// This was originally written to admit an object only when its own `scope[]`
// named the Scope, on the assumption that `scope[]` held Signal Scope ids.
// The real payload shows it does not. It holds the PRODUCER'S TOPIC TAGS —
// `["jsa", "design"]`, `["linear", "jsa", "itrack"]`, `["jsa", "offline"]` —
// while the package's `scopeId` is Signal's own cuid. Matched against that
// cuid, every one of the 161 real objects was rejected as out of scope and
// the graph showed nothing.
//
// Reading the tags as Scope attribution instead would be worse than useless:
// they name other Signal Scopes (`itrack`, `platform`) alongside topic words
// (`offline`, `resourcing`, `governance`) with nothing to tell the two apart
// except how the strings look. That is the text-similarity attribution this
// codebase has refused at every previous tranche, and it is exactly the
// multi-scope ambiguity that is explicitly out of scope here.
//
// So the tags are carried verbatim onto the node, shown in the inspector,
// and counted in the meta — real producer information, doing no work it
// cannot ground.
//
// ── CURRENTNESS ───────────────────────────────────────────────────────
//
// `isCurrent` comes from the producer's own head determination and is NEVER
// derived from `status`. The real corpus contains the counterexample: a
// Commitment can be `open` and non-head. Anything reading status to decide
// currentness gets those wrong, and a proof pins that pair.

import type {
  ProjectContextPackage,
  IntelligenceObjectItem,
  IntelligenceRelationItem,
  PackageSourceManifestEntry,
  JsonValue,
} from "@/lib/context/package";
import { readRelationField } from "@/lib/context/package";

/** How loud a relation may be. The corpus is overwhelmingly contextual, so
    this is the difference between an instrument and a hairball. */
export type IntelRelationClass = "temporal" | "semantic" | "contextual" | "provenance";

/**
 * Relations that carry a real chain through time. Drawn at rest between two
 * open objects, and the reason historical objects are transported at all.
 *
 * READ OFF THE REAL PACKAGE, not inferred. An earlier pass had only the
 * published census — relation totals and class totals, with no mapping
 * between them — and reconciled the two arithmetically. That reconciliation
 * was self-consistent and WRONG: it put `resolves` in semantic and `refines`
 * in temporal. The bridge's own file says the opposite for both:
 *
 *   temporal 6  = supersedes 3 + resolves 3
 *   semantic 9  = refines 3 + depends_on 3 + caused_by 2 + supports 1
 *
 * Nothing behavioural depended on the guess — a declared `relationClass`
 * always wins, and every relation in the real payload carries one — but the
 * fallback is what a relation arriving without a class gets, and it has no
 * business disagreeing with the producer. Counts are not a taxonomy.
 */
export const TEMPORAL_RELS = new Set(["supersedes", "resolves", "reopens"]);

/** Meaningful but not temporal. Drawn at rest. See TEMPORAL_RELS for why
    `refines` sits here and `resolves` does not. */
export const SEMANTIC_RELS = new Set(["depends_on", "caused_by", "contradicts", "supports", "refines"]);

/**
 * WHERE A CLAIM CAME FROM, between two objects.
 *
 * `derived_from` was originally filed under semantic here, on the strength of
 * its name. The real corpus classes it `provenance` — a fourth class — and
 * the producer is right: "B was derived from A" is a statement about how the
 * knowledge was made, not about the project. It belongs with the citation
 * mesh, subdued at rest, rather than with the dependency and contradiction
 * edges that say something about delivery.
 *
 * The name-based fallback now agrees with the producer instead of quietly
 * disagreeing with it.
 */
export const PROVENANCE_RELS = new Set(["derived_from", "cites", "sourced_from"]);

export interface ProjectedIntelObject {
  /** `<snapshotId>::<producer object id>` — snapshot-scoped for the same
      reason passages are, since two snapshots may carry the same object at
      different heads. The producer id is preserved verbatim as `externalId`
      so relations can name endpoints by it. */
  key: string;
  externalId: string;
  snapshotId: string;
  scopeId: string;
  intelligenceType: string;
  trust: string;
  statement: string;
  statementBasis: string | null;
  status: string | null;
  isCurrent: boolean;
  observedDate: string | null;
  dates: Record<string, JsonValue>;
  scope: string[];
  /** Evidence ids as the producer wrote them — the raw id must survive the
      crossing so it can be matched back to the package. */
  evidenceRefs: string[];
  fields: Record<string, JsonValue>;
  provenance: Record<string, JsonValue>;
  /** Anything the producer sent that Signal does not model. Kept so the
      inspector can show it and nothing is lost at the boundary. */
  extra: Record<string, JsonValue>;
}

/**
 * An evidence row an external object cites, resolved against the package's
 * OWN manifest.
 *
 * Carried in exactly the shape the graph's passage constructor takes, so a
 * passage reached first by a citation and one reached first by a requirement
 * are the same node rather than two that drifted apart. Signal is not taking
 * the producer's word for the passage's contents: the excerpt, source and
 * observation time all come from the accepted package, and a ref naming an
 * evidence id that is not in it resolves to nothing and is dropped.
 */
export interface ProjectedIntelPassage {
  snapshotId: string;
  evidenceId: string;
  excerpt: string;
  sourceRef: string;
  sourceType: string | null;
  observedAt: string | null;
  role: string | null;
  status: string | null;
  externalRef: string | null;
  /** The producer's own anchoring for this quote — hash, character range and
      the unit the offsets are counted in. Signal models none of these fields,
      which is exactly why they must survive: a citation that cannot name its
      own character range is not a citation. */
  anchor: Record<string, JsonValue>;
  /** `independent` | `derivative` | NULL. Null means the producer did not
      say, and is never read as independent. */
  independence: string | null;
}

export interface ProjectedIntelRelation {
  fromKey: string;
  toKey: string | null;
  /** Present when the far end was not transported. A chain reaching outside
      the package is still a true chain; it is drawn as reaching outside
      rather than dropped. */
  toExternalId: string;
  rel: string;
  relClass: IntelRelationClass;
  declared: Record<string, JsonValue>;
}

export interface IntelSnapshotInput {
  id: string;
  scopeId: string;
  package: unknown;
}

export interface ProjectedIntelligence {
  objects: ProjectedIntelObject[];
  relations: ProjectedIntelRelation[];
  /** Deduplicated, and only for refs that actually resolve. */
  citedPassages: ProjectedIntelPassage[];
  meta: {
    batchId: string | null;
    objectCount: number;
    currentCount: number;
    relationCount: number;
    byType: Record<string, number>;
    byRelClass: Record<string, number>;
    /** Objects carried by a snapshot belonging to a different Scope. */
    outOfScope: number;
    /** The producer's own topic tags and how often each appears. Observability
        only — nothing routes, admits or attributes on these. */
    scopeTags: Record<string, number>;
    /** Citations naming an evidence id the package does not contain. Zero on
        anything the validator accepted; nonzero is a real integrity fact
        about an older snapshot, so it is counted rather than hidden. */
    danglingCitations: number;
  };
}

/**
 * Normalise a producer relation class, falling back on the relation name.
 *
 * The producer classifies; Signal renders by class. Where a package omits
 * the class, the relation NAME decides, and anything unrecognised lands on
 * `contextual` — the quietest bucket. An unknown relation appearing loudly
 * at rest is how a hairball starts.
 */
export function relClassOf(r: { rel: string; relClass?: string }): IntelRelationClass {
  const c = (readRelationField(r as unknown as Record<string, unknown>, "relClass") ?? "").toLowerCase();
  if (c === "temporal" || c === "semantic" || c === "contextual" || c === "provenance") return c;
  const rel = r.rel.toLowerCase();
  if (TEMPORAL_RELS.has(rel)) return "temporal";
  if (SEMANTIC_RELS.has(rel)) return "semantic";
  if (PROVENANCE_RELS.has(rel)) return "provenance";
  return "contextual";
}

/** Snapshot-scoped node key for one producer object id. */
export const intelKey = (snapshotId: string, externalId: string) => `intel:${snapshotId}:${externalId}`;

function rec(v: Record<string, JsonValue> | undefined): Record<string, JsonValue> {
  return v ?? {};
}

/**
 * The anchoring fields, lifted out of everything else the producer sent.
 *
 * IT ARRIVES INSIDE `data`. The transport has a modelled, generic `data`
 * escape hatch and an unmodelled-field bucket, and the bridge puts passage
 * anchoring in the former — `data.quoteHash`, `data.charStart`,
 * `data.charEnd`, `data.offsetUnit`, `data.independence`, alongside its own
 * `passageId`, `segmentId`, `speakerConfidence` and the rest. Looking only in
 * the unmodelled bucket found nothing: 156 real passages, 0 anchored.
 *
 * Both are read, `data` first, because either is a legitimate place for a
 * producer to put them and neither is Signal's to dictate.
 */
const ANCHOR_FIELDS = ["quoteHash", "charStart", "charEnd", "offsetUnit", "primaryAnchor"];

function pickAnchor(...sources: (Record<string, JsonValue> | undefined)[]): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const k of ANCHOR_FIELDS) if (out[k] === undefined && src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/** `independent` | `derivative` | null. NULL MEANS THE PRODUCER DID NOT SAY,
    and is never read as independent. */
function pickIndependence(item: { independence?: string; data?: Record<string, JsonValue> }): string | null {
  if (typeof item.independence === "string") return item.independence;
  const v = item.data?.independence;
  return typeof v === "string" ? v : null;
}

/**
 * Every external intelligence object this Scope claims, and the relations
 * between them.
 *
 * Pure and total: a malformed package contributes nothing rather than
 * throwing, because a snapshot is immutable and the graph must still build
 * around one that cannot be read.
 *
 * Deterministic: objects sorted by key, relations by (from, rel, to).
 */
export function projectIntelligence(
  snapshots: IntelSnapshotInput[],
  scopeId: string
): ProjectedIntelligence {
  const objects: ProjectedIntelObject[] = [];
  const relations: ProjectedIntelRelation[] = [];
  const citedPassages = new Map<string, ProjectedIntelPassage>();
  const byType: Record<string, number> = {};
  const byRelClass: Record<string, number> = {};
  const scopeTags: Record<string, number> = {};
  let outOfScope = 0;
  let danglingCitations = 0;
  let batchId: string | null = null;

  for (const snap of snapshots) {
    const pkg = snap.package as ProjectContextPackage | null;
    if (!pkg || !Array.isArray(pkg.intelligenceObjects)) continue;
    batchId = batchId ?? pkg.intelligenceMeta?.batchId ?? null;

    // THE PACKAGE'S OWN EVIDENCE, INDEXED. A citation names a row; the row
    // itself — and the manifest entry it was read out of — is what Signal
    // draws, never anything the producer wrote about it.
    const evidenceById = new Map((pkg.evidence ?? []).map((e) => [e.id, e]));
    const manifestByRef = new Map<string, PackageSourceManifestEntry>(
      (pkg.sources ?? []).map((s) => [s.sourceRef, s])
    );

    // THE SNAPSHOT'S SCOPE IS THE ATTESTATION. A snapshot that belongs to a
    // different Scope contributes nothing — the caller asked for this one.
    const admitted = new Map<string, ProjectedIntelObject>();
    if (snap.scopeId !== scopeId) {
      outOfScope += pkg.intelligenceObjects.length;
      continue;
    }
    for (const o of pkg.intelligenceObjects as IntelligenceObjectItem[]) {
      const scope = o.scope ?? [];
      for (const tag of scope) scopeTags[tag] = (scopeTags[tag] ?? 0) + 1;
      const projected: ProjectedIntelObject = {
        key: intelKey(snap.id, o.id),
        externalId: o.id,
        snapshotId: snap.id,
        scopeId,
        intelligenceType: o.intelligenceType,
        trust: o.trust,
        statement: o.statement,
        statementBasis: o.statementBasis ?? null,
        status: o.status ?? null,
        isCurrent: o.isCurrent,
        observedDate: o.observedDate ?? null,
        dates: rec(o.dates),
        scope,
        evidenceRefs: o.evidenceRefs ?? [],
        fields: rec(o.fields),
        provenance: rec(o.provenance),
        extra: rec(o.extra),
      };
      admitted.set(o.id, projected);
      objects.push(projected);
      byType[o.intelligenceType] = (byType[o.intelligenceType] ?? 0) + 1;

      // PROVENANCE RESOLVES AGAINST THE PACKAGE, NOT AGAINST THE CLAIM.
      for (const ref of projected.evidenceRefs) {
        const key = `${snap.id}:${ref}`;
        if (citedPassages.has(key)) continue;
        const item = evidenceById.get(ref);
        if (!item) {
          danglingCitations++;
          continue;
        }
        const manifest = manifestByRef.get(item.sourceRef);
        citedPassages.set(key, {
          snapshotId: snap.id,
          evidenceId: item.id,
          excerpt: item.excerpt,
          sourceRef: item.sourceRef,
          sourceType: manifest?.sourceType ?? null,
          observedAt: manifest?.observedAt ?? null,
          role: manifest?.role ?? null,
          status: manifest?.status ?? null,
          externalRef: item.externalRef ?? null,
          // Read off the evidence row's preserved fields, so the anchoring
          // the producer sent reaches the graph rather than stopping at the
          // transport.
          anchor: pickAnchor(item.data, item.extra),
          independence: pickIndependence(item),
        });
      }
    }

    // RELATIONS ARE NEVER RE-NORMALISED HERE.
    //
    // The bridge has already reversed the passive forms — `resolved_by` and
    // `superseded_by` arrive with their endpoints swapped into the active
    // relation. Inverting again would silently point every longitudinal
    // chain backwards, so `declared` is carried for the record and the
    // transported direction is taken as authoritative.
    for (const r of (pkg.intelligenceRelations ?? []) as IntelligenceRelationItem[]) {
      // READ IN THE PRODUCER'S VOCABULARY OR SIGNAL'S, whichever arrived.
      // A snapshot persisted through the validator carries Signal's; a raw
      // package straight off the bridge carries the producer's; both must
      // project to the same graph.
      const fromId = readRelationField(r, "from");
      const relName = readRelationField(r, "rel");
      const toId = readRelationField(r, "to");
      if (!fromId || !relName || !toId) continue;
      const from = admitted.get(fromId);
      if (!from) continue; // out of scope, or not this Scope's chain
      const to = admitted.get(toId);
      const cls = relClassOf({ rel: relName, relClass: readRelationField(r, "relClass") ?? undefined });
      relations.push({
        fromKey: from.key,
        toKey: to ? to.key : null,
        toExternalId: toId,
        rel: relName,
        relClass: cls,
        declared: rec(r.declared),
      });
      byRelClass[cls] = (byRelClass[cls] ?? 0) + 1;
    }
  }

  objects.sort((a, b) => a.key.localeCompare(b.key));
  relations.sort((a, b) =>
    a.fromKey === b.fromKey
      ? a.rel === b.rel
        ? a.toExternalId.localeCompare(b.toExternalId)
        : a.rel.localeCompare(b.rel)
      : a.fromKey.localeCompare(b.fromKey)
  );

  return {
    objects,
    relations,
    citedPassages: [...citedPassages.values()].sort((a, b) =>
      a.snapshotId === b.snapshotId
        ? a.evidenceId.localeCompare(b.evidenceId)
        : a.snapshotId.localeCompare(b.snapshotId)
    ),
    meta: {
      batchId,
      objectCount: objects.length,
      currentCount: objects.filter((o) => o.isCurrent).length,
      relationCount: relations.length,
      byType,
      byRelClass,
      outOfScope,
      scopeTags,
      danglingCitations,
    },
  };
}

/**
 * WHERE AN INTELLIGENCE OBJECT SITS — by what it MEANS, not where it came
 * from.
 *
 * The same law Requirements established against Notion: a Hermes Decision
 * is semantically about decisions even though its evidence came from a
 * transcript. Its provenance edges run outward to the passage and the
 * source artifact, which DO live in their source sector.
 *
 * Types with no existing semantic sector land on `hermes` — which is the
 * intelligence supply lane rather than a source-artifact sector, and is
 * therefore the honest home for "intelligence that is about the project
 * generally". No new sector is created: adding a ninth would rotate every
 * existing cluster and "Decisions is at the top" has to stay learnable.
 */
export function laneForIntelligenceType(intelligenceType: string): string {
  switch (normalizeIntelligenceType(intelligenceType)) {
    case "decision":
      return "decisions";
    case "dependency":
      return "dependencies";
    case "availabilityobservation":
      return "capacity";
    default:
      return "hermes";
  }
}

/**
 * A type string reduced to a comparison key. FOR ROUTING ONLY.
 *
 * The real corpus emits `availability_observation` and `climate_evidence`;
 * this module was first written against `AvailabilityObservation` and
 * `ClimateEvidence`. Matched exactly, every real object would have fallen
 * through to the `hermes` sector and the "seated by what it means" law would
 * have failed silently — a Hermes Decision sitting in the intelligence lane
 * rather than on the Decisions axis, with nothing to show it had gone wrong.
 *
 * The producer's exact string is NEVER rewritten. It rides on the node, it
 * is what the inspector prints, and it is what search matches. Only the
 * comparison is normalised.
 */
export function normalizeIntelligenceType(intelligenceType: string): string {
  return intelligenceType.toLowerCase().replace(/[\s_-]+/g, "");
}
