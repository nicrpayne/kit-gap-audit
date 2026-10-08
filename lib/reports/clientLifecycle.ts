export type ReportLiveForecastGate = "pending" | "unavailable" | "incomplete" | "ready";

export type ReportLiveForecastState =
  | null
  | { state: "loading" }
  | { state: "error"; reason: string }
  | { state: "ready"; coverageState: "forecastable" | "modeled_subset" | "unavailable" };

export interface ClientReportRow {
  id: string;
  generatedAt: string;
  targetDate: string | null;
  likelyDate: string;
  confidenceAtTarget: number | null;
  likelyDateDeltaDays: number | null;
  shippedCount: number;
  blockingCount: number;
  resolvedSinceLastCount: number;
  summaryMarkdown: string;
  briefVersion: string | null;
  briefSnapshot: unknown;
  mode: string | null;
  recipeVersion: string | null;
  briefRecipe: unknown;
  presentationVersion: string | null;
  scenarioSnapshot: unknown;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableFiniteNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number" && Number.isFinite(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function classifyReportLiveForecast(value: ReportLiveForecastState): ReportLiveForecastGate {
  if (value === null || value.state === "loading") return "pending";
  if (value.state === "error") return "unavailable";
  return value.coverageState === "forecastable" ? "ready" : "incomplete";
}

export function parseClientReportRow(value: unknown): ClientReportRow {
  const row = object(value);
  if (!row ||
    typeof row.id !== "string" || !row.id ||
    typeof row.generatedAt !== "string" || !Number.isFinite(Date.parse(row.generatedAt)) ||
    !nullableString(row.targetDate) || (typeof row.targetDate === "string" && !Number.isFinite(Date.parse(row.targetDate))) ||
    typeof row.likelyDate !== "string" || !Number.isFinite(Date.parse(row.likelyDate)) ||
    !nullableFiniteNumber(row.confidenceAtTarget) ||
    !nullableFiniteNumber(row.likelyDateDeltaDays) ||
    !finiteNumber(row.shippedCount) ||
    !finiteNumber(row.blockingCount) ||
    !finiteNumber(row.resolvedSinceLastCount) ||
    typeof row.summaryMarkdown !== "string" ||
    !nullableString(row.briefVersion) ||
    !nullableString(row.mode) ||
    !nullableString(row.recipeVersion) ||
    !nullableString(row.presentationVersion)
  ) {
    throw new Error("Report history returned an invalid saved report row.");
  }
  return {
    id: row.id,
    generatedAt: row.generatedAt,
    targetDate: row.targetDate,
    likelyDate: row.likelyDate,
    confidenceAtTarget: row.confidenceAtTarget,
    likelyDateDeltaDays: row.likelyDateDeltaDays,
    shippedCount: row.shippedCount,
    blockingCount: row.blockingCount,
    resolvedSinceLastCount: row.resolvedSinceLastCount,
    summaryMarkdown: row.summaryMarkdown,
    briefVersion: row.briefVersion,
    briefSnapshot: row.briefSnapshot,
    mode: row.mode,
    recipeVersion: row.recipeVersion,
    briefRecipe: row.briefRecipe,
    presentationVersion: row.presentationVersion,
    scenarioSnapshot: row.scenarioSnapshot,
  };
}

export function parseReportHistoryEnvelope(value: unknown): ClientReportRow[] {
  const envelope = object(value);
  if (!envelope || !Array.isArray(envelope.reports)) {
    throw new Error("Report history response did not contain a report list.");
  }
  return envelope.reports.map(parseClientReportRow);
}

/** Valid mutation receipts can render immediately even if the follow-up GET fails. */
export function reportsFromMutationReceipt(value: unknown): ClientReportRow[] {
  const body = object(value);
  if (!body) return [];
  const nested = [body.report, object(body.reality)?.report, object(body.scenario)?.report];
  const byId = new Map<string, ClientReportRow>();
  for (const candidate of nested) {
    if (candidate === undefined) continue;
    try {
      const report = parseClientReportRow(candidate);
      byId.set(report.id, report);
    } catch {
      // The 2xx response is still a persistence receipt. Do not install an
      // invalid row; the validated history refresh remains the fallback.
    }
  }
  return [...byId.values()];
}

export function mergeReportReceipts(current: ClientReportRow[], receipts: ClientReportRow[]): ClientReportRow[] {
  const receiptIds = new Set(receipts.map((row) => row.id));
  return [...receipts, ...current.filter((row) => !receiptIds.has(row.id))].sort((left, right) =>
    new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
    || (left.mode ?? "").localeCompare(right.mode ?? "")
    || right.id.localeCompare(left.id)
  );
}

/** Keep the stable comparison id while its persisted rows remain unreadable. */
export function comparisonAttemptAfterHistoryRefresh<T>(attempt: T, refreshed: boolean): T | null {
  return refreshed ? null : attempt;
}

export function responseErrorMessage(value: unknown, fallback: string): string {
  const body = object(value);
  return typeof body?.error === "string" && body.error.trim() ? body.error : fallback;
}
