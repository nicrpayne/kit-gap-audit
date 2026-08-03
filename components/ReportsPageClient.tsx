"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ReportView, { CopyMarkdownButton } from "./ReportView";

interface ScopeOption {
  id: string;
  name: string;
}

interface ReportRow {
  id: string;
  generatedAt: string;
  likelyDate: string;
  confidenceAtTarget: number | null;
  likelyDateDeltaDays: number | null;
  shippedCount: number;
  blockingCount: number;
  resolvedSinceLastCount: number;
  summaryMarkdown: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ReportsPageClient() {
  const [scopes, setScopes] = useState<ScopeOption[] | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scopes")
      .then((res) => res.json())
      .then((body) => {
        setScopes(body.scopes);
        if (body.scopes[0]) setScopeId(body.scopes[0].id);
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

  async function generate() {
    if (!scopeId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId }),
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
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
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
          className="rounded-md bg-[var(--color-accent)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate report"}
        </button>
        {selected && <CopyMarkdownButton markdown={selected.summaryMarkdown} />}
      </div>

      {error && <div className="text-sm text-[var(--color-danger)] mb-4">{error}</div>}

      <div className="grid grid-cols-[1fr_16rem] gap-6 items-start">
        <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-6">
          {selected ? (
            <ReportView markdown={selected.summaryMarkdown} />
          ) : (
            <div className="text-sm text-[var(--color-ink-soft)] py-8 text-center">
              No reports yet for this scope — click &ldquo;Generate report&rdquo;.
            </div>
          )}
        </div>

        {reports && reports.length > 0 && (
          <div>
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
                      ? "bg-[var(--color-ink)] text-white"
                      : "border border-[var(--color-line)] hover:bg-black/5"
                  }`}
                >
                  <div className="font-medium">{formatDate(r.generatedAt)}</div>
                  <div className={selected?.id === r.id ? "text-white/70" : "text-[var(--color-ink-soft)]"}>
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
