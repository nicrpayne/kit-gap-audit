"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readUploadedFile, type ParsedSheet } from "@/lib/client/uploadFile";
import { bettingOddsPhrase } from "@/lib/momentum/compute";
import MomentumChip, { type MomentumData } from "./MomentumChip";
import AskChips from "./AskChips";
import CalibrationLink, { type CalibrationData } from "./CalibrationLink";

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
    estimationContext: string | null;
    notionPageIds: string[];
    figmaRefs: string[];
  };
  notion: {
    docs: { id: string; title: string; chars: number }[];
    warning: string | null;
  };
  figma: {
    refs: { fileName: string; pageName: string; chars: number }[];
    warning: string | null;
  };
  contextDocs: { label: string; chars: number }[];
  likelyDate: string;
  earliestDate: string;
  latestDate: string;
  confidenceAtTarget: number | null;
  momentum: MomentumData | null;
  calibration: CalibrationData;
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
    ai: {
      aiItemCount: number;
      staleCount: number;
      unrelatedExcluded: { id: string; label: string; rationale: string }[];
      flagged: {
        id: string;
        label: string;
        flags: string[];
        rationale: string;
        aiLikelyDays: number;
        teamPoints: number | null;
      }[];
    };
    estimateQuality: {
      aiCount: number;
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

const FLAG_LABELS: Record<string, string> = {
  unclear_scope: "unclear scope",
  bigger_than_pointed: "bigger than your points say",
  smaller_than_pointed: "smaller than your points say",
  hidden_work: "hidden work implied",
};

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
  const [settingsError, setSettingsError] = useState<string | null>(null);

  interface ContextDocRow {
    id: string;
    label: string;
    chars: number;
    createdAt: string;
  }
  const [contextDocs, setContextDocs] = useState<ContextDocRow[]>([]);
  const [newDocLabel, setNewDocLabel] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docSheets, setDocSheets] = useState<ParsedSheet[] | null>(null);
  const [selectedDocSheet, setSelectedDocSheet] = useState("");
  const docFileInputRef = useRef<HTMLInputElement>(null);

  async function onDocFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    setDocsError(null);
    setDocSheets(null);
    try {
      const result = await readUploadedFile(file);
      setNewDocContent(result.text);
      if (!newDocLabel.trim()) setNewDocLabel(file.name.replace(/\.(txt|md|csv|xlsx)$/i, ""));
      if (result.sheets && result.sheets.length > 1) {
        setDocSheets(result.sheets);
        setSelectedDocSheet(result.sheets[0].name);
      }
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  }

  function onDocSheetChange(name: string) {
    setSelectedDocSheet(name);
    const sheet = docSheets?.find((s) => s.name === name);
    if (sheet) setNewDocContent(sheet.text);
  }

  const loadContextDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/context-docs?scopeId=${encodeURIComponent(scopeId)}`);
      if (!res.ok) return;
      const body = await res.json();
      setContextDocs(body.docs ?? []);
    } catch {
      // Non-fatal -- the section just shows as empty.
    }
  }, [scopeId]);

  useEffect(() => {
    loadContextDocs();
  }, [loadContextDocs]);

  async function addContextDoc() {
    if (!newDocLabel.trim() || !newDocContent.trim()) return;
    setAddingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/context-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId, label: newDocLabel.trim(), content: newDocContent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't add that.");
      }
      setNewDocLabel("");
      setNewDocContent("");
      setDocSheets(null);
      await loadContextDocs();
      await load();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setAddingDoc(false);
    }
  }

  async function deleteContextDoc(id: string) {
    setDocsError(null);
    try {
      const res = await fetch(`/api/context-docs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove that.");
      await loadContextDocs();
      await load();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Couldn't remove that.");
    }
  }

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

  const [estimating, setEstimating] = useState(false);
  const [estimateStatus, setEstimateStatus] = useState<string | null>(null);

  async function runAiEstimation() {
    setEstimating(true);
    setEstimateStatus("Reading tickets and estimating — this can take a couple of minutes…");
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Estimation failed.");
      setEstimateStatus(
        `Estimated ${body.estimated} ticket${body.estimated === 1 ? "" : "s"}` +
          (body.cached > 0 ? ` (${body.cached} unchanged, reused)` : "") +
          (body.failed > 0 ? ` — ${body.failed} failed, re-run to retry` : "")
      );
      await load();
    } catch (err) {
      setEstimateStatus(err instanceof Error ? err.message : "Estimation failed.");
    } finally {
      setEstimating(false);
    }
  }

  async function updateScopeSetting(patch: {
    targetDate?: string | null;
    teamCapacity?: number | null;
    includeTriage?: boolean;
    estimationContext?: string | null;
    notionPageUrls?: string[];
    figmaUrls?: string[];
  }) {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/scopes/${scopeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Couldn't save that setting.");
      }
      await load();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Couldn't save that setting.");
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

      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runAiEstimation}
            disabled={estimating}
            className="rounded-md bg-[var(--color-ink)] text-white px-3.5 py-2 text-xs font-medium hover:bg-black disabled:opacity-50"
          >
            {estimating ? "Estimating…" : "Estimate tickets with AI"}
          </button>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {estimateStatus ??
              (breakdown.ai.aiItemCount > 0
                ? `${breakdown.ai.aiItemCount} of ${breakdown.remainingIssueCount} tickets have AI estimates` +
                  (breakdown.ai.staleCount > 0
                    ? ` · ${breakdown.ai.staleCount} changed since — re-run to refresh`
                    : "")
                : "Reads every ticket's content and estimates it directly — no points or labels required.")}
          </span>
        </div>
        <details className="mt-3">
          <summary className="text-xs cursor-pointer select-none text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
            Team &amp; release context the estimator uses
          </summary>
          <textarea
            defaultValue={data.scope.estimationContext ?? ""}
            onBlur={(e) => updateScopeSetting({ estimationContext: e.target.value || null })}
            rows={3}
            placeholder="e.g. Flutter mobile app + Node backend for construction-site safety inspections. 4 full-time devs, a manager covering infra, one part-time consultant. This release is the JSA product only — iTrack tickets are a separate product."
            className="mt-2 w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs leading-relaxed"
          />
          <div className="mt-3">
            <div className="text-xs text-[var(--color-ink-soft)] mb-1">
              Notion requirements / scoping docs (one page URL per line) —{" "}
              {data.notion.docs.length > 0 ? (
                <span className="text-[var(--color-accent-dark)]">
                  {data.notion.docs.length} connected: {data.notion.docs.map((d) => d.title).join(", ")}
                </span>
              ) : (
                "read as estimator context"
              )}
            </div>
            <textarea
              defaultValue={data.scope.notionPageIds.join("\n")}
              onBlur={(e) =>
                updateScopeSetting({ notionPageUrls: e.target.value.split("\n").filter((l) => l.trim()) })
              }
              rows={2}
              placeholder="https://www.notion.so/yourteam/JSA-Requirements-abc123…"
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs leading-relaxed font-mono"
            />
            {data.notion.warning && (
              <div className="text-xs text-[var(--color-danger)] mt-1">{data.notion.warning}</div>
            )}
          </div>
          <div className="mt-3">
            <div className="text-xs text-[var(--color-ink-soft)] mb-1">
              Figma design references (one frame/page URL per line, with a node selected) —{" "}
              {data.figma.refs.length > 0 ? (
                <span className="text-[var(--color-accent-dark)]">
                  {data.figma.refs.length} connected: {data.figma.refs.map((r) => r.pageName).join(", ")}
                </span>
              ) : (
                "read as structural/visual context, weighted below written requirements"
              )}
            </div>
            <textarea
              defaultValue={data.scope.figmaRefs
                .map((r) => {
                  const [fileKey, n1, n2] = r.split(":");
                  return `https://www.figma.com/design/${fileKey}?node-id=${n1}-${n2}`;
                })
                .join("\n")}
              onBlur={(e) =>
                updateScopeSetting({ figmaUrls: e.target.value.split("\n").filter((l) => l.trim()) })
              }
              rows={2}
              placeholder="https://www.figma.com/design/E7gFtwPUmAkCO6bAXewdlG/Power-Portal-Flutter-App?node-id=399-9068…"
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs leading-relaxed font-mono"
            />
            {data.figma.warning && (
              <div className="text-xs text-[var(--color-danger)] mt-1">{data.figma.warning}</div>
            )}
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-[var(--color-ink-soft)]">
                Other context (pasted or uploaded spreadsheets, notes — anything without a live source) —{" "}
                {contextDocs.length > 0
                  ? `${contextDocs.length} added`
                  : "paste or upload a sheet below to use it as estimator context"}
              </div>
              <button
                type="button"
                onClick={() => docFileInputRef.current?.click()}
                disabled={uploadingDoc}
                className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50 whitespace-nowrap"
              >
                {uploadingDoc ? "Reading…" : "Upload .txt / .md / .csv / .xlsx"}
              </button>
              <input
                ref={docFileInputRef}
                type="file"
                accept=".txt,.md,.csv,.xlsx,text/plain,text/markdown,text/csv"
                onChange={onDocFileChange}
                className="hidden"
              />
            </div>
            {docSheets && docSheets.length > 1 && (
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs text-[var(--color-ink-soft)]">Sheet</label>
                <select
                  value={selectedDocSheet}
                  onChange={(e) => onDocSheetChange(e.target.value)}
                  className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
                >
                  {docSheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--color-ink-soft)]">
                  {docSheets.length} sheets found — pick the one that matters
                </span>
              </div>
            )}
            {contextDocs.length > 0 && (
              <ul className="space-y-1 mb-2">
                {contextDocs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 text-xs bg-white border border-[var(--color-line)] rounded-md px-2.5 py-1.5"
                  >
                    <span className="truncate">
                      {doc.label} <span className="text-[var(--color-ink-soft)]">· {doc.chars} chars</span>
                    </span>
                    <button
                      onClick={() => deleteContextDoc(doc.id)}
                      className="text-[var(--color-danger)] hover:underline whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              type="text"
              value={newDocLabel}
              onChange={(e) => setNewDocLabel(e.target.value)}
              placeholder="Label, e.g. JSA task tracker (2026-08-04)"
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs leading-relaxed mb-1.5"
            />
            <textarea
              value={newDocContent}
              onChange={(e) => setNewDocContent(e.target.value)}
              rows={4}
              placeholder="Paste the sheet's rows here (copy from Excel/SharePoint and paste as text) — status, owner, and any effort estimates included are read as team signal alongside Linear."
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs leading-relaxed font-mono"
            />
            <button
              onClick={addContextDoc}
              disabled={addingDoc || !newDocLabel.trim() || !newDocContent.trim()}
              className="mt-1.5 rounded-md bg-[var(--color-ink)] text-white px-3 py-1.5 text-xs font-medium hover:bg-black disabled:opacity-50"
            >
              {addingDoc ? "Adding…" : "Add"}
            </button>
            {docsError && <div className="text-xs text-[var(--color-danger)] mt-1">{docsError}</div>}
          </div>
          {settingsError && (
            <div className="text-xs text-[var(--color-danger)] mt-2">{settingsError}</div>
          )}
        </details>
      </div>

      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-6 mb-6">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] mb-1">
          Likely release date
        </div>
        <div className="font-display text-6xl mb-3">{formatDate(data.likelyDate)}</div>
        {data.confidenceAtTarget !== null && (
          <div className="inline-flex items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)] px-3 py-1 text-xs font-medium mb-5">
            {bettingOddsPhrase(data.confidenceAtTarget)}
          </div>
        )}

        {data.momentum && <MomentumChip momentum={data.momentum} currentConfidence={data.confidenceAtTarget} />}
        <CalibrationLink calibration={data.calibration} />

        <div className="flex items-center gap-4 text-xs text-[var(--color-ink-soft)] mt-5">
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
                  <span className="flex-1 min-w-0 truncate flex items-center gap-1.5">
                    <span aria-hidden className="text-[var(--color-ink-soft)]">
                      🎯
                    </span>
                    {s.label}
                  </span>
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

      <div className="mb-6">
        <AskChips scopeId={scopeId} hasTargetDate={!!data.scope.targetDate} />
      </div>

      {(breakdown.ai.flagged.length > 0 || breakdown.ai.unrelatedExcluded.length > 0) && (
        <details open className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] mb-6">
          <summary className="px-5 py-3 text-sm cursor-pointer select-none font-medium hover:text-[var(--color-accent-dark)]">
            Worth a look — what the estimator noticed
          </summary>
          <div className="px-5 pb-5 pt-1 space-y-4">
            {breakdown.ai.flagged.length > 0 && (
              <div className="divide-y divide-[var(--color-line)]">
                {breakdown.ai.flagged.map((f) => (
                  <div key={f.id} className="py-2.5">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm truncate">{f.label}</span>
                      {f.flags.map((flag) => (
                        <span
                          key={flag}
                          className="text-[10px] uppercase tracking-wide bg-[var(--color-amber-soft)] text-[var(--color-amber)] px-1.5 py-0.5 rounded whitespace-nowrap"
                        >
                          {FLAG_LABELS[flag] ?? flag}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-[var(--color-ink-soft)]">
                      {f.rationale} — AI estimate ~{f.aiLikelyDays}d
                      {f.teamPoints != null && `, your points: ${f.teamPoints}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {breakdown.ai.unrelatedExcluded.length > 0 && (
              <div className="text-xs text-[var(--color-ink-soft)] pt-2 border-t border-[var(--color-line)]">
                <strong className="text-[var(--color-ink)]">
                  {breakdown.ai.unrelatedExcluded.length}
                </strong>{" "}
                ticket{breakdown.ai.unrelatedExcluded.length === 1 ? "" : "s"} judged unrelated to this
                release from their content and left out of the forecast:{" "}
                {breakdown.ai.unrelatedExcluded.map((u) => u.id).join(", ")}. If any of these are wrong,
                fix the ticket description and re-run the estimator.
              </div>
            )}
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
              {breakdown.estimateQuality.aiCount > 0 && (
                <li>
                  <strong className="text-[var(--color-ink)]">{breakdown.estimateQuality.aiCount}</strong>{" "}
                  tickets estimated by AI from their content (used ahead of points where both exist)
                </li>
              )}
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
