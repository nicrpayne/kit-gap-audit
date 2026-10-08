import type { ThreePoint } from "./features";

/** Operator judgment is not a transcript quote, a Linear estimate, or proof
 * that another project's implementation can be reused unchanged. */
export interface SignalEstimateInput {
  alreadyDone: string;
  reuseFrom: string;
  remainingWork: string;
  rationale: string;
  evidenceReference: string;
  asOfDate: string;
  reviewerDisplayName: string;
  range: ThreePoint;
  coveredOpenItemIds: string[];
  additionalOpenItemIds: string[];
}

export interface AcceptedSignalEstimate {
  version: "signal-remaining-estimate.v1";
  id: string;
  capabilityId: string;
  capabilityRevisionAtReview: number;
  basis: "remaining_capability";
  unit: "developer_days";
  provenance: "operator_judgment";
  input: SignalEstimateInput;
  acceptedAt: string;
}

export const isSignalEstimate = (value: unknown): value is AcceptedSignalEstimate => Boolean(value && typeof value === "object" && (value as AcceptedSignalEstimate).version === "signal-remaining-estimate.v1");

export function parseSignalEstimateInput(value: unknown): SignalEstimateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A remaining-work estimate is required.");
  const row = value as Record<string, unknown>;
  const text = (key: string, required = false) => {
    if (typeof row[key] !== "string" || (row[key] as string).length > 8000) throw new Error(`${key} must be text (up to 8,000 characters).`);
    const result = (row[key] as string).trim();
    if (required && !result) throw new Error(`${key} is required.`);
    return result;
  };
  const ids = (key: string) => {
    const list = row[key];
    if (!Array.isArray(list) || list.some(id => typeof id !== "string" || !id.trim()) || new Set(list).size !== list.length) throw new Error(`${key} must contain unique ticket IDs.`);
    const normalized = (list as string[]).map(id => id.trim()).sort();
    if (new Set(normalized).size !== normalized.length) throw new Error(`${key} must contain unique ticket IDs.`);
    return normalized;
  };
  const range = row.range as ThreePoint | undefined;
  if (!range || ![range.low, range.likely, range.high].every(n => typeof n === "number" && Number.isFinite(n)) || range.low < 0 || range.likely <= 0 || range.low > range.likely || range.likely > range.high || range.high > 10000) throw new Error("Enter remaining developer-days: 0 ≤ best ≤ likely ≤ worst, with likely greater than zero.");
  const asOfDate = text("asOfDate", true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !Number.isFinite(Date.parse(asOfDate)) || new Date(asOfDate).toISOString().slice(0, 10) !== asOfDate) throw new Error("Choose a valid estimate date.");
  const coveredOpenItemIds = ids("coveredOpenItemIds"), additionalOpenItemIds = ids("additionalOpenItemIds");
  if (coveredOpenItemIds.some(id => additionalOpenItemIds.includes(id))) throw new Error("A ticket cannot be both covered and additional.");
  return { alreadyDone: text("alreadyDone"), reuseFrom: text("reuseFrom"), remainingWork: text("remainingWork", true), rationale: text("rationale", true), evidenceReference: text("evidenceReference"), asOfDate, reviewerDisplayName: text("reviewerDisplayName", true), range: {low: range.low, likely: range.likely, high: range.high}, coveredOpenItemIds, additionalOpenItemIds };
}

export function signalEstimateBoundaryMatches(input: SignalEstimateInput, openIds: string[]): boolean {
  const reviewed = [...input.coveredOpenItemIds, ...input.additionalOpenItemIds].sort();
  const current = [...new Set(openIds)].sort();
  return reviewed.length === current.length && reviewed.every((id, index) => id === current[index]);
}

export function makeSignalEstimate(capabilityId: string, revision: number, input: unknown, openIds: string[], id: string, acceptedAt = new Date().toISOString()): AcceptedSignalEstimate {
  const parsed = parseSignalEstimateInput(input);
  if (!capabilityId || !id || !Number.isInteger(revision) || revision < 0) throw new Error("A current capability revision is required.");
  if (!signalEstimateBoundaryMatches(parsed, openIds)) throw new Error("The linked open tickets changed. Review which tickets this estimate covers before saving.");
  if (openIds.length && !parsed.coveredOpenItemIds.length) throw new Error("Select at least one ticket covered by this remaining-work estimate.");
  return { version: "signal-remaining-estimate.v1", id, capabilityId, capabilityRevisionAtReview: revision, basis: "remaining_capability", unit: "developer_days", provenance: "operator_judgment", input: parsed, acceptedAt };
}

export function parseSignalEstimate(value: unknown): AcceptedSignalEstimate | null {
  if (!isSignalEstimate(value) || value.basis !== "remaining_capability" || value.unit !== "developer_days" || value.provenance !== "operator_judgment" || !Number.isFinite(Date.parse(value.acceptedAt))) return null;
  try { return makeSignalEstimate(value.capabilityId, value.capabilityRevisionAtReview, value.input, [...value.input.coveredOpenItemIds, ...value.input.additionalOpenItemIds], value.id, value.acceptedAt); } catch { return null; }
}
