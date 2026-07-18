import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { completeJson, AUDIT_MODEL } from "@/lib/model";
import type { LinearIssueSummary } from "@/lib/linear";
import { buildEstimatePrompt, type EstimateCandidate } from "./prompts/estimates-v1";

const BATCH_SIZE = 25;

export const VALID_RELEVANCE = new Set(["core", "peripheral", "unrelated"]);
const VALID_FLAGS = new Set(["unclear_scope", "bigger_than_pointed", "smaller_than_pointed", "hidden_work"]);

// Hash of the fields that affect an estimate. If a ticket's content hasn't
// changed since it was last estimated, the stored estimate is still valid
// and the model is never called for it again.
// contextHash (see lib/estimate/context.ts) is mixed in when provided:
// a change to the release context or its Notion docs invalidates every
// estimate, since context legitimately changes every estimate.
export function estimateContentHash(
  issue: { title: string; description: string | null; estimate: number | null },
  contextHash?: string
): string {
  return createHash("sha256")
    .update(`${issue.title}\n${issue.description ?? ""}\n${issue.estimate ?? ""}\n${contextHash ?? ""}`)
    .digest("hex")
    .slice(0, 24);
}

// Findings are immutable once the audit writes them (title/quote/rationale
// never change), so title + hint is a stable identity for cache purposes.
export function findingContentHash(
  finding: { title: string; estimateHint: string | null },
  contextHash?: string
): string {
  return estimateContentHash(
    { title: finding.title, description: finding.estimateHint, estimate: null },
    contextHash
  );
}

// One unit of work to estimate, from any source -- a Linear issue today, a
// Finding from an audit, a Notion requirement row later.
export interface EstimateWorkInput {
  source: string; // "linear" | "finding" | future: "notion"
  externalId: string;
  contentHash: string;
  title: string;
  description: string | null;
  state: string;
  points: number | null;
  labels: string[];
}

interface RawEstimate {
  externalId?: unknown;
  lowDays?: unknown;
  likelyDays?: unknown;
  highDays?: unknown;
  relevance?: unknown;
  flags?: unknown;
  rationale?: unknown;
}

function num(value: unknown): number | null {
  return typeof value === "number" && isFinite(value) && value >= 0 ? value : null;
}

export interface EstimateRunSummary {
  total: number;
  estimated: number;
  cached: number;
  failed: number;
}

// Turns Linear issues into estimator inputs.
export function issueEstimateInputs(issues: LinearIssueSummary[], contextHash?: string): EstimateWorkInput[] {
  return issues.map((i) => ({
    source: "linear",
    externalId: i.identifier,
    contentHash: estimateContentHash(i, contextHash),
    title: i.title,
    description: i.description,
    state: i.state,
    points: i.estimate,
    labels: i.labels,
  }));
}

// Turns open audit findings (un-ticketed work) into estimator inputs --
// the finding's verbatim quote + rationale are the content the model reads.
export function findingEstimateInputs(
  findings: { id: string; title: string; quote: string; rationale: string; estimateHint: string | null }[],
  contextHash?: string
): EstimateWorkInput[] {
  return findings.map((f) => ({
    source: "finding",
    externalId: f.id,
    contentHash: findingContentHash(f, contextHash),
    title: f.title,
    description: `From a meeting transcript (no ticket exists yet). Evidence: "${f.quote}"\n${f.rationale}${
      f.estimateHint ? `\nTeam's rough hint: ${f.estimateHint}` : ""
    }`,
    state: "un-ticketed finding",
    points: null,
    labels: [],
  }));
}

// Estimates every work item that has no fresh cached estimate, in batches.
// Defensive per-item: a malformed entry drops that item, not the batch.
export async function runEstimation(
  scopeId: string,
  releaseContext: string,
  workInputs: EstimateWorkInput[]
): Promise<EstimateRunSummary> {
  const existing = await prisma.workEstimate.findMany({
    where: { scopeId },
    select: { source: true, externalId: true, contentHash: true },
  });
  const freshHashes = new Map(existing.map((e) => [`${e.source}:${e.externalId}`, e.contentHash]));

  const toEstimate = workInputs.filter(
    (w) => freshHashes.get(`${w.source}:${w.externalId}`) !== w.contentHash
  );
  const cached = workInputs.length - toEstimate.length;

  let estimated = 0;
  let failed = 0;

  for (let start = 0; start < toEstimate.length; start += BATCH_SIZE) {
    const batch = toEstimate.slice(start, start + BATCH_SIZE);
    const candidates: EstimateCandidate[] = batch.map((w) => ({
      externalId: w.externalId,
      title: w.title,
      description: w.description,
      state: w.state,
      points: w.points,
      labels: w.labels,
    }));

    let raw: RawEstimate[];
    try {
      raw = await completeJson<RawEstimate[]>({
        prompt: buildEstimatePrompt({ releaseContext, candidates }),
        maxTokens: 8000,
      });
      if (!Array.isArray(raw)) throw new Error("estimator did not return an array");
    } catch {
      failed += batch.length;
      continue;
    }

    const byId = new Map(
      raw
        .filter((r): r is RawEstimate & { externalId: string } => typeof r.externalId === "string")
        .map((r) => [r.externalId, r])
    );

    for (const work of batch) {
      const r = byId.get(work.externalId);
      const low = num(r?.lowDays);
      const likely = num(r?.likelyDays);
      const high = num(r?.highDays);
      const rationale = typeof r?.rationale === "string" ? r.rationale.trim() : "";
      if (!r || low === null || likely === null || high === null || !rationale) {
        failed += 1;
        continue;
      }

      const relevance =
        typeof r.relevance === "string" && VALID_RELEVANCE.has(r.relevance) ? r.relevance : "core";
      const flags = Array.isArray(r.flags)
        ? r.flags.filter((f): f is string => typeof f === "string" && VALID_FLAGS.has(f))
        : [];

      const fields = {
        contentHash: work.contentHash,
        lowDays: low,
        likelyDays: likely,
        highDays: high,
        relevance,
        flags,
        rationale,
        model: AUDIT_MODEL,
      };
      await prisma.workEstimate.upsert({
        where: {
          scopeId_source_externalId: { scopeId, source: work.source, externalId: work.externalId },
        },
        create: { scopeId, source: work.source, externalId: work.externalId, ...fields },
        update: { ...fields, createdAt: new Date() },
      });
      estimated += 1;
    }
  }

  return { total: workInputs.length, estimated, cached, failed };
}
