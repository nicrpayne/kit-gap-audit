// DERIVED CLAIMS -> TIMELINE EVENT CANDIDATES.
//
// The same boundary lib/decisions/candidates.ts draws, for the same
// reason: a DerivedClaim is inert. "KIT Construct Electric kicked off" is
// a machine's reading of a transcript, not a fact about the project. It
// becomes a candidate; a human accepting it is what creates Reality.
//
// THE DATE PROBLEM, and why most candidates arrive dateless.
//
// DerivedClaim carries no date field. Inferring one from the statement
// ("we kicked off last week") would be the model inventing history, which
// is precisely what Timeline exists to avoid. So a date is taken ONLY from
// structured evidence metadata that honestly supplies one -- an evidence
// item whose `data.occurredOn` (or a close, equally explicit sibling) is a
// real date. Otherwise the candidate is dateless and waits in Event Intake
// until Nic supplies the date. Acceptance without a date is refused.

import { prisma } from "@/lib/prisma";
import type { ProjectContextPackage, JsonValue } from "@/lib/context/package";

// A closed vocabulary, matched against the open `kind` field a producer
// emits. Anything else is skipped rather than swept in.
const TIMELINE_KINDS = new Set([
  "timeline_event",
  "event",
  "milestone",
  "kickoff",
  "delivery",
  "phase",
]);

const normalise = (k: string) => k.toLowerCase().replace(/[\s-]+/g, "_");
export const isTimelineKind = (kind: string) => TIMELINE_KINDS.has(normalise(kind));

/** The landmark kind a claim maps to. `timeline_event`/`event` are generic;
    the more specific words survive as themselves. */
export function landmarkKindFor(kind: string): string {
  const k = normalise(kind);
  return k === "timeline_event" ? "event" : k;
}

/** Only an explicit, parseable date in structured evidence metadata counts.
    Never the statement prose. */
export function dateFromEvidence(
  data: Record<string, JsonValue> | undefined
): Date | null {
  if (!data) return null;
  for (const key of ["occurredOn", "occurred_on", "occurredAt", "eventDate"]) {
    const v = data[key];
    if (typeof v !== "string") continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** The same rule for the other end. A duration is only ever as good as the
    evidence that stated it, so there is no fallback: no explicit end means
    no span, and the candidate arrives as a moment rather than as a guess
    dressed up as an activity. Only consulted once a start date was found —
    an end without a beginning is not a duration. */
export function endDateFromEvidence(
  data: Record<string, JsonValue> | undefined
): Date | null {
  if (!data) return null;
  for (const key of ["endsOn", "ends_on", "endedOn", "endDate", "concludedOn"]) {
    const v = data[key];
    if (typeof v !== "string") continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export interface TimelineHarvestResult {
  scannedSnapshots: number;
  imported: number;
  alreadyKnown: number;
  skippedKind: number;
  dated: number;
  dateless: number;
}

/** Stable across re-imports: snapshot ids are immutable and claim ids are
    unique within one. Prefixed so it can never collide with a Decision
    candidate's key. */
export function timelineClaimKeyFor(snapshotId: string, claimId: string): string {
  return `timeline:${snapshotId}:${claimId}`;
}

export async function harvestTimelineCandidates(
  where: { id?: string; scopeId?: string } = {}
): Promise<TimelineHarvestResult> {
  const snapshots = await prisma.contextSnapshot.findMany({
    where,
    select: { id: true, scopeId: true, producer: true, package: true },
    orderBy: { createdAt: "asc" },
  });

  const result: TimelineHarvestResult = {
    scannedSnapshots: snapshots.length,
    imported: 0,
    alreadyKnown: 0,
    skippedKind: 0,
    dated: 0,
    dateless: 0,
  };

  for (const snap of snapshots) {
    const pkg = snap.package as unknown as ProjectContextPackage;
    const evidenceById = new Map((pkg.evidence ?? []).map((e) => [e.id, e]));
    const firstSource = pkg.sources?.[0];
    const sourceLabel = firstSource ? `${snap.producer} · ${firstSource.sourceRef}` : snap.producer;

    for (const claim of pkg.derivedClaims ?? []) {
      if (!isTimelineKind(claim.kind)) {
        result.skippedKind++;
        continue;
      }
      const claimKey = timelineClaimKeyFor(snap.id, claim.id);
      if (await prisma.timelineEventCandidate.findUnique({ where: { claimKey }, select: { id: true } })) {
        result.alreadyKnown++;
        continue;
      }
      const cited = claim.evidenceRefs
        .map((r) => evidenceById.get(r))
        .filter((e): e is NonNullable<typeof e> => e !== undefined);
      // First evidence item that honestly states a date wins. No prose.
      let date: Date | null = null;
      let endDate: Date | null = null;
      for (const e of cited) {
        date = dateFromEvidence(e.data);
        if (date) {
          // The end, if any, comes from the SAME evidence item that supplied
          // the start. Stitching a start from one note to an end from
          // another would be the model composing a duration nobody stated.
          endDate = endDateFromEvidence(e.data);
          break;
        }
      }
      if (endDate && date && endDate.getTime() <= date.getTime()) endDate = null;
      await prisma.timelineEventCandidate.create({
        data: {
          claimKey,
          scopeId: snap.scopeId,
          title: claim.statement,
          date,
          endDate,
          kind: landmarkKindFor(claim.kind),
          sourceLabel,
          contextSnapshotId: snap.id,
          evidenceRefs: claim.evidenceRefs,
          excerpts: cited.map((e) => e.excerpt),
          status: "pending",
        },
      });
      result.imported++;
      if (date) result.dated++;
      else result.dateless++;
    }
  }

  return result;
}
