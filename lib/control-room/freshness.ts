/**
 * Freshness vocabulary for the Control Room.
 *
 * These dates answer different questions and must never be collapsed into
 * one "oldest data" grade:
 *
 * - a read receipt says when Signal successfully received/recomputed data;
 * - a source observation says when the producer actually read the origin;
 * - a saved Report says when somebody froze a communication artifact;
 * - the Linear input basis says when the least-recent project input changed.
 *
 * An old source observation can still be the correct historical evidence.
 * Re-reading or packaging it does not change that source-owned date.
 */

const DAY = 86_400_000;

export type FreshnessKind = "read_receipt" | "source_observation" | "saved_report";

export interface ControlRoomRefreshReceipt {
  scopeId: string;
  scopeName: string;
  /** Signal's successful receipt/persistence time, not a source date. */
  lastPackageAt: string | null;
  /** Producer-owned origin read times, preserved across packaging. */
  evidenceObservedAt: { oldest: string | null; newest: string | null };
  latestRun: { status: string; completedAt: string | null } | null;
  error?: string | null;
}

export interface FreshnessRow {
  id: string;
  label: string;
  kind: FreshnessKind;
  state: string;
  at: Date | null;
  ageDays: number | null;
  href: string;
}

export interface ControlRoomFreshness {
  rows: FreshnessRow[];
  /** Only successful read receipts participate. Source/report age cannot
      make the live computation look stale. */
  oldestSuccessfulRead: FreshnessRow | null;
  missingPackageScopeNames: string[];
}

function validDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function ageDays(now: Date, at: Date | null): number | null {
  return at ? Math.max(0, (now.getTime() - at.getTime()) / DAY) : null;
}

function minDate(values: (string | Date | null | undefined)[]): Date | null {
  const dates = values.map(validDate).filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}

function maxDate(values: (string | Date | null | undefined)[]): Date | null {
  const dates = values.map(validDate).filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}

export function readControlRoomFreshness(input: {
  now: Date;
  dataReceivedAt: Date;
  lastReportAt: Date | null;
  refreshReceipts: ControlRoomRefreshReceipt[] | null;
  /** Context observations from Timeline are a fallback for projects without
      activation-era receipt metadata. They are origin reads, never package
      receipt times. */
  contextObservedAt: Date[];
}): ControlRoomFreshness {
  const rows: FreshnessRow[] = [];
  const projectReadAt = validDate(input.dataReceivedAt);
  rows.push({
    id: "project-read",
    label: "Linear + project read",
    kind: "read_receipt",
    state: "Current page receipt",
    at: projectReadAt,
    ageDays: ageDays(input.now, projectReadAt),
    href: "/portfolio",
  });

  const missingPackageScopeNames: string[] = [];
  if (input.refreshReceipts !== null) {
    const packageDates: Date[] = [];
    for (const receipt of input.refreshReceipts) {
      const packageAt = validDate(receipt.lastPackageAt);
      if (packageAt) packageDates.push(packageAt);
      else missingPackageScopeNames.push(receipt.scopeName);
    }
    const oldestPackageAt = minDate(packageDates);
    rows.push({
      id: "knowledge-ingestion",
      label: "Knowledge package",
      kind: "read_receipt",
      state: missingPackageScopeNames.length
        ? `${missingPackageScopeNames.length} ${missingPackageScopeNames.length === 1 ? "project has" : "projects have"} no successful package receipt`
        : `Oldest successful receipt across ${input.refreshReceipts.length} ${input.refreshReceipts.length === 1 ? "project" : "projects"}`,
      at: oldestPackageAt,
      ageDays: ageDays(input.now, oldestPackageAt),
      href: "/audit",
    });
  }

  const receiptObservedOldest = (input.refreshReceipts ?? []).map((receipt) => receipt.evidenceObservedAt.oldest);
  const receiptObservedNewest = (input.refreshReceipts ?? []).map((receipt) => receipt.evidenceObservedAt.newest);
  const hasCurrentObservationManifest = [...receiptObservedOldest, ...receiptObservedNewest].some((value) => validDate(value));
  // Once current receipt metadata is available, do not mix earlier Timeline
  // snapshots into it. Those remain valid history, but they no longer
  // describe the sources behind the current accepted package.
  const observedOldest = minDate(hasCurrentObservationManifest ? receiptObservedOldest : input.contextObservedAt);
  const observedNewest = maxDate(hasCurrentObservationManifest ? receiptObservedNewest : input.contextObservedAt);
  if (observedOldest || observedNewest) {
    rows.push({
      id: "source-observations",
      label: "Underlying source reads",
      kind: "source_observation",
      state: observedOldest && observedNewest && observedOldest.getTime() !== observedNewest.getTime()
        ? `Historical range ${observedOldest.toISOString()} to ${observedNewest.toISOString()}; not sync health`
        : "Historical source date; not sync health",
      at: observedOldest ?? observedNewest,
      ageDays: ageDays(input.now, observedOldest ?? observedNewest),
      href: "/audit",
    });
  }

  const lastReportAt = validDate(input.lastReportAt);
  rows.push({
    id: "saved-report",
    label: "Saved forecast report",
    kind: "saved_report",
    state: lastReportAt ? "Immutable saved artifact" : "No saved report",
    at: lastReportAt,
    ageDays: ageDays(input.now, lastReportAt),
    href: "/reports",
  });

  const successfulReads = rows.filter((row) => row.kind === "read_receipt" && row.at !== null);
  const oldestSuccessfulRead = successfulReads.length
    ? successfulReads.reduce((oldest, row) => row.at!.getTime() < oldest.at!.getTime() ? row : oldest)
    : null;

  return { rows, oldestSuccessfulRead, missingPackageScopeNames };
}
