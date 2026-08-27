// WHY SIGNAL BELIEVES THIS.
//
// The chain a Finding can actually be traced back along, resolved from real
// rows. Nothing here is generated, summarised or paraphrased by a model:
// every excerpt is stored text, and every timestamp is one a producer
// recorded. Where a link in the chain does not exist, this module says so
// rather than closing the gap with something plausible.
//
// THE BOUNDARY THIS RESPECTS: provenance is not reasoning. Audit exposes
// where a claim came from — source, package, passage, excerpt — and never
// the model's own chain of thought. Those are different things and only one
// of them is checkable.
//
// The chain, in the order the inspector discloses it:
//
//   Finding
//     -> the Signal object it cites        (ContextSnapshot, or a Source row)
//       -> the Evidence Passage            (EvidenceItem within that package)
//         -> the original source           (manifest entry: system, role, when read)
//
// ledger.db is deliberately absent. It is a transport log, not provenance,
// and treating it as evidence is a boundary this product does not cross.

import type { ContextSnapshot, Finding, Source } from "@prisma/client";
import type { EvidenceItem, PackageSourceManifestEntry, ProjectContextPackage } from "@/lib/context/package";

/** One resolved passage: the words, and where they came from. */
export interface ProvenancePassage {
  evidenceId: string;
  excerpt: string;
  kind: string;
  /** The manifest entry this passage's sourceRef resolves to, when it does. */
  sourceRef: string;
  sourceType: string | null;
  role: string | null;
  status: string | null;
  /** When the underlying source was actually READ from its origin — the
      producer's own value, never this app's clock. Null when unstated. */
  observedAt: string | null;
  /** Durable pointer back to true origin (a Linear identifier, a Notion
      block id), when the producer carried one through. */
  externalRef: string | null;
  registrationId: string | null;
}

export type ProvenanceKind = "package" | "source" | "none";

export interface FindingProvenance {
  findingId: string;
  kind: ProvenanceKind;
  /** The quote the audit itself recorded on the Finding row. This is always
      present and is the claim's own anchor text. */
  quote: string;
  /** Package-derived provenance. */
  snapshot: {
    id: string;
    producer: string;
    packageId: string;
    /** When the PRODUCER assembled the package. */
    generatedAt: string | null;
    /** When this app accepted and froze it. */
    acceptedAt: string;
  } | null;
  passages: ProvenancePassage[];
  /** Source-derived provenance: a transcript or note someone pasted. */
  source: {
    id: string;
    kind: string;
    title: string;
    createdAt: string;
    /** The excerpt located within the pasted text, when the quote can be
        found in it. Null when the quote does not appear verbatim — which is
        itself worth showing rather than hiding. */
    locatedExcerpt: string | null;
  } | null;
  /** Linear identifiers the audit matched this claim against. */
  matchedIssues: string[];
  /** Cited evidence ids that could NOT be resolved in the snapshot. Should
      normally be empty — runAudit intersects against real evidence before
      persisting — but a snapshot is immutable and a package could still be
      malformed, so an unresolvable pointer is reported, never dropped. */
  unresolvedRefs: string[];
}

const CONTEXT_CHARS = 220;

/** Pull the stored quote out of the pasted source with a little surrounding
    context, so the inspector can show the passage in situ. Returns null when
    the quote is not present verbatim. */
function locateExcerpt(content: string, quote: string): string | null {
  const needle = quote.trim().replace(/^["“”']+|["“”']+$/g, "");
  if (!needle) return null;
  const idx = content.indexOf(needle);
  if (idx < 0) return null;
  const from = Math.max(0, idx - CONTEXT_CHARS / 2);
  const to = Math.min(content.length, idx + needle.length + CONTEXT_CHARS / 2);
  return `${from > 0 ? "…" : ""}${content.slice(from, to).trim()}${to < content.length ? "…" : ""}`;
}

export function resolveProvenance(
  finding: Finding,
  snapshot: ContextSnapshot | null,
  source: Source | null
): FindingProvenance {
  const passages: ProvenancePassage[] = [];
  const unresolvedRefs: string[] = [];
  let snapshotOut: FindingProvenance["snapshot"] = null;

  if (snapshot && finding.evidenceRefs.length > 0) {
    const pkg = snapshot.package as unknown as ProjectContextPackage;
    const byId = new Map<string, EvidenceItem>((pkg.evidence ?? []).map((e) => [e.id, e]));
    const manifestByRef = new Map<string, PackageSourceManifestEntry>(
      (pkg.sources ?? []).map((s) => [s.sourceRef, s])
    );

    for (const ref of finding.evidenceRefs) {
      const item = byId.get(ref);
      if (!item) {
        unresolvedRefs.push(ref);
        continue;
      }
      const manifest = manifestByRef.get(item.sourceRef) ?? null;
      passages.push({
        evidenceId: item.id,
        excerpt: item.excerpt,
        kind: item.kind,
        sourceRef: item.sourceRef,
        sourceType: manifest?.sourceType ?? null,
        role: manifest?.role ?? null,
        status: manifest?.status ?? null,
        observedAt: manifest?.observedAt ?? null,
        externalRef: item.externalRef ?? null,
        registrationId: manifest?.registrationId ?? null,
      });
    }

    snapshotOut = {
      id: snapshot.id,
      producer: snapshot.producer,
      packageId: snapshot.packageId,
      generatedAt: pkg.generatedAt ?? null,
      acceptedAt: snapshot.createdAt.toISOString(),
    };
  }

  const sourceOut: FindingProvenance["source"] = source
    ? {
        id: source.id,
        kind: source.kind,
        title: source.title,
        createdAt: source.createdAt.toISOString(),
        locatedExcerpt: locateExcerpt(source.content, finding.quote),
      }
    : null;

  const kind: ProvenanceKind = passages.length > 0 ? "package" : sourceOut ? "source" : "none";

  return {
    findingId: finding.id,
    kind,
    quote: finding.quote,
    snapshot: snapshotOut,
    passages,
    source: sourceOut,
    matchedIssues: finding.matchedIssues,
    unresolvedRefs,
  };
}

/** A short, honest statement of how well grounded a Finding is.
 *
 * THIS IS NOT A CONFIDENCE SCORE, and deliberately so. The Finding model
 * carries no confidence column, and the concept images' "92%" would be an
 * unfalsifiable number invented to fill a slot — the exact class of claim
 * docs/CONTROL-ROOM-TRUTH-AUDIT.md removed from the Control Room. What CAN
 * be stated is what the citation actually is, and that is what this returns.
 */
export function groundingLabel(p: FindingProvenance): { label: string; detail: string } {
  if (p.kind === "package") {
    const n = p.passages.length;
    return {
      label: `Cited · ${n} passage${n === 1 ? "" : "s"}`,
      detail: `Grounded in package evidence from ${p.snapshot?.producer ?? "an accepted package"}.`,
    };
  }
  if (p.kind === "source") {
    return {
      label: p.source?.locatedExcerpt ? "Quoted · source located" : "Quoted · source attached",
      detail: p.source?.locatedExcerpt
        ? `The quote appears verbatim in "${p.source.title}".`
        : `Raised against "${p.source?.title}", but the quote is not a verbatim match in it.`,
    };
  }
  return {
    label: "Uncited",
    detail: "No package evidence and no attached source stand behind this finding.",
  };
}
