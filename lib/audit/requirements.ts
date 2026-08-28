// WHAT THE PROJECT SAYS MUST BE TRUE — projected, not stored.
//
// A REQUIREMENT IS A SEMANTIC ENTITY. A SOURCE IS WHERE WE LEARNED IT.
// Keeping those apart is the whole point of this file:
//
//   Requirement  "Conflict resolution for offline submissions must be
//                 handled before field pilot"          ← what the project means
//   Passage      notion-scope-row-14                   ← the row we read
//   Source       "JSA delivery scope"                  ← where we read it
//
// Three nodes, one underlying row, joined by attested edges. Collapsing them
// would make "which requirements came from the scope doc" and "which
// requirements exist" the same question, and they are not — which is exactly
// the shape a transcript node will need later.
//
// ── THE GROUNDING LAW ─────────────────────────────────────────────────
//
//   An EvidenceItem becomes a Requirement if, and only if, its `sourceRef`
//   resolves to a manifest entry whose ROLE is `requirements_of_record`.
//
// That role is a validated, closed vocabulary — the API refuses any other
// value (app/api/source-registrations/route.ts) — and it is persisted inside
// the immutable snapshot. So the projection is structural: no text matching,
// no keyword rules, no page-name conventions, no model inference. Delete
// this file and rebuild it and you get the same requirements, because the
// answer is in the data rather than in a heuristic.
//
// ── WHAT THIS IS NOT ──────────────────────────────────────────────────
//
// NOT a second canonical requirements store. Nothing here is written, read
// back, or trusted as a source of truth. The Signal Graph remains a derived
// projection; these rows are rebuilt from the snapshot every time.
//
// And NOT a claim of authority. The role says "this source is the place
// requirements are recorded". It does not say the source is approved policy —
// see `sourceStatus`, which on the current JSA package is `candidate` with no
// SourceRegistration row behind it. The inspector says so out loud.

import type {
  ProjectContextPackage,
  PackageSourceManifestEntry,
  JsonValue,
} from "@/lib/context/package";

/** The one manifest role that produces Requirement nodes. */
export const REQUIREMENT_SOURCE_ROLE = "requirements_of_record";

export interface ProjectedRequirement {
  /** The snapshot this requirement was read from. Part of its identity. */
  snapshotId: string;
  /** EvidenceItem.id — stable only WITHIN this snapshot, hence the pairing. */
  evidenceId: string;
  scopeId: string;
  /** The requirement itself, as the source states it. */
  statement: string;
  /** EvidenceItem.kind — "row", "block", … Reported, never interpreted. */
  evidenceKind: string;
  sourceRef: string;
  sourceType: string | null;
  /** Always REQUIREMENT_SOURCE_ROLE; carried so the node can show its own
      grounding rather than the reader having to know the rule. */
  sourceRole: string;
  /** `candidate` | `active` | `paused` | … The honest limit on how much
      authority this requirement carries. */
  sourceStatus: string;
  /** Null for a structural or unregistered source — which is the current
      state of every JSA source, and worth showing. */
  registrationId: string | null;
  /** When the producer last actually READ the source. Never this app's clock. */
  observedAt: string | null;
  /** The producer's own status for the row, when it carried one — e.g.
      "Committed". Read from the generic `data` escape hatch, so it is a
      producer convention rather than a schema guarantee. Reported verbatim
      and never mapped onto a Signal state. */
  dataStatus: string | null;
  /** The producer's own grouping for the row, when it carried one. NEVER used
      to link a requirement to a Feature — see the note on `implemented_by`. */
  section: string | null;
  /**
   * THE FUTURE SEAM, AND IT IS DELIBERATELY INERT.
   *
   * `EvidenceItem.externalRef` is documented as "the closest durable pointer
   * back to true origin (a Linear identifier, a Notion block id)". If a
   * requirements producer ever populates it with a Linear identifier, that is
   * the attested grounding an `implemented_by` edge would need — no Signal
   * schema change, no new store. Nothing reads it for that purpose today, and
   * nothing here invents one when it is absent.
   */
  externalRef: string | null;
}

/** One snapshot, as this projection needs it. */
export interface RequirementSnapshotInput {
  id: string;
  scopeId: string;
  package: unknown;
}

function str(v: JsonValue | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Every requirement one Scope's snapshots record.
 *
 * Pure and total: a malformed package yields no requirements rather than
 * throwing, because a snapshot is immutable and the graph must still build
 * around one that cannot be read.
 *
 * Ordered by (snapshotId, evidenceId) so the projection is deterministic —
 * two runs over the same rows produce the same list in the same order.
 */
export function projectRequirements(snapshots: RequirementSnapshotInput[]): ProjectedRequirement[] {
  const out: ProjectedRequirement[] = [];

  for (const snap of snapshots) {
    const pkg = snap.package as ProjectContextPackage | null;
    if (!pkg || !Array.isArray(pkg.evidence) || !Array.isArray(pkg.sources)) continue;

    // Only the manifest entries that DECLARE themselves the requirements of
    // record. Everything else in the package — design references, raw
    // transcripts, operational trackers — is evidence, not requirement.
    const ofRecord = new Map<string, PackageSourceManifestEntry>();
    for (const s of pkg.sources) {
      if (s.role === REQUIREMENT_SOURCE_ROLE) ofRecord.set(s.sourceRef, s);
    }
    if (ofRecord.size === 0) continue;

    for (const item of pkg.evidence) {
      const manifest = ofRecord.get(item.sourceRef);
      if (!manifest) continue;
      const data = item.data ?? {};
      out.push({
        snapshotId: snap.id,
        evidenceId: item.id,
        scopeId: snap.scopeId,
        statement: item.excerpt,
        evidenceKind: item.kind,
        sourceRef: item.sourceRef,
        sourceType: manifest.sourceType ?? null,
        sourceRole: manifest.role ?? REQUIREMENT_SOURCE_ROLE,
        sourceStatus: manifest.status,
        registrationId: manifest.registrationId ?? null,
        observedAt: manifest.observedAt ?? null,
        dataStatus: str(data.status),
        section: str(data.section),
        externalRef: item.externalRef ?? null,
      });
    }
  }

  out.sort((a, b) =>
    a.snapshotId === b.snapshotId
      ? a.evidenceId.localeCompare(b.evidenceId)
      : a.snapshotId.localeCompare(b.snapshotId)
  );
  return out;
}

/**
 * A short label for a requirement, for the places a full statement will not
 * fit. The statement itself is never rewritten — this only trims it.
 */
export function requirementLabel(r: ProjectedRequirement, max = 64): string {
  const s = r.statement.trim().replace(/^["“”']+|["“”']+$/g, "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
