"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "@/components/instrument/SignalLink";
import ReportView, { CopyMarkdownButton } from "./ReportView";
import DecisionBriefView from "./DecisionBriefView";
import MomentumChip from "./MomentumChip";
import { computeMomentum } from "@/lib/momentum/compute";
import { reportAttributionSentence } from "@/lib/momentum/attribution";
import { describeSnapshot, withSnapshotProvenance } from "@/lib/reports/snapshot";
import { useProjectParam } from "@/lib/shell/useProjectParam";
import { isDecisionBriefV1, type DecisionBriefV1 } from "@/lib/reports/decisionBrief";
import { renderDecisionBriefPlainText } from "@/lib/reports/decisionBriefRender";
import AudienceBriefView from "./reports/AudienceBriefView";
import { AUDIENCE_LABELS, PURPOSE_LABELS, buildBriefRecipe, isBriefRecipeV1, type AudienceLens, type BriefPurpose, type BriefRecipeV1 } from "@/lib/reports/composer";
import { renderAudienceBriefPlainText } from "@/lib/reports/audienceBriefRender";

/** The live forecast is a comparison input, not report data. Three states,
    because "we could not resolve it" must be distinguishable from "it
    agrees" — collapsing them is how a stale report starts looking current. */
type LiveForecast =
  | { state: "loading" }
  | { state: "ready"; likelyDate: string; confidenceAtTarget: number | null }
  | { state: "error"; reason: string };

interface ScopeOption {
  id: string;
  name: string;
}

interface ReportRow {
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
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ReportsPageClient() {
  const [scopes, setScopes] = useState<ScopeOption[] | null>(null);
  // The URL owns the selection (lib/shell/useProjectParam), so refresh,
  // back/forward and a pasted link all reproduce it.
  const { projectId: scopeId, select: setScopeId } = useProjectParam(
    scopes ? scopes.map((s) => s.id) : null
  );
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveForecast | null>(null);
  const [audience, setAudience] = useState<AudienceLens>("delivery-leadership");
  const [purpose, setPurpose] = useState<BriefPurpose>("weekly-update");
  const selectedBrief = useMemo<DecisionBriefV1 | null>(
    () => selected && isDecisionBriefV1(selected.briefSnapshot) ? selected.briefSnapshot : null,
    [selected]
  );
  const selectedRecipe = useMemo<BriefRecipeV1 | null>(
    () => selected && isBriefRecipeV1(selected.briefRecipe) ? selected.briefRecipe : null,
    [selected]
  );

  // Momentum for the selected report: comparison is against the report
  // immediately BEFORE it chronologically (`reports` is sorted newest
  // first, so that's the next array entry) -- not necessarily the very
  // latest report, so browsing history shows each report's own momentum
  // at the time, not always "vs. today". Uses only fields already on the
  // fetched Report rows (see reportAttributionSentence) -- no extra
  // network calls, per the brief's "mostly free" expectation for this page.
  const momentum = useMemo(() => {
    if (!selected || !reports) return null;
    const index = reports.findIndex((r) => r.id === selected.id);
    const previous = index >= 0 ? reports[index + 1] : undefined;
    if (!previous) return null;
    const m = computeMomentum(
      { generatedAt: new Date(selected.generatedAt), likelyDate: new Date(selected.likelyDate), confidenceAtTarget: selected.confidenceAtTarget },
      { generatedAt: new Date(previous.generatedAt), likelyDate: new Date(previous.likelyDate), confidenceAtTarget: previous.confidenceAtTarget }
    );
    return {
      ...m,
      previousGeneratedAt: previous.generatedAt,
      attribution: reportAttributionSentence(selected),
      sparkline: [...reports]
        .reverse()
        .map((r) => ({ generatedAt: r.generatedAt, likelyDate: r.likelyDate, targetDate: r.targetDate })),
    };
  }, [selected, reports]);

  useEffect(() => {
    fetch("/api/scopes")
      .then((res) => res.json())
      .then((body) => {
        // Deliberately does NOT choose a project here. The URL decides,
        // with a deterministic fallback to the first — otherwise whichever
        // fetch resolved first would silently win, which is exactly the
        // bug QA found.
        setScopes(body.scopes);
      });
  }, []);

  const loadReports = useCallback(async (id: string) => {
    const res = await fetch(`/api/reports?scopeId=${encodeURIComponent(id)}`);
    const body = await res.json();
    setReports(body.reports);
    setSelected(body.reports[0] ?? null);
  }, []);

  useEffect(() => {
    if (scopeId) loadReports(scopeId);
  }, [scopeId, loadReports]);

  // THE LIVE FORECAST, FOR COMPARISON ONLY. A stored report cannot say
  // whether it is still true; only the current forecast can. Fetched once
  // per scope and never written back — reports are immutable snapshots and
  // nothing here regenerates or mutates one.
  useEffect(() => {
    if (!scopeId) {
      setLive(null);
      return;
    }
    let cancelled = false;
    setLive({ state: "loading" });
    fetch(`/api/forecast?scopeId=${encodeURIComponent(scopeId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `forecast unavailable (${res.status})`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setLive({ state: "ready", likelyDate: body.likelyDate, confidenceAtTarget: body.confidenceAtTarget ?? null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLive({ state: "error", reason: err instanceof Error ? err.message : "unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, [scopeId]);

  // What the selected report is, relative to now. Null when nothing is
  // selected; otherwise always present, because "we could not check" is
  // itself a verdict a reader is entitled to (see lib/reports/snapshot).
  const snapshot = useMemo(() => {
    if (!selected) return null;
    return describeSnapshot({
      generatedAt: new Date(selected.generatedAt),
      snapshotLikelyDate: new Date(selected.likelyDate),
      liveLikelyDate: live?.state === "ready" ? new Date(live.likelyDate) : null,
      liveUnavailableReason: live?.state === "error" ? live.reason : live?.state === "loading" ? "still loading" : null,
    });
  }, [selected, live]);

  async function generate() {
    if (!scopeId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId, recipe: buildBriefRecipe(audience, purpose) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't generate report.");
      await loadReports(scopeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  if (scopes === null) {
    return <div className="text-sm text-[var(--color-ink-soft)]">Loading…</div>;
  }

  if (scopes.length === 0) {
    return (
      <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
        No Scope configured yet.{" "}
        <Link href="/scopes" className="text-[var(--color-accent)] hover:underline">
          Add one
        </Link>{" "}
        to generate a report.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {scopes.length > 1 && (
          <select
            value={scopeId ?? ""}
            onChange={(e) => setScopeId(e.target.value)}
            className="rounded-md border border-[var(--i-border)] bg-[var(--i-panel)] px-3 py-2 text-sm text-[var(--i-text)]"
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={generate}
          disabled={generating || !scopeId}
          className="i-btn-primary px-4 py-2 text-sm"
        >
          {generating ? "Generating…" : "Generate report"}
        </button>
        <select value={audience} onChange={(event) => setAudience(event.target.value as AudienceLens)} className="rounded-md border border-[var(--i-border)] bg-[var(--i-panel)] px-3 py-2 text-xs text-[var(--i-text)]" aria-label="Brief audience">
          {Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={purpose} onChange={(event) => setPurpose(event.target.value as BriefPurpose)} className="rounded-md border border-[var(--i-border)] bg-[var(--i-panel)] px-3 py-2 text-xs text-[var(--i-text)]" aria-label="Brief purpose">
          {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {/* The copied text carries the snapshot's provenance with it. A
            report leaves Signal through this button and is read somewhere
            Signal cannot annotate, so the warning has to travel inside the
            text rather than live beside it on screen. */}
        {selected && snapshot && <CopyMarkdownButton markdown={withSnapshotProvenance(selected.summaryMarkdown, snapshot)} label="Copy Markdown" />}
        {selectedBrief && <CopyMarkdownButton markdown={selectedRecipe ? renderAudienceBriefPlainText(selectedBrief, selectedRecipe) : renderDecisionBriefPlainText(selectedBrief)} label="Copy plain text" />}
        {process.env.NODE_ENV !== "production" && <a href="/reports/composer/fixture" className="report-no-print rounded-md border border-[var(--i-border)] px-3 py-1.5 text-xs text-[var(--i-signal)]">Open composer prototype</a>}
        {selected && <a href={`/reports/${encodeURIComponent(selected.id)}/print`} target="_blank" rel="noreferrer" className="report-no-print rounded-md border border-[var(--i-border)] px-3 py-1.5 text-xs text-[var(--i-text-soft)] hover:bg-white/5">Print view</a>}
        {live?.state === "ready" && <span className="report-no-print ml-auto text-[10px] uppercase tracking-wider text-[var(--i-mint)]">Current live comparison · {formatDate(live.likelyDate)}</span>}
      </div>

      {error && <div className="text-sm text-[var(--i-red)] mb-4">{error}</div>}

      <div className="grid grid-cols-[minmax(0,1fr)_18rem] gap-6 items-start reports-layout">
        <div className="border border-[var(--i-border)] rounded-xl bg-[var(--i-panel)] p-6">
          {selected ? (
            <>
              {/* WHAT THIS IS, BEFORE WHAT IT SAYS. A stored report is a
                  historical artifact; presenting it in a frame that reads
                  as current is how a five-week-old date gets emailed to a
                  leadership team. Amber when the live forecast has moved
                  far enough to mislead. */}
              {snapshot && (
                <div
                  data-shoot="report-snapshot-banner"
                  className="mb-5 rounded-lg border px-4 py-3"
                  style={{
                    borderColor: snapshot.stale ? "var(--color-amber)" : "var(--color-line)",
                    background: snapshot.stale ? "var(--color-amber-soft)" : "transparent",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-amber)]">
                      Historical snapshot
                    </span>
                    {snapshot.stale && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-danger)]">
                        Live forecast has moved
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink)]">{snapshot.line}</p>
                </div>
              )}
              {momentum && <div className="report-no-print"><MomentumChip momentum={momentum} currentConfidence={selected.confidenceAtTarget} /></div>}
              {selectedBrief && selectedRecipe ? <AudienceBriefView brief={selectedBrief} recipe={selectedRecipe} /> : selectedBrief ? <DecisionBriefView brief={selectedBrief} /> : (
                <>
                  <div className="mb-4 rounded border border-[var(--i-amber)] bg-[var(--i-amber-soft)] px-3 py-2 text-xs text-[var(--i-amber)]">Legacy immutable report · retained exactly as generated. It is not promoted into the DecisionBriefV1 semantic model.</div>
                  <ReportView markdown={selected.summaryMarkdown} />
                </>
              )}
            </>
          ) : (
            <div className="text-sm text-[var(--color-ink-soft)] py-8 text-center">
              No reports yet for this scope — click &ldquo;Generate report&rdquo;.
            </div>
          )}
        </div>

        {reports && reports.length > 0 && (
          <div className="report-no-print">
            <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
              History
            </div>
            <div className="space-y-1">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                    selected?.id === r.id
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-ink)] border border-[var(--color-accent)]"
                      : "border border-[var(--color-line)] hover:bg-black/5"
                  }`}
                >
                  <div className="font-medium">{formatDate(r.generatedAt)}</div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wider">{isBriefRecipeV1(r.briefRecipe) ? `${AUDIENCE_LABELS[r.briefRecipe.audience]} brief` : r.briefVersion ? "Decision Brief V1" : "Legacy snapshot"} · {r.mode ?? "historical"}</div>
                  <div className={selected?.id === r.id ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]"}>
                    {formatDate(r.likelyDate)}
                    {r.confidenceAtTarget !== null && ` · ${r.confidenceAtTarget}%`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
