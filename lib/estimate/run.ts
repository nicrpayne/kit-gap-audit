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
export function estimateContentHash(issue: {
  title: string;
  description: string | null;
  estimate: number | null;
}): string {
  return createHash("sha256")
    .update(`${issue.title}\n${issue.description ?? ""}\n${issue.estimate ?? ""}`)
    .digest("hex")
    .slice(0, 24);
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

// Estimates every issue that has no fresh cached estimate, in batches.
// Defensive per-item: a malformed entry drops that item, not the batch.
export async function runEstimation(
  scopeId: string,
  releaseContext: string,
  issues: LinearIssueSummary[]
): Promise<EstimateRunSummary> {
  const existing = await prisma.workEstimate.findMany({
    where: { scopeId, source: "linear" },
    select: { externalId: true, contentHash: true },
  });
  const freshHashes = new Map(existing.map((e) => [e.externalId, e.contentHash]));

  const toEstimate = issues.filter((i) => freshHashes.get(i.identifier) !== estimateContentHash(i));
  const cached = issues.length - toEstimate.length;

  let estimated = 0;
  let failed = 0;

  for (let start = 0; start < toEstimate.length; start += BATCH_SIZE) {
    const batch = toEstimate.slice(start, start + BATCH_SIZE);
    const candidates: EstimateCandidate[] = batch.map((i) => ({
      externalId: i.identifier,
      title: i.title,
      description: i.description,
      state: i.state,
      points: i.estimate,
      labels: i.labels,
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

    for (const issue of batch) {
      const r = byId.get(issue.identifier);
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

      await prisma.workEstimate.upsert({
        where: { scopeId_source_externalId: { scopeId, source: "linear", externalId: issue.identifier } },
        create: {
          scopeId,
          source: "linear",
          externalId: issue.identifier,
          contentHash: estimateContentHash(issue),
          lowDays: low,
          likelyDays: likely,
          highDays: high,
          relevance,
          flags,
          rationale,
          model: AUDIT_MODEL,
        },
        update: {
          contentHash: estimateContentHash(issue),
          lowDays: low,
          likelyDays: likely,
          highDays: high,
          relevance,
          flags,
          rationale,
          model: AUDIT_MODEL,
          createdAt: new Date(),
        },
      });
      estimated += 1;
    }
  }

  return { total: issues.length, estimated, cached, failed };
}
