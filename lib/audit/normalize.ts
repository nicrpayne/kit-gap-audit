export type FindingType = "missing_work" | "decision" | "risk" | "contradiction";
export type Severity = "high" | "medium" | "low";

export interface NormalizedFinding {
  type: FindingType;
  title: string;
  quote: string;
  rationale: string;
  severity: Severity;
  estimateHint: string | null;
  owner: string | null;
  blocks: string | null;
  blocking: boolean;
  matchedIssues: string[];
  // EvidenceItem ids (from an accepted ProjectContextPackage, see
  // lib/context/package.ts) the model cited as grounding this finding.
  // Empty for a finding grounded only in a pasted transcript/notes
  // paragraph -- callers are responsible for further intersecting this
  // against the actual package's evidence ids before trusting it (a model
  // could hallucinate an id that was never shown to it).
  evidenceRefs: string[];
}

const VALID_TYPES = new Set<FindingType>(["missing_work", "decision", "risk", "contradiction"]);
const VALID_SEVERITIES = new Set<Severity>(["high", "medium", "low"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Defensive parsing of the model's raw JSON: coerce what's plausible, drop
// any finding missing a required field rather than failing the whole run.
export function normalizeFindings(raw: unknown): NormalizedFinding[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected the model to return a JSON array of findings");
  }

  const findings: NormalizedFinding[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;

    const type = str(r.type);
    const title = str(r.title);
    const quote = str(r.quote);
    const rationale = str(r.rationale);
    if (!type || !VALID_TYPES.has(type as FindingType) || !title || !quote || !rationale) continue;

    const severityRaw = str(r.severity);
    const severity: Severity =
      severityRaw && VALID_SEVERITIES.has(severityRaw as Severity) ? (severityRaw as Severity) : "medium";

    findings.push({
      type: type as FindingType,
      title,
      quote,
      rationale,
      severity,
      estimateHint: str(r.estimateHint),
      owner: str(r.owner),
      blocks: str(r.blocks),
      blocking: r.blocking === true,
      matchedIssues: Array.isArray(r.matchedIssues)
        ? r.matchedIssues.filter((x): x is string => typeof x === "string")
        : [],
      evidenceRefs: Array.isArray(r.evidenceRefs)
        ? r.evidenceRefs.filter((x): x is string => typeof x === "string")
        : [],
    });
  }

  return findings.slice(0, 15);
}
