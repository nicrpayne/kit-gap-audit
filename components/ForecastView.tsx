"use client";

import { useCallback, useEffect, useState } from "react";
import ConfidenceRing from "./ConfidenceRing";

interface ScenarioRow {
  id: string;
  label: string;
  likelyDate: string;
  deltaDays: number;
  confidenceAtTarget: number | null;
}

interface ForecastData {
  scope: {
    id: string;
    name: string;
    targetDate: string | null;
    teamCapacity: number | null;
    includeTriage: boolean;
  };
  likelyDate: string;
  earliestDate: string;
  latestDate: string;
  confidenceAtTarget: number | null;
  scenarios: ScenarioRow[];
  breakdown: {
    remainingIssueCount: number;
    unticketedFindingCount: number;
    teamCapacity: number;
    teamCapacityInferred: boolean;
    remainingEffortDays: { low: number; likely: number; high: number };
    decisionDelayDays: { low: number; likely: number; high: number };
    blockingGates: { id: string; label: string }[];
    topItems: { id: string; label: string; likelyDays: number }[];
    estimateQuality: {
      pointsIssueCount: number;
      placeholderIssueCount: number;
      hintFindingCount: number;
      placeholderFindingCount: number;
      placeholderEffortSharePct: number;
    };
    composition: {
      triage: number;
      backlog: number;
      unstarted: number;
      started: number;
      completed: number;
      canceled: number;
      excludedTriageCount: number;
    };
  };
}

function confidenceColor(pct: number): string {
  return pct >= 70 ? "var(--color-accent)" : pct >= 35 ? "var(--color-amber)" : "var(--color-danger)";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function ForecastView({ scopeId }: { scopeId: string }) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/forecast?scopeId=${encodeURIComponent(scopeId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't load the forecast.");
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [scopeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateScopeSetting(patch: {
    targetDate?: string | null;
    teamCapacity?: number | null;
    includeTriage?: boolean;
  }) {
    setSavingSettings(true);
    try {
      await fetch(`/api/scopes/${scopeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading && !data) {
    return <div className="text-sm text-[var(--color-ink-soft)]">Running the simulation…</div>;
  }

  if (error) {
    return <div className="text-sm text-[var(--color-danger)]">{error}</div>;
  }

  if (!data) return null;

  const { breakdown } = data;
  const earliestMs = new Date(data.earliestDate).getTime();
  const latestMs = new Date(data.latestDate).getTime();
  const likelyMs = new Date(data.likelyDate).getTime();
  const span = Math.max(1, latestMs - earliestMs);
  const likelyPos = Math.min(100, Math.max(0, ((likelyMs - earliestMs) / span) * 100));

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
          <span>Target date</span>
          <input
            type="date"
            defaultValue={toDateInputValue(data.scope.targetDate)}
            onChange={(e) => updateScopeSetting({ targetDate: e.target.value || null })}
            disabled={savingSettings}
            className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
          />
          <span className="ml-4">Team capacity</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            placeholder={`${breakdown.teamCapacity} (inferred)`}
            defaultValue={data.scope.teamCapacity ?? ""}
            onBlur={(e) =>
              updateScopeSetting({ teamCapacity: e.target.value ? parseFloat(e.target.value) : null })
            }
            disabled={savingSettings}
            className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-xs w-32"
          />
          <label className="ml-4 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={data.scope.includeTriage}
              onChange={(e) => updateScopeSetting({ includeTriage: e.target.checked })}
              disabled={savingSettings}
              className="rounded border-[var(--color-line)]"
            />
            Include Triage tickets
          </label>
        </div>
      </div>

      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] mb-1">
              Likely release date
            </div>
            <div className="font-display text-4xl">{formatDate(data.likelyDate)}</div>
          </div>
          {data.confidenceAtTarget !== null && (
            <div className="flex items-center gap-3">
              <ConfidenceRing percent={data.confidenceAtTarget} />
              <div className="text-sm text-[var(--color-ink-soft)] max-w-[10rem]">
                chance of landing on or before your target date
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-[var(--color-ink-soft)]">
          <span>Earliest {formatDate(data.earliestDate)}</span>
          <div className="flex-1 h-2 rounded-full bg-[var(--color-line)] relative">
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[var(--color-accent)] border-2 border-white shadow"
              style={{ left: `${likelyPos}%` }}
              title={`Likely: ${formatDate(data.likelyDate)}`}
            />
          </div>
          <span>Latest {formatDate(data.latestDate)}</span>
        </div>
      </div>

      {data.scenarios.length > 0 && (
        <details open className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] mb-6">
          <summary className="px-5 py-3 text-sm cursor-pointer select-none font-medium hover:text-[var(--color-accent-dark)]">
            Paths to a sooner date
          </summary>
          <div className="px-5 pb-5 pt-1">
            <p className="text-xs text-[var(--color-ink-soft)] mb-4">
              Each row re-runs the same simulation with one change, so these are directly comparable
              to the date above — use them to decide what to descope, staff, or push to a decision.
            </p>
            <div className="divide-y divide-[var(--color-line)]">
              {data.scenarios.map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-2.5 text-sm">
                  <span className="flex-1 min-w-0 truncate">{s.label}</span>
                  <span className="font-medium whitespace-nowrap">{formatDate(s.likelyDate)}</span>
                  <span
                    className={`text-xs whitespace-nowrap w-16 text-right ${
                      s.deltaDays < 0 ? "text-[var(--color-accent-dark)]" : "text-[var(--color-ink-soft)]"
                    }`}
                  >
                    {s.deltaDays < 0 ? `${s.deltaDays} days` : s.deltaDays === 0 ? "no change" : `+${s.deltaDays} days`}
                  </span>
                  {s.confidenceAtTarget !== null && (
                    <span
                      className="text-xs font-medium w-24 text-right whitespace-nowrap"
                      style={{ color: confidenceColor(s.confidenceAtTarget) }}
                      title="Chance of landing on or before your target date under this scenario"
                    >
                      {s.confidenceAtTarget}% at target
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      <details className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)]">
        <summary className="px-5 py-3 text-sm cursor-pointer select-none text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
          Why this date?
        </summary>
        <div className="px-5 pb-5 pt-1 text-sm text-[var(--color-ink)] space-y-3">
          <p>
            Based on <strong>{breakdown.remainingIssueCount}</strong> open Linear ticket
            {breakdown.remainingIssueCount === 1 ? "" : "s"}
            {breakdown.unticketedFindingCount > 0 && (
              <>
                {" "}
                and <strong>{breakdown.unticketedFindingCount}</strong> finding
                {breakdown.unticketedFindingCount === 1 ? "" : "s"} that don&apos;t have a ticket yet
              </>
            )}
            , split across <strong>{breakdown.teamCapacity}</strong> parallel developer
            {breakdown.teamCapacity === 1 ? "" : "s"}
            {breakdown.teamCapacityInferred && " (inferred from assignees — set your own above for a more accurate date)"}.
          </p>

          <p className="text-xs text-[var(--color-ink-soft)]">
            Everything in this scope right now:{" "}
            {[
              breakdown.composition.triage > 0 ? `${breakdown.composition.triage} in Triage` : null,
              breakdown.composition.backlog > 0 ? `${breakdown.composition.backlog} in Backlog` : null,
              breakdown.composition.unstarted > 0 ? `${breakdown.composition.unstarted} to do` : null,
              breakdown.composition.started > 0 ? `${breakdown.composition.started} in progress` : null,
              breakdown.composition.completed > 0 ? `${breakdown.composition.completed} done` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            .
            {breakdown.composition.excludedTriageCount > 0 && (
              <>
                {" "}
                The <strong className="text-[var(--color-ink)]">{breakdown.composition.excludedTriageCount} Triage</strong>{" "}
                tickets are <strong className="text-[var(--color-ink)]">not counted</strong> in this forecast —
                they haven&apos;t been accepted as real work yet. Tick &ldquo;Include Triage tickets&rdquo; above to
                count them.
              </>
            )}
          </p>

          {breakdown.blockingGates.length > 0 && (
            <p>
              <strong>{breakdown.blockingGates.length}</strong> open blocking decision
              {breakdown.blockingGates.length === 1 ? "" : "s"}{" "}
              {breakdown.blockingGates.length === 1 ? "adds" : "add"} uncertainty on top of that, since work
              can&apos;t finish until they&apos;re resolved:{" "}
              {breakdown.blockingGates.map((g) => g.label).join("; ")}.
            </p>
          )}

          {breakdown.topItems.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                Largest contributors
              </div>
              <ul className="space-y-1">
                {breakdown.topItems.map((item) => (
                  <li key={item.id} className="flex justify-between text-xs">
                    <span className="text-[var(--color-ink-soft)] truncate pr-4">{item.label}</span>
                    <span>~{item.likelyDays}d</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--color-line)]">
            <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
              Where the estimates come from
            </div>
            <ul className="space-y-1 text-xs text-[var(--color-ink-soft)]">
              <li>
                <strong className="text-[var(--color-ink)]">{breakdown.estimateQuality.pointsIssueCount}</strong>{" "}
                tickets with a real Linear estimate
              </li>
              {breakdown.estimateQuality.hintFindingCount > 0 && (
                <li>
                  <strong className="text-[var(--color-ink)]">{breakdown.estimateQuality.hintFindingCount}</strong>{" "}
                  findings with a day range from the audit
                </li>
              )}
              {(breakdown.estimateQuality.placeholderIssueCount > 0 ||
                breakdown.estimateQuality.placeholderFindingCount > 0) && (
                <li>
                  <strong className="text-[var(--color-ink)]">
                    {breakdown.estimateQuality.placeholderIssueCount + breakdown.estimateQuality.placeholderFindingCount}
                  </strong>{" "}
                  items with no estimate at all — carried as deliberately wide guesses, and together they
                  make up{" "}
                  <strong className="text-[var(--color-ink)]">
                    {breakdown.estimateQuality.placeholderEffortSharePct}%
                  </strong>{" "}
                  of the projected effort. Estimating these is usually the fastest way to tighten this
                  date range.
                </li>
              )}
            </ul>
          </div>

          <p className="text-xs text-[var(--color-ink-soft)] pt-2 border-t border-[var(--color-line)]">
            Everything above is computed from this team&apos;s own tickets and findings — no generic
            industry benchmarks are baked in, because &ldquo;apps like this take N weeks&rdquo; figures
            aren&apos;t reliable enough to price a date on. As completed-ticket history accumulates,
            the day-per-point conversion can be calibrated to this team&apos;s actual pace, which is
            the credible version of that idea.
          </p>
        </div>
      </details>
    </div>
  );
}
