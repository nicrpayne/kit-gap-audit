import type { EstimateRunSummary } from "@/lib/estimate/run";

export type EstimateRunStatus = "complete" | "partial" | "failed";

export interface EstimateRunReceipt extends EstimateRunSummary {
  status: EstimateRunStatus;
  complete: boolean;
  detail: string;
}

function items(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

// Provider and malformed-output failures are intentionally counted by
// runEstimation instead of thrown. Turn those counts into an explicit stage
// outcome so a resolved promise cannot be mistaken for a fully successful
// estimation pass.
export function estimateRunReceipt(summary: EstimateRunSummary): EstimateRunReceipt {
  if (summary.failed === 0) {
    return {
      ...summary,
      status: "complete",
      complete: true,
      detail: summary.total === 0
        ? "Estimation complete: no open work items required estimation."
        : `Estimation complete: ${items(summary.estimated)} updated and ${items(summary.cached)} unchanged, reused.`,
    };
  }

  const preserved = summary.estimated + summary.cached;
  if (preserved === 0) {
    return {
      ...summary,
      status: "failed",
      complete: false,
      detail: `Estimation failed: all ${items(summary.failed)} requiring an estimator result failed. No new estimates were produced. Stored estimates and accepted reviewed capability estimates were not invalidated; re-run to retry.`,
    };
  }

  return {
    ...summary,
    status: "partial",
    complete: false,
    detail: `Estimation partial: ${items(summary.failed)} failed; ${items(summary.estimated)} updated and ${items(summary.cached)} unchanged, reused. Stored estimates and accepted reviewed capability estimates were not invalidated; re-run to retry the failed items.`,
  };
}

